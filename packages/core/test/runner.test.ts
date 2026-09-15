import { describe, expect, it } from "vitest";

import {
  ARTIFACT_SCHEMA_VERSION,
  ProviderError,
  runEvaluationSuite,
  type EvaluationResult,
  type EvaluationSuite,
  type Evaluator,
  type LlmProvider,
  type ProjectConfig,
  type ScoringEngine,
} from "../src/index.js";

const config: ProjectConfig = {
  schemaVersion: "1.0",
  project: { id: "demo", name: "Demo" },
  target: { provider: "mock", model: "fixture-v1" },
  execution: {
    concurrency: 4,
    timeoutMs: 30_000,
    maxRetries: 2,
    collectAllEvidence: false,
  },
  qualityGate: {
    minimumPassRate: 0.9,
    minimumScore: 0.7,
    maximumErrorRate: 0.02,
    blockOnCriticalFailure: true,
    maximumCategoryRegressionPoints: 3,
    warningCountsAsPass: false,
    reviewThreshold: 0.7,
  },
  output: { directory: "reports", formats: ["json"], retainRawResponses: false },
};
const suite: EvaluationSuite = {
  schemaVersion: "1.0",
  id: "demo-suite",
  name: "Demo suite",
  cases: [
    {
      id: "CASE_001",
      name: "Case",
      category: "general",
      severity: "HIGH",
      tags: [],
      input: { user: "Question", variables: {} },
      expected: { exact: "Answer" },
      evaluators: [
        { id: "exact-answer", type: "exact_match", required: true, weight: 1, config: {} },
      ],
    },
  ],
};
const scoring: ScoringEngine = {
  aggregateCase(results) {
    return { verdict: results[0]?.verdict ?? "ERROR" };
  },
  buildRunArtifact(metadata, cases) {
    const hasError = cases.some((testCase) => testCase.verdict === "ERROR");
    return {
      artifactSchemaVersion: ARTIFACT_SCHEMA_VERSION,
      metadata,
      status: hasError ? "OPERATIONAL_FAILED" : "PASSED",
      metrics: {
        selectedCases: cases.length,
        executableCases: hasError ? 0 : cases.length,
        passedCases: hasError ? 0 : cases.length,
        failedCases: 0,
        warningCases: 0,
        errorCases: hasError ? cases.length : 0,
        passRate: hasError ? 0 : 1,
        errorRate: hasError ? 1 : 0,
        categories: [],
      },
      gateFailures: [],
      cases,
    };
  },
};
const evaluator: Evaluator<unknown> = {
  id: "exact_match",
  kind: "DETERMINISTIC",
  async evaluate(): Promise<EvaluationResult> {
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
const dependencies = {
  now: (() => {
    const dates = [new Date("2026-09-15T00:00:00.000Z"), new Date("2026-09-15T00:00:01.000Z")];
    return () => dates.shift() ?? new Date("2026-09-15T00:00:01.000Z");
  })(),
  createRunId: () => "run_001",
};

describe("runEvaluationSuite", () => {
  it("runs cases sequentially and returns reproducible metadata", async () => {
    const provider: LlmProvider = {
      id: "mock",
      async generate(request) {
        return {
          text: "Answer",
          usage: {},
          latencyMs: 0,
          resolvedProvider: "mock",
          resolvedModel: request.target.model,
        };
      },
    };

    const artifact = await runEvaluationSuite(
      {
        config,
        suite,
        provider,
        evaluators: new Map([["exact_match", evaluator]]),
        scoring,
      },
      dependencies,
    );

    expect(artifact.status).toBe("PASSED");
    expect(artifact.metadata).toMatchObject({
      runId: "run_001",
      startedAt: "2026-09-15T00:00:00.000Z",
      completedAt: "2026-09-15T00:00:01.000Z",
    });
    expect(artifact.metadata.configHash).toHaveLength(64);
    expect(artifact.metadata.suiteHash).toHaveLength(64);
    expect(artifact.cases[0]?.evaluations[0]?.evaluatorId).toBe("exact-answer");
  });

  it("records missing evaluators and provider failures as operational errors", async () => {
    const successProvider: LlmProvider = {
      id: "mock",
      async generate() {
        return {
          text: "Answer",
          usage: {},
          latencyMs: 0,
          resolvedProvider: "mock",
          resolvedModel: "fixture-v1",
        };
      },
    };
    const failingProvider: LlmProvider = {
      id: "mock",
      async generate() {
        throw new ProviderError({
          code: "MOCK_FAILURE",
          safeMessage: "Mock failure",
          retryable: false,
        });
      },
    };
    const freshDependencies = {
      now: () => new Date("2026-09-15T00:00:00.000Z"),
      createRunId: () => "run_002",
    };

    const missingEvaluator = await runEvaluationSuite(
      { config, suite, provider: successProvider, evaluators: new Map(), scoring },
      freshDependencies,
    );
    const providerFailure = await runEvaluationSuite(
      {
        config,
        suite,
        provider: failingProvider,
        evaluators: new Map([["exact_match", evaluator]]),
        scoring,
      },
      freshDependencies,
    );

    expect(missingEvaluator.cases[0]?.evaluations[0]).toMatchObject({
      verdict: "ERROR",
      evaluatorId: "exact-answer",
    });
    expect(providerFailure.cases[0]).toMatchObject({
      verdict: "ERROR",
      errorCode: "MOCK_FAILURE",
    });
  });
});
