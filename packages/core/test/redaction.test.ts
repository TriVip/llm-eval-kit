import { describe, expect, it } from "vitest";

import { redactRunArtifact, redactText, redactValue } from "../src/redaction.js";
import type { RunArtifact } from "../src/types.js";

const artifact: RunArtifact = {
  artifactSchemaVersion: "1.0",
  metadata: {
    runId: "run-redaction",
    suiteId: "suite",
    metricDefinitionsVersion: "1.0",
    startedAt: "2026-01-01T00:00:00.000Z",
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
    usageCoverage: 0,
    costCoverage: 0,
  },
  gateFailures: [],
  cases: [
    {
      caseId: "C1",
      definitionHash: "hash",
      category: "general",
      severity: "LOW",
      verdict: "PASS",
      generation: {
        text: "safe response",
        rawStructuredOutput: { api_key: "sk-supersecret123" },
        usage: {},
        latencyMs: 1,
        resolvedProvider: "mock",
        resolvedModel: "fixture",
      },
      evaluations: [],
    },
  ],
};

describe("central redaction", () => {
  it("redacts supported secret shapes without changing ordinary text", () => {
    expect(redactText("ordinary")).toBe("ordinary");
    expect(redactText("sk-supersecret123 AIza12345678901234567890 Bearer abc.def.ghi")).not.toMatch(
      /supersecret|AIza|abc\.def/,
    );
  });

  it("walks arrays and objects, masks sensitive keys, and handles cycles", () => {
    const cyclic: Record<string, unknown> = {
      token: "value",
      list: [null, 1, "sk-supersecret123"],
    };
    cyclic.self = cyclic;
    expect(redactValue(cyclic)).toEqual({
      token: "[REDACTED]",
      list: [null, 1, "[REDACTED]"],
      self: "[CIRCULAR]",
    });
  });

  it("removes raw responses by default and retains only redacted raw data explicitly", () => {
    const removed = redactRunArtifact(artifact);
    expect(removed.cases[0]?.generation?.text).toBe("[RAW_RESPONSE_NOT_RETAINED]");
    expect(removed.cases[0]?.generation?.rawStructuredOutput).toBeUndefined();

    const retained = redactRunArtifact(artifact, true);
    expect(retained.cases[0]?.generation?.text).toBe("safe response");
    expect(retained.cases[0]?.generation?.rawStructuredOutput).toEqual({ api_key: "[REDACTED]" });
  });

  it("leaves cases without generations structurally intact", () => {
    const withoutGeneration = {
      ...artifact,
      cases: [{ ...artifact.cases[0]!, generation: undefined }],
    } as unknown as RunArtifact;
    expect(redactRunArtifact(withoutGeneration).cases[0]?.generation).toBeUndefined();
  });
});
