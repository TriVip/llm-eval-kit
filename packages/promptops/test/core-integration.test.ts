import { describe, expect, it } from "vitest";

import {
  ARTIFACT_SCHEMA_VERSION,
  runEvaluationSuite,
  type EvaluationResult,
  type EvaluationSuite,
  type Evaluator,
  type GenerationRequest,
  type LlmProvider,
  type ProjectConfig,
  type ScoringEngine,
} from "../../core/src/index.js";

import { hashPromptTemplate, promptRenderer, type PromptTemplate } from "../src/index.js";

const config: ProjectConfig = {
  schemaVersion: "1.0",
  project: { id: "promptops", name: "PromptOps" },
  target: { provider: "mock", model: "fixture" },
  execution: { concurrency: 1, timeoutMs: 1_000, maxRetries: 0, collectAllEvidence: true },
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
  id: "promptops-suite",
  name: "PromptOps suite",
  cases: [
    {
      id: "CASE_001",
      name: "Order status",
      category: "support",
      severity: "HIGH",
      tags: [],
      input: {
        user: "Where is order 42?",
        context: "Order 42 is in transit.",
        variables: { locale: "vi-VN" },
      },
      evaluators: [{ id: "pass", type: "pass", required: true, weight: 1, config: {} }],
    },
  ],
};
const evaluator: Evaluator<unknown> = {
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
const scoring: ScoringEngine = {
  aggregateCase: () => ({ verdict: "PASS", score: 1 }),
  buildRunArtifact(metadata, cases) {
    return {
      artifactSchemaVersion: ARTIFACT_SCHEMA_VERSION,
      metadata,
      status: "PASSED",
      metrics: {
        selectedCases: cases.length,
        executableCases: cases.length,
        passedCases: cases.length,
        failedCases: 0,
        warningCases: 0,
        errorCases: 0,
        passRate: 1,
        errorRate: 0,
        categories: [],
        usageCoverage: 0,
        costCoverage: 0,
      },
      gateFailures: [],
      cases,
    };
  },
};
const dependencies = {
  now: () => new Date("2026-09-22T00:00:00.000Z"),
  createRunId: () => "run_promptops",
};

function captureProvider(requests: GenerationRequest[]): LlmProvider {
  return {
    id: "mock",
    async generate(request) {
      requests.push(request);
      return {
        text: "Order 42 is in transit.",
        usage: {},
        latencyMs: 0,
        resolvedProvider: "mock",
        resolvedModel: "fixture",
      };
    },
  };
}

describe("PromptOps core renderer integration", () => {
  it("keeps the legacy generation request and artifact metadata unchanged by default", async () => {
    const requests: GenerationRequest[] = [];
    const artifact = await runEvaluationSuite(
      {
        config,
        suite,
        provider: captureProvider(requests),
        evaluators: new Map([["pass", evaluator]]),
        scoring,
      },
      dependencies,
    );
    expect(requests[0]).toEqual({
      user: "Where is order 42?",
      context: "Order 42 is in transit.",
      variables: { locale: "vi-VN" },
      target: config.target,
    });
    expect(artifact.metadata).not.toHaveProperty("promptHash");
  });

  it("renders a published prompt and records its exact canonical hash", async () => {
    const template: PromptTemplate = {
      schemaVersion: "1.0",
      system: "Answer in {{variables.locale}}.",
      user: "{{input.user}} Context: {{input.context}}",
      declaredVariables: ["locale"],
    };
    const promptHash = hashPromptTemplate(template);
    const requests: GenerationRequest[] = [];
    const artifact = await runEvaluationSuite(
      {
        config,
        suite,
        provider: captureProvider(requests),
        evaluators: new Map([["pass", evaluator]]),
        scoring,
        requestRenderer: {
          promptHash,
          render: (testCase) => promptRenderer.render(template, testCase),
        },
      },
      dependencies,
    );
    expect(requests[0]).toEqual({
      system: "Answer in vi-VN.",
      user: "Where is order 42? Context: Order 42 is in transit.",
      context: "Order 42 is in transit.",
      variables: { locale: "vi-VN" },
      target: config.target,
    });
    expect(artifact.metadata.promptHash).toBe(promptHash);
    expect(artifact.artifactSchemaVersion).toBe("1.0");
  });
});
