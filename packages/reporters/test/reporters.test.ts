import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { RunArtifact } from "@llm-eval-kit/core";

import {
  appendStructuredLog,
  renderHtmlReport,
  renderTerminalReport,
  writeHtmlReport,
} from "../src/index.js";

const artifact: RunArtifact = {
  artifactSchemaVersion: "1.0",
  metadata: {
    runId: "run-report",
    suiteId: "support",
    metricDefinitionsVersion: "1.0",
    startedAt: "2026-01-01T00:00:00.000Z",
    configHash: "config",
    suiteHash: "suite",
    target: { provider: "mock", model: "fixture" },
  },
  status: "QUALITY_FAILED",
  metrics: {
    selectedCases: 1,
    executableCases: 1,
    passedCases: 0,
    failedCases: 1,
    warningCases: 0,
    errorCases: 0,
    passRate: 0,
    errorRate: 0,
    categories: [
      {
        category: "refund",
        selectedCases: 1,
        executableCases: 1,
        passedCases: 0,
        failedCases: 1,
        warningCases: 0,
        errorCases: 0,
        passRate: 0,
      },
    ],
    usageCoverage: 0,
    costCoverage: 0,
  },
  gateFailures: [{ code: "MINIMUM_PASS_RATE", reason: "Below target", affectedCaseIds: ["R1"] }],
  cases: [
    {
      caseId: "R1",
      definitionHash: "hash",
      category: "refund",
      severity: "CRITICAL",
      verdict: "FAIL",
      generation: {
        text: "<script>alert('x')</script> sk-supersecret123",
        usage: {},
        latencyMs: 1,
        resolvedProvider: "mock",
        resolvedModel: "fixture",
      },
      evaluations: [],
    },
  ],
};

describe("Sprint 4 reporters", () => {
  it("renders consistent terminal metrics and report paths", () => {
    const output = renderTerminalReport(artifact, ["/tmp/run.json"]);
    expect(output).toContain("Status: QUALITY_FAILED");
    expect(output).toContain("Critical failures: R1");
    expect(output).toContain("Artifact: /tmp/run.json");
  });

  it("escapes untrusted HTML and redacts API keys", () => {
    const html = renderHtmlReport(artifact);
    expect(html).toContain("&lt;script&gt;alert");
    expect(html).not.toContain("sk-supersecret123");
    expect(html).toContain("[REDACTED]");
  });

  it("redacts structured logs at every payload depth", async () => {
    const path = join(tmpdir(), `llmeval-log-${crypto.randomUUID()}.ndjson`);
    await appendStructuredLog(path, {
      timestamp: "2026-01-01T00:00:00.000Z",
      level: "debug",
      event: "test",
      runId: "run-report",
      data: { authorization: "Bearer abc.def.ghi", nested: "sk-supersecret123" },
    });
    const log = await readFile(path, "utf8");
    expect(log).not.toContain("abc.def.ghi");
    expect(log).not.toContain("sk-supersecret123");
    expect(log).toContain("[REDACTED]");
  });

  it("atomically writes the standalone HTML report", async () => {
    const path = join(tmpdir(), `llmeval-report-${crypto.randomUUID()}`, "report.html");
    expect(await writeHtmlReport(artifact, path)).toBe(path);
    expect(await readFile(path, "utf8")).toContain("LLM Evaluation Report");
  });
});
