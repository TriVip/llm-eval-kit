import { describe, expect, it } from "vitest";
import type { RunArtifact } from "@llm-eval-kit/core";

import { RunRegistry } from "../src/index.js";

const request = {
  projectId: "project",
  targetId: "mock",
  suiteId: "suite",
  fixtureSetId: "passing",
};

function cancelledArtifact(): RunArtifact {
  return {
    artifactSchemaVersion: "1.0",
    metadata: {
      runId: "run-1",
      startedAt: "2026-09-17T03:00:00.000Z",
      completedAt: "2026-09-17T03:00:01.000Z",
      configHash: "config",
      suiteHash: "suite",
      target: { provider: "mock", model: "fixture" },
    },
    status: "OPERATIONAL_FAILED",
    metrics: {
      selectedCases: 2,
      executableCases: 1,
      passedCases: 1,
      failedCases: 0,
      warningCases: 0,
      errorCases: 1,
      passRate: 0.5,
      errorRate: 0.5,
      categories: [],
      usageCoverage: 0,
      costCoverage: 0,
    },
    gateFailures: [],
    cases: [],
    termination: {
      kind: "CANCELLED",
      selectedCases: 2,
      completedCases: 1,
      requestedAt: "2026-09-17T03:00:00.500Z",
    },
  };
}

describe("Studio run registry", () => {
  it("enforces one active run and releases the slot after terminal failure", () => {
    const registry = new RunRegistry();
    registry.create("run-1", request, 2);
    expect(() => registry.create("run-2", request, 2)).toThrow("RUN_ALREADY_ACTIVE");
    registry.fail("run-1");
    expect(registry.create("run-2", request, 2).state).toBe("CREATED");
  });

  it("moves through validation readiness before execution", () => {
    const registry = new RunRegistry();
    expect(registry.create("run-1", request, 2).state).toBe("CREATED");
    registry.validating("run-1");
    expect(registry.get("run-1")?.state).toBe("VALIDATING");
    registry.validated("run-1");
    expect(registry.get("run-1")?.state).toBe("READY");
    expect(registry.replay("run-1", 0)?.events.map(({ type }) => type)).toEqual([
      "run.created",
      "run.validated",
    ]);
  });

  it("cancels cooperatively, preserves terminal evidence, and releases the active slot", () => {
    const registry = new RunRegistry();
    registry.create("run-1", request, 2);
    const signal = registry.signal("run-1");
    expect(registry.cancel("run-1").state).toBe("CANCELLING");
    expect(signal.aborted).toBe(true);
    expect(registry.replay("run-1", 0)?.events.map(({ type }) => type)).toContain("run.cancelling");
    registry.complete("run-1", cancelledArtifact(), "artifact-1");
    expect(registry.get("run-1")).toMatchObject({
      state: "CANCELLED",
      completedCases: 1,
      artifactId: "artifact-1",
    });
    expect(registry.create("run-2", request, 1).state).toBe("CREATED");
  });

  it("orders safe progress and detects replay gaps after the bounded buffer rolls", () => {
    const registry = new RunRegistry();
    registry.create("run-1", request, 300);
    registry.observe("run-1", { runId: "run-1", phase: "run", status: "started" });
    for (let index = 0; index < 300; index += 1) {
      const caseId = `case-${index}`;
      registry.observe("run-1", { runId: "run-1", caseId, phase: "run", status: "started" });
      registry.observe("run-1", { runId: "run-1", caseId, phase: "run", status: "completed" });
    }
    const replay = registry.replay("run-1", 1)!;
    expect(replay.gap).toBe(true);
    expect(replay.events).toHaveLength(256);
    expect(replay.events.every((event) => JSON.stringify(event).includes("prompt") === false)).toBe(
      true,
    );
  });
});
