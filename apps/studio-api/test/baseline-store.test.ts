import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { RunArtifact } from "@llm-eval-kit/core";

import { BaselineStore } from "../src/index.js";

function cancelledArtifact(): RunArtifact {
  return {
    artifactSchemaVersion: "1.0",
    metadata: {
      runId: "cancelled-run",
      suiteId: "suite",
      metricDefinitionsVersion: "1.0",
      startedAt: "2026-09-17T00:00:00.000Z",
      completedAt: "2026-09-17T00:00:01.000Z",
      configHash: "config",
      suiteHash: "suite",
      target: { provider: "mock", model: "fixture" },
    },
    status: "OPERATIONAL_FAILED",
    termination: {
      kind: "CANCELLED",
      selectedCases: 1,
      completedCases: 0,
      requestedAt: "2026-09-17T00:00:00.500Z",
    },
    metrics: {
      selectedCases: 1,
      executableCases: 0,
      passedCases: 0,
      failedCases: 0,
      warningCases: 0,
      errorCases: 1,
      passRate: 0,
      errorRate: 1,
      categories: [],
      usageCoverage: 0,
      costCoverage: 0,
    },
    gateFailures: [],
    cases: [],
  };
}

describe("BaselineStore", () => {
  it("never promotes cancelled or operationally incomplete evidence", async () => {
    const store = await BaselineStore.create(
      join(tmpdir(), `studio-baselines-${crypto.randomUUID()}`),
    );
    await expect(
      store.promote({
        artifact: cancelledArtifact(),
        projectId: "project",
        suiteId: "suite",
      }),
    ).rejects.toMatchObject({ code: "BASELINE_INELIGIBLE" });
  });
});
