import { mkdir, symlink, writeFile } from "node:fs/promises";
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

  it("indexes model-based warning evidence for human review", async () => {
    const root = join(tmpdir(), `studio-reports-${crypto.randomUUID()}`);
    const run = artifact("review-run");
    run.cases[0]!.verdict = "WARNING";
    run.cases[0]!.confidence = 0.51;
    run.cases[0]!.evaluations = [
      {
        evaluatorId: "judge",
        kind: "MODEL_BASED",
        verdict: "WARNING",
        confidence: 0.51,
        reason: "Human judgment is required.",
        durationMs: 1,
      },
    ];
    await mkdir(join(root, "review"), { recursive: true });
    await writeFile(join(root, "review", "run.json"), JSON.stringify(run));
    const index = await ArtifactIndex.create(root);
    expect(index.reviewItems()).toEqual([
      expect.objectContaining({
        runId: "review-run",
        caseId: "CASE_001",
        verdict: "WARNING",
        confidence: 0.51,
      }),
    ]);
  });

  it("resolves only bounded allowlisted companion files", async () => {
    const root = join(tmpdir(), `studio-reports-${crypto.randomUUID()}`);
    const runDirectory = join(root, "run");
    await mkdir(runDirectory, { recursive: true });
    await writeFile(join(runDirectory, "run.json"), JSON.stringify(artifact("file-run")));
    await writeFile(join(runDirectory, "report.html"), "<p>redacted report</p>");
    await writeFile(join(runDirectory, "logs.ndjson"), '{"event":"completed"}\n');
    const index = await ArtifactIndex.create(root);
    const artifactId = index.list()[0]!.id;
    await expect(index.file(artifactId, "html-report")).resolves.toBe(
      join(runDirectory, "report.html"),
    );
    await expect(index.file(artifactId, "redacted-logs")).resolves.toBe(
      join(runDirectory, "logs.ndjson"),
    );
    await expect(index.file("artifact-missing", "html-report")).resolves.toBeUndefined();
  });

  it("rejects an allowlisted filename when its symlink escapes the report root", async () => {
    const root = join(tmpdir(), `studio-reports-${crypto.randomUUID()}`);
    const runDirectory = join(root, "run");
    const outside = join(tmpdir(), `outside-report-${crypto.randomUUID()}.html`);
    await mkdir(runDirectory, { recursive: true });
    await writeFile(join(runDirectory, "run.json"), JSON.stringify(artifact("symlink-run")));
    await writeFile(outside, "sensitive outside content");
    await symlink(outside, join(runDirectory, "report.html"));
    const index = await ArtifactIndex.create(root);
    await expect(index.file(index.list()[0]!.id, "html-report")).resolves.toBeUndefined();
  });
});
