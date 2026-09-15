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

const config: ProjectConfig = {
  schemaVersion: "1.0",
  project: { id: "execution", name: "Execution" },
  target: { provider: "mock", model: "fixture" },
  execution: {
    concurrency: 2,
    timeoutMs: 100,
    maxRetries: 1,
    collectAllEvidence: false,
  },
  qualityGate: {
    minimumPassRate: 0,
    minimumScore: 0,
    maximumErrorRate: 1,
    blockOnCriticalFailure: false,
    maximumCategoryRegressionPoints: 100,
    warningCountsAsPass: false,
    reviewThreshold: 0.7,
  },
  output: { directory: "reports", formats: ["json"], retainRawResponses: false },
};

const suite: EvaluationSuite = {
  schemaVersion: "1.0",
  id: "execution",
  name: "Execution",
  cases: Array.from({ length: 4 }, (_, index) => ({
    id: `CASE_${index}`,
    name: `Case ${index}`,
    category: "general",
    severity: "LOW" as const,
    tags: [],
    input: { user: `Question ${index}`, variables: {} },
    evaluators: [{ id: "pass", type: "pass", required: true, weight: 1, config: {} }],
  })),
};

const passEvaluator: Evaluator<unknown> = {
  id: "pass",
  kind: "DETERMINISTIC",
  async evaluate(): Promise<EvaluationResult> {
    return {
      evaluatorId: "pass",
      kind: "DETERMINISTIC",
      verdict: "PASS",
      reason: "pass",
      durationMs: 0,
    };
  },
};

function generation(caseId: string, cost?: number) {
  return {
    text: caseId,
    usage: { ...(cost === undefined ? {} : { estimatedCostUsd: cost }) },
    latencyMs: 1,
    resolvedProvider: "mock",
    resolvedModel: "fixture",
  };
}

const dependencies = {
  now: () => new Date("2026-09-15T00:00:00.000Z"),
  createRunId: () => "run_execution",
  retry: { sleep: async () => undefined, random: () => 0 },
};

describe("runner execution policy", () => {
  it("enforces provider concurrency and preserves canonical case order", async () => {
    let inFlight = 0;
    let maximumInFlight = 0;
    const provider: LlmProvider = {
      id: "mock",
      maxConcurrency: 1,
      async generate(_request, context) {
        inFlight += 1;
        maximumInFlight = Math.max(maximumInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 2));
        inFlight -= 1;
        return generation(context.caseId);
      },
    };
    const artifact = await runEvaluationSuite(
      {
        config,
        suite,
        provider,
        evaluators: new Map([["pass", passEvaluator]]),
        scoring: new RiskScoringEngine(),
      },
      dependencies,
    );
    expect(maximumInFlight).toBe(1);
    expect(artifact.cases.map(({ caseId }) => caseId)).toEqual([
      "CASE_0",
      "CASE_1",
      "CASE_2",
      "CASE_3",
    ]);
  });

  it("retries transient failures with incrementing attempt IDs", async () => {
    const attempts: string[] = [];
    const provider: LlmProvider = {
      id: "mock",
      async generate(_request, context) {
        attempts.push(context.attemptId);
        if (context.attemptId.endsWith("attempt_1")) {
          throw new ProviderError({
            code: "PROVIDER_RATE_LIMITED",
            safeMessage: "retry",
            retryable: true,
          });
        }
        return generation(context.caseId);
      },
    };
    const artifact = await runEvaluationSuite(
      {
        config: { ...config, execution: { ...config.execution, concurrency: 1 } },
        suite: { ...suite, cases: suite.cases.slice(0, 1) },
        provider,
        evaluators: new Map([["pass", passEvaluator]]),
        scoring: new RiskScoringEngine(),
      },
      dependencies,
    );
    expect(attempts).toEqual(["CASE_0_attempt_1", "CASE_0_attempt_2"]);
    expect(artifact.cases[0]?.verdict).toBe("PASS");
    expect(artifact.cases[0]?.generation?.attemptCount).toBe(2);
  });

  it("stops new scheduling at the cost budget and retains a partial artifact", async () => {
    const calls: string[] = [];
    const provider: LlmProvider = {
      id: "mock",
      async generate(_request, context) {
        calls.push(context.caseId);
        return generation(context.caseId, 0.01);
      },
    };
    const artifact = await runEvaluationSuite(
      {
        config: {
          ...config,
          execution: { ...config.execution, concurrency: 1, maxEstimatedCostUsd: 0.02 },
        },
        suite,
        provider,
        evaluators: new Map([["pass", passEvaluator]]),
        scoring: new RiskScoringEngine(),
      },
      dependencies,
    );
    expect(calls).toEqual(["CASE_0", "CASE_1"]);
    expect(artifact.status).toBe("OPERATIONAL_FAILED");
    expect(artifact.cases.map(({ errorCode }) => errorCode)).toEqual([
      undefined,
      undefined,
      "BUDGET_EXHAUSTED",
      "BUDGET_EXHAUSTED",
    ]);
    expect(artifact.gateFailures).toContainEqual(
      expect.objectContaining({ code: "BUDGET_EXHAUSTED", affectedCaseIds: ["CASE_2", "CASE_3"] }),
    );
  });
});
