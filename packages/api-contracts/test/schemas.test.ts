import { describe, expect, it } from "vitest";

import {
  experimentPlanSchema,
  humanDecisionRequestSchema,
  promptCreateRequestSchema,
  promptOpsEventSchema,
  promptOpsProblemSchema,
  runSessionSnapshotSchema,
  safeRunEventSchema,
  studioProblemSchema,
  studioRunRequestSchema,
} from "../src/index.js";

describe("Studio API contracts", () => {
  it("accepts ID-based run requests with bounded overrides", () => {
    expect(
      studioRunRequestSchema.parse({
        projectId: "ecommerce-support",
        targetId: "mock",
        suiteId: "main",
        fixtureSetId: "passing",
        filters: { caseIds: ["REFUND_001"] },
        executionOverrides: { concurrency: 2, timeoutMs: 1000 },
      }),
    ).toMatchObject({ targetId: "mock", suiteId: "main" });
  });

  it("rejects browser-supplied paths, endpoints, keys, and models", () => {
    for (const field of ["path", "endpoint", "apiKey", "model"] as const) {
      expect(
        studioRunRequestSchema.safeParse({
          projectId: "project",
          targetId: "target",
          suiteId: "suite",
          [field]: "forbidden",
        }).success,
      ).toBe(false);
    }
  });

  it("requires safe, versioned problems and events", () => {
    expect(
      studioProblemSchema.parse({
        apiVersion: "1.0",
        type: "about:blank",
        title: "Invalid request",
        status: 400,
        code: "INVALID_REQUEST",
        detail: "The request is not valid.",
        correlationId: "request-1",
      }).code,
    ).toBe("INVALID_REQUEST");
    expect(
      safeRunEventSchema.safeParse({
        apiVersion: "1.0",
        id: 1,
        runId: "run-1",
        timestamp: "2026-01-01T00:00:00.000Z",
        type: "case.completed",
        progress: {
          selected: 1,
          running: 0,
          completed: 1,
          passed: 1,
          failed: 0,
          warning: 0,
          errors: 0,
        },
        rawResponse: "secret",
      }).success,
    ).toBe(false);
  });

  it("accepts the public cancellation lifecycle without exposing provider details", () => {
    expect(
      safeRunEventSchema.parse({
        apiVersion: "1.0",
        id: 2,
        runId: "run-1",
        timestamp: "2026-09-17T00:00:00.000Z",
        type: "run.cancelling",
        progress: {
          selected: 20,
          running: 1,
          completed: 4,
          passed: 4,
          failed: 0,
          warning: 0,
          errors: 0,
        },
        safeMessage: "Cancellation requested. Completed evidence will be preserved.",
      }).type,
    ).toBe("run.cancelling");

    expect(
      runSessionSnapshotSchema.parse({
        apiVersion: "1.0",
        runId: "run-1",
        state: "CANCELLED",
        projectId: "ecommerce-support",
        suiteId: "main",
        selectedCases: 20,
        completedCases: 4,
        startedAt: "2026-09-17T00:00:00.000Z",
        completedAt: "2026-09-17T00:00:01.000Z",
        artifactId: "artifact-12345678",
      }).state,
    ).toBe("CANCELLED");
  });
});

describe("PromptOps API contracts", () => {
  const hash = "a".repeat(64);

  it("accepts a bounded versioned plan and rejects unrecognized fields", () => {
    const plan = {
      apiVersion: "1.0",
      schemaVersion: "1.0",
      experimentId: "experiment-1",
      projectId: "project",
      suiteId: "suite",
      variants: ["baseline", "candidate"].map((variantId, index) => ({
        variantId,
        label: variantId,
        prompt: { promptId: "support", version: index + 1, hash },
        targetId: "mock",
        targetHash: hash,
      })),
      repetitions: 3,
      policy: {
        version: "1.0",
        baselineVariantId: "baseline",
        minimumValidRepetitions: 3,
        minimumMeanPassRate: 0.9,
        maximumPassRateRegressionPoints: 0,
        minimumVerdictAgreement: 0.95,
        maximumFlakyCaseRate: 0.05,
        blockOnCriticalRegression: true,
        requireCompleteUsageForLatencyGate: false,
        requireCompleteCostForCostGate: false,
      },
      compatibilityHash: hash,
      planHash: hash,
    };
    expect(experimentPlanSchema.parse(plan).variants).toHaveLength(2);
    expect(
      experimentPlanSchema.safeParse({ ...plan, databasePath: "/tmp/prompts.db" }).success,
    ).toBe(false);
    expect(experimentPlanSchema.safeParse({ ...plan, repetitions: 11 }).success).toBe(false);
  });

  it("bounds prompt and decision text and requires a rationale", () => {
    expect(
      promptCreateRequestSchema.safeParse({
        apiVersion: "1.0",
        promptId: "support",
        displayName: "Support",
        template: {
          schemaVersion: "1.0",
          user: "{{input.user}}",
          declaredVariables: [],
        },
      }).success,
    ).toBe(true);
    expect(
      humanDecisionRequestSchema.safeParse({
        apiVersion: "1.0",
        action: "ACCEPT_RECOMMENDATION",
        outcome: "KEEP_BASELINE",
        recommendationId: "recommendation-1",
        evidenceHash: hash,
        reviewerLabel: "Local reviewer",
        rationale: "   ",
      }).success,
    ).toBe(false);
  });

  it("keeps events and problems versioned, strict, and free of raw evidence fields", () => {
    expect(
      promptOpsEventSchema.safeParse({
        apiVersion: "1.0",
        id: 1,
        experimentId: "experiment-1",
        correlationId: "experiment-1-cell-1",
        timestamp: "2026-09-22T00:00:00.000Z",
        type: "cell.completed",
        state: "RUNNING",
        completedCells: 1,
        totalCells: 6,
        rawResponse: "secret",
      }).success,
    ).toBe(false);
    expect(
      promptOpsProblemSchema.parse({
        apiVersion: "1.0",
        type: "about:blank",
        title: "Invalid prompt",
        status: 400,
        code: "PROMPT_TEMPLATE_INVALID",
        detail: "The prompt template is invalid.",
        correlationId: "request-1",
      }).code,
    ).toBe("PROMPT_TEMPLATE_INVALID");
  });
});
