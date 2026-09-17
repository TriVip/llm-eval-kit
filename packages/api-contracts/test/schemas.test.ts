import { describe, expect, it } from "vitest";

import {
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
