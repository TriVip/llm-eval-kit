import { describe, expect, it } from "vitest";

import { safeRunEventSchema, studioProblemSchema, studioRunRequestSchema } from "../src/index.js";

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
        sequence: 1,
        runId: "run-1",
        phase: "provider",
        status: "completed",
        rawResponse: "secret",
      }).success,
    ).toBe(false);
  });
});
