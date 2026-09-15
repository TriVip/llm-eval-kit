import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ArtifactError, type RunArtifact } from "@llm-eval-kit/core";

import { promoteBaseline } from "../src/index.js";

const artifact: RunArtifact = {
  artifactSchemaVersion: "1.0",
  metadata: {
    runId: "run-baseline",
    suiteId: "support",
    metricDefinitionsVersion: "1.0",
    startedAt: "2026-01-01T00:00:00.000Z",
    configHash: "config",
    suiteHash: "suite",
    target: { provider: "mock", model: "fixture" },
  },
  status: "PASSED",
  metrics: {
    selectedCases: 0,
    executableCases: 0,
    passedCases: 0,
    failedCases: 0,
    warningCases: 0,
    errorCases: 0,
    passRate: 0,
    errorRate: 0,
    categories: [],
    usageCoverage: 0,
    costCoverage: 0,
  },
  gateFailures: [],
  cases: [],
};

describe("promoteBaseline", () => {
  it("requires explicit overwrite and replaces atomically when allowed", async () => {
    const output = join(tmpdir(), `llmeval-baseline-${crypto.randomUUID()}.json`);
    await writeFile(output, "existing");
    await expect(promoteBaseline(artifact, output)).rejects.toBeInstanceOf(ArtifactError);
    await promoteBaseline(artifact, output, { overwrite: true });
    expect(JSON.parse(await readFile(output, "utf8"))).toMatchObject({
      metadata: { runId: "run-baseline" },
    });
  });
});
