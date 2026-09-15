import { performance } from "node:perf_hooks";

import { describe, expect, it } from "vitest";

import { RiskScoringEngine } from "../../scoring/src/index.js";

import {
  ProviderError,
  runEvaluationSuite,
  type EvaluationResult,
  type EvaluationSuite,
  type Evaluator,
  type LlmProvider,
  type ProjectConfig,
} from "../src/index.js";

const caseCount = 500;
const cases: EvaluationSuite["cases"] = Array.from({ length: caseCount }, (_, index) => ({
  id: `PERF_${String(index + 1).padStart(3, "0")}`,
  name: `Performance case ${index + 1}`,
  category: "performance",
  severity: "MEDIUM" as const,
  tags: ["synthetic"],
  input: { user: "Return OK", variables: {} },
  expected: { exact: "OK" },
  evaluators: [{ id: "exact", type: "exact_match", required: true, weight: 1, config: {} }],
}));
const suite: EvaluationSuite = {
  schemaVersion: "1.0",
  id: "performance-suite",
  name: "Performance suite",
  cases,
};
const config: ProjectConfig = {
  schemaVersion: "1.0",
  project: { id: "performance", name: "Performance" },
  target: { provider: "mock", model: "in-memory" },
  execution: { concurrency: 16, timeoutMs: 1_000, maxRetries: 0, collectAllEvidence: false },
  qualityGate: {
    minimumPassRate: 0,
    minimumScore: 0,
    maximumErrorRate: 1,
    blockOnCriticalFailure: true,
    maximumCategoryRegressionPoints: 3,
    warningCountsAsPass: false,
    reviewThreshold: 0.7,
  },
  output: { directory: "reports", formats: ["json"], retainRawResponses: false },
};
function evaluator(completedAt?: Map<string, number>): Evaluator<unknown> {
  return {
    id: "exact_match",
    kind: "DETERMINISTIC",
    async evaluate(input): Promise<EvaluationResult> {
      completedAt?.set(input.testCase.id, performance.now());
      return {
        evaluatorId: "exact_match",
        kind: "DETERMINISTIC",
        verdict: "PASS",
        score: 1,
        reason: "Matched",
        durationMs: 0,
      };
    },
  };
}
const dependencies = {
  createRunId: () => "performance-run",
  logEvent: async () => undefined,
};

function provider(failingCase?: string, startedAt?: Map<string, number>): LlmProvider {
  return {
    id: "mock",
    async generate(_request, context) {
      startedAt?.set(context.caseId, performance.now());
      if (context.caseId === failingCase) {
        throw new ProviderError({
          code: "INJECTED_FAULT",
          safeMessage: "Injected benchmark fault",
          retryable: false,
        });
      }
      return {
        text: "OK",
        usage: {},
        latencyMs: 0,
        resolvedProvider: "mock",
        resolvedModel: "in-memory",
      };
    },
  };
}

describe("500-case runner benchmark", () => {
  it("keeps internal processing below 100 ms per case", async () => {
    const startedAt = new Map<string, number>();
    const completedAt = new Map<string, number>();
    const artifact = await runEvaluationSuite(
      {
        config,
        suite,
        provider: provider(undefined, startedAt),
        evaluators: new Map([["exact_match", evaluator(completedAt)]]),
        scoring: new RiskScoringEngine(),
      },
      dependencies,
    );
    const durations = cases
      .map((item) => (completedAt.get(item.id) ?? Infinity) - (startedAt.get(item.id) ?? 0))
      .sort((left, right) => left - right);
    const p95Milliseconds = durations[Math.ceil(durations.length * 0.95) - 1] ?? Infinity;

    expect(artifact.cases).toHaveLength(caseCount);
    expect(artifact.metrics.passedCases).toBe(caseCount);
    expect(p95Milliseconds).toBeLessThan(100);
  });

  it("preserves all results and input order when one case fails operationally", async () => {
    const artifact = await runEvaluationSuite(
      {
        config,
        suite,
        provider: provider("PERF_250"),
        evaluators: new Map([["exact_match", evaluator()]]),
        scoring: new RiskScoringEngine(),
      },
      dependencies,
    );

    expect(artifact.cases).toHaveLength(caseCount);
    expect(artifact.metrics.errorCases).toBe(1);
    expect(artifact.cases.map((item) => item.caseId)).toEqual(cases.map((item) => item.id));
    expect(artifact.cases[249]).toMatchObject({
      caseId: "PERF_250",
      verdict: "ERROR",
      errorCode: "INJECTED_FAULT",
    });
  });
});
