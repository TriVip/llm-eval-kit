import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseRunArtifact } from "@llm-eval-kit/config";
import { ARTIFACT_SCHEMA_VERSION, type RunArtifact } from "@llm-eval-kit/core";

import { writeRunArtifact } from "../src/index.js";

const artifact: RunArtifact = {
  artifactSchemaVersion: ARTIFACT_SCHEMA_VERSION,
  metadata: {
    runId: "run_artifact_test",
    startedAt: "2026-09-15T00:00:00.000Z",
    completedAt: "2026-09-15T00:00:01.000Z",
    configHash: "config-hash",
    suiteHash: "suite-hash",
    target: { provider: "mock", model: "fixture-v1" },
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
  },
  gateFailures: [],
  cases: [],
};

describe("writeRunArtifact", () => {
  it("atomically writes a schema-valid canonical run.json", async () => {
    const outputRoot = join(tmpdir(), `llm-eval-kit-${crypto.randomUUID()}`);
    const artifactPath = await writeRunArtifact(artifact, outputRoot);
    const stored = JSON.parse(await readFile(artifactPath, "utf8")) as unknown;

    expect(parseRunArtifact(stored)).toEqual(artifact);
    expect(artifactPath).toMatch(/run_artifact_test[/\\]run\.json$/);
  });
});
