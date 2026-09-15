import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ARTIFACT_SCHEMA_VERSION, type RunArtifact } from "@llm-eval-kit/core";

import { buildHumanReviewQueue, writeHumanReviewQueue } from "../src/index.js";

const artifact: RunArtifact = {
  artifactSchemaVersion: ARTIFACT_SCHEMA_VERSION,
  metadata: {
    runId: "run_review",
    startedAt: "2026-09-15T00:00:00.000Z",
    completedAt: "2026-09-15T00:00:01.000Z",
    configHash: "config",
    suiteHash: "suite",
    target: { provider: "mock", model: "fixture" },
  },
  status: "QUALITY_FAILED",
  metrics: {
    selectedCases: 2,
    executableCases: 2,
    passedCases: 1,
    failedCases: 0,
    warningCases: 1,
    errorCases: 0,
    passRate: 0.5,
    errorRate: 0,
    categories: [],
    usageCoverage: 0,
    costCoverage: 0,
  },
  gateFailures: [],
  cases: [
    {
      caseId: "LOW_CONFIDENCE",
      category: "refund",
      severity: "HIGH",
      verdict: "WARNING",
      score: 0.8,
      confidence: 0.5,
      evaluations: [
        {
          evaluatorId: "judge",
          kind: "MODEL_BASED",
          verdict: "PASS",
          score: 0.8,
          confidence: 0.5,
          reason: "The policy wording is ambiguous.",
          durationMs: 1,
        },
      ],
    },
    {
      caseId: "PASS",
      category: "general",
      severity: "LOW",
      verdict: "PASS",
      evaluations: [],
    },
  ],
};

describe("human-review queue", () => {
  it("exports only model-based warning cases with actionable context", async () => {
    const queue = buildHumanReviewQueue(artifact, "2026-09-15T01:00:00.000Z");
    expect(queue.items).toEqual([
      expect.objectContaining({
        caseId: "LOW_CONFIDENCE",
        confidence: 0.5,
        reasons: ["The policy wording is ambiguous."],
      }),
    ]);

    const outputRoot = join(tmpdir(), `llm-eval-review-${crypto.randomUUID()}`);
    const outputPath = await writeHumanReviewQueue(artifact, outputRoot);
    const stored = JSON.parse(await readFile(outputPath, "utf8")) as { items: unknown[] };
    expect(stored.items).toHaveLength(1);
    expect(outputPath).toMatch(/run_review[/\\]human-review\.json$/);
  });
});
