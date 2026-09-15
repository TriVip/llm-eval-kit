import { describe, expect, it } from "vitest";

import {
  compareRunArtifacts,
  ConfigurationError,
  type CaseResult,
  type RunArtifact,
} from "../src/index.js";

function artifact(runId: string, cases: CaseResult[], suiteId = "support"): RunArtifact {
  const executable = cases.filter(({ verdict }) => verdict !== "ERROR");
  const passed = executable.filter(({ verdict }) => verdict === "PASS").length;
  const categories = [...new Set(cases.map(({ category }) => category))].map((category) => {
    const selected = cases.filter((item) => item.category === category);
    const executableCases = selected.filter(({ verdict }) => verdict !== "ERROR");
    const passedCases = executableCases.filter(({ verdict }) => verdict === "PASS").length;
    return {
      category,
      selectedCases: selected.length,
      executableCases: executableCases.length,
      passedCases,
      failedCases: selected.filter(({ verdict }) => verdict === "FAIL").length,
      warningCases: selected.filter(({ verdict }) => verdict === "WARNING").length,
      errorCases: selected.filter(({ verdict }) => verdict === "ERROR").length,
      passRate: executableCases.length === 0 ? 0 : passedCases / executableCases.length,
    };
  });
  return {
    artifactSchemaVersion: "1.0",
    metadata: {
      runId,
      suiteId,
      metricDefinitionsVersion: "1.0",
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:01.000Z",
      configHash: "config",
      suiteHash: "suite",
      target: { provider: "mock", model: "fixture" },
    },
    status: "PASSED",
    metrics: {
      selectedCases: cases.length,
      executableCases: executable.length,
      passedCases: passed,
      failedCases: cases.filter(({ verdict }) => verdict === "FAIL").length,
      warningCases: cases.filter(({ verdict }) => verdict === "WARNING").length,
      errorCases: cases.filter(({ verdict }) => verdict === "ERROR").length,
      passRate: executable.length === 0 ? 0 : passed / executable.length,
      errorRate:
        cases.length === 0
          ? 0
          : cases.filter(({ verdict }) => verdict === "ERROR").length / cases.length,
      categories,
      usageCoverage: 0,
      costCoverage: 0,
    },
    gateFailures: [],
    cases,
  };
}

function result(
  caseId: string,
  verdict: CaseResult["verdict"],
  definitionHash = caseId,
): CaseResult {
  return {
    caseId,
    definitionHash,
    category: caseId.startsWith("R") ? "refund" : "shipping",
    severity: caseId === "R1" ? "CRITICAL" : "LOW",
    verdict,
    evaluations: [],
  };
}

describe("baseline comparison", () => {
  it("classifies added, removed, changed, and unchanged matched cases", () => {
    const baseline = artifact("base", [
      result("R1", "PASS"),
      result("S1", "PASS"),
      result("OLD", "PASS"),
    ]);
    const candidate = artifact("candidate", [
      result("R1", "FAIL"),
      result("S1", "PASS", "changed"),
      result("NEW", "PASS"),
    ]);
    const comparison = compareRunArtifacts(candidate, baseline);

    expect(comparison.classification).toEqual({
      matched: ["R1"],
      added: ["NEW"],
      removed: ["OLD"],
      changed: ["S1"],
    });
    expect(comparison.criticalRegressionCaseIds).toEqual(["R1"]);
    expect(comparison.status).toBe("QUALITY_FAILED");
  });

  it("uses only unchanged matched cases for category regression", () => {
    const baseline = artifact("base", [result("S1", "PASS"), result("S2", "PASS")]);
    const candidate = artifact("candidate", [
      result("S1", "FAIL"),
      result("S2", "FAIL", "new-definition"),
    ]);
    const comparison = compareRunArtifacts(candidate, baseline, {
      maximumCategoryRegressionPoints: 3,
    });

    expect(comparison.categories[0]?.matchedCaseIds).toEqual(["S1"]);
    expect(comparison.categories[0]?.passRate.delta).toBe(-1);
    expect(comparison.gateFailures[0]?.code).toBe("CATEGORY_REGRESSION");
  });

  it("allows a regression exactly at the configured boundary", () => {
    const baseCases = Array.from({ length: 100 }, (_, index) => result(`S${index}`, "PASS"));
    const candidateCases = baseCases.map((item, index) => ({
      ...item,
      verdict: index < 3 ? ("FAIL" as const) : ("PASS" as const),
    }));
    expect(
      compareRunArtifacts(artifact("candidate", candidateCases), artifact("base", baseCases))
        .status,
    ).toBe("PASSED");
  });

  it("rejects incompatible suites and legacy artifacts without compatibility metadata", () => {
    expect(() => compareRunArtifacts(artifact("one", []), artifact("two", [], "other"))).toThrow(
      ConfigurationError,
    );
    const legacy = artifact("legacy", []);
    delete legacy.metadata.suiteId;
    expect(() => compareRunArtifacts(artifact("candidate", []), legacy)).toThrow(
      /compatibility metadata/,
    );
  });
});
