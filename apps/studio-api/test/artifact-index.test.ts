import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { RunArtifact } from "@llm-eval-kit/core";

import { ArtifactIndex } from "../src/index.js";

function artifact(runId: string): RunArtifact {
  return {
    artifactSchemaVersion: "1.0",
    metadata: {
      runId,
      suiteId: "suite",
      metricDefinitionsVersion: "1.0",
      startedAt: "2026-09-16T00:00:00.000Z",
      completedAt: "2026-09-16T00:00:01.000Z",
      configHash: "config",
      suiteHash: "suite",
      target: { provider: "mock", model: "fixture" },
    },
    status: "PASSED",
    metrics: {
      selectedCases: 1,
      executableCases: 1,
      passedCases: 1,
      failedCases: 0,
      warningCases: 0,
      errorCases: 0,
      passRate: 1,
      errorRate: 0,
      categories: [],
      usageCoverage: 1,
      costCoverage: 0,
    },
    gateFailures: [],
    cases: [
      {
        caseId: "CASE_001",
        category: "demo",
        severity: "LOW",
        verdict: "PASS",
        generation: {
          text: "secret response",
          usage: {},
          latencyMs: 1,
          resolvedProvider: "mock",
          resolvedModel: "fixture",
        },
        evaluations: [],
      },
    ],
  };
}

describe("ArtifactIndex", () => {
  it("rebuilds stable opaque summaries and redacts raw responses", async () => {
    const root = join(tmpdir(), `studio-reports-${crypto.randomUUID()}`);
    const run = join(root, "run-a");
    await mkdir(run, { recursive: true });
    await writeFile(join(run, "run.json"), JSON.stringify(artifact("run-a")));
    await writeFile(join(root, "invalid-run.json"), "not-json");
    const first = await ArtifactIndex.create(root);
    const second = await ArtifactIndex.create(root);
    expect(first.list()).toEqual(second.list());
    expect(first.list()).toHaveLength(1);
    const indexed = first.get(first.list()[0]!.id);
    expect(indexed?.artifact.cases[0]?.generation?.text).toBe("[RAW_RESPONSE_NOT_RETAINED]");
    expect(JSON.stringify(first.list())).not.toContain(root);
  });

  it("excludes invalid run.json while retaining valid artifacts", async () => {
    const root = join(tmpdir(), `studio-reports-${crypto.randomUUID()}`);
    await mkdir(join(root, "valid"), { recursive: true });
    await mkdir(join(root, "invalid"), { recursive: true });
    await writeFile(join(root, "valid", "run.json"), JSON.stringify(artifact("valid-run")));
    await writeFile(join(root, "invalid", "run.json"), "{broken");
    expect((await ArtifactIndex.create(root)).list().map(({ runId }) => runId)).toEqual([
      "valid-run",
    ]);
  });
});
