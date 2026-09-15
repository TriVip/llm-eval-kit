import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { RunArtifact, Verdict } from "@llm-eval-kit/core";

import { runCli } from "../src/main.js";

function runArtifact(runId: string, verdict: Verdict): RunArtifact {
  const passed = verdict === "PASS" ? 1 : 0;
  return {
    artifactSchemaVersion: "1.0",
    metadata: {
      runId,
      suiteId: "support",
      metricDefinitionsVersion: "1.0",
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:01.000Z",
      configHash: "config",
      suiteHash: "suite",
      target: { provider: "mock", model: "fixture" },
    },
    status: verdict === "PASS" ? "PASSED" : "QUALITY_FAILED",
    metrics: {
      selectedCases: 1,
      executableCases: 1,
      passedCases: passed,
      failedCases: 1 - passed,
      warningCases: 0,
      errorCases: 0,
      passRate: passed,
      errorRate: 0,
      categories: [
        {
          category: "refund",
          selectedCases: 1,
          executableCases: 1,
          passedCases: passed,
          failedCases: 1 - passed,
          warningCases: 0,
          errorCases: 0,
          passRate: passed,
        },
      ],
      usageCoverage: 0,
      costCoverage: 0,
    },
    gateFailures: [],
    cases: [
      {
        caseId: "R1",
        definitionHash: "same",
        category: "refund",
        severity: "CRITICAL",
        verdict,
        evaluations: [],
      },
    ],
  };
}

async function invoke(
  cwd: string,
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  let stdout = "";
  let stderr = "";
  const code = await runCli(args, {
    cwd,
    writeOut: (message) => {
      stdout += message;
    },
    writeErr: (message) => {
      stderr += message;
    },
  });
  return { code, stdout, stderr };
}

describe("Sprint 4 CLI commands", () => {
  it("validates config and suite without provider execution", async () => {
    const cwd = join(tmpdir(), `llmeval-validate-${crypto.randomUUID()}`);
    await mkdir(cwd, { recursive: true });
    await writeFile(
      join(cwd, "config.json"),
      JSON.stringify({
        schemaVersion: "1.0",
        project: { id: "demo", name: "Demo" },
        target: { provider: "mock", model: "fixture" },
        execution: {},
        qualityGate: {},
        output: { directory: "reports", formats: ["json"] },
      }),
    );
    await writeFile(
      join(cwd, "suite.json"),
      JSON.stringify({
        schemaVersion: "1.0",
        id: "support",
        name: "Support",
        cases: [
          {
            id: "R1",
            name: "Refund",
            category: "refund",
            severity: "CRITICAL",
            input: { user: "Policy?" },
            evaluators: [{ id: "exact", type: "exact_match" }],
          },
        ],
      }),
    );
    const result = await invoke(cwd, [
      "validate",
      "--config",
      "config.json",
      "--suite",
      "suite.json",
    ]);
    expect(result).toMatchObject({ code: 0, stdout: expect.stringContaining("Validation passed") });
  });

  it("returns exit 1 and machine-readable evidence for a regression", async () => {
    const cwd = join(tmpdir(), `llmeval-compare-${crypto.randomUUID()}`);
    await mkdir(cwd, { recursive: true });
    await writeFile(join(cwd, "baseline.json"), JSON.stringify(runArtifact("base", "PASS")));
    await writeFile(join(cwd, "candidate.json"), JSON.stringify(runArtifact("candidate", "FAIL")));
    const result = await invoke(cwd, [
      "compare",
      "--run",
      "candidate.json",
      "--baseline",
      "baseline.json",
    ]);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "QUALITY_FAILED",
      criticalRegressionCaseIds: ["R1"],
    });
  });

  it("promotes baselines only through the explicit guarded command", async () => {
    const cwd = join(tmpdir(), `llmeval-promote-${crypto.randomUUID()}`);
    await mkdir(cwd, { recursive: true });
    await writeFile(join(cwd, "run.json"), JSON.stringify(runArtifact("base", "PASS")));
    expect(
      (await invoke(cwd, ["baseline", "save", "--run", "run.json", "--output", "baseline.json"]))
        .code,
    ).toBe(0);
    expect(
      (await invoke(cwd, ["baseline", "save", "--run", "run.json", "--output", "baseline.json"]))
        .code,
    ).toBe(4);
    expect(
      (
        await invoke(cwd, [
          "baseline",
          "save",
          "--run",
          "run.json",
          "--output",
          "baseline.json",
          "--overwrite",
        ])
      ).code,
    ).toBe(0);
    await expect(access(join(cwd, "baseline.json"))).resolves.toBeUndefined();
  });

  it("renders a self-contained HTML report from a validated artifact", async () => {
    const cwd = join(tmpdir(), `llmeval-report-${crypto.randomUUID()}`);
    await mkdir(cwd, { recursive: true });
    await writeFile(join(cwd, "run.json"), JSON.stringify(runArtifact("report", "PASS")));
    const result = await invoke(cwd, [
      "report",
      "--run",
      "run.json",
      "--format",
      "html",
      "--output",
      "report.html",
    ]);
    expect(result.code).toBe(0);
    const html = await readFile(join(cwd, "report.html"), "utf8");
    expect(html).toContain("<!doctype html>");
    expect(html).not.toMatch(/https?:\/\//);
  });
});
