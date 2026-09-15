import { describe, expect, it } from "vitest";

import {
  type CaseResult,
  type EvaluationResult,
  type EvaluatorSpec,
  type QualityGatePolicy,
  type RunMetadata,
  type Severity,
  type Verdict,
} from "@llm-eval-kit/core";

import { RiskScoringEngine } from "../src/index.js";

const engine = new RiskScoringEngine();
const specs: EvaluatorSpec[] = [
  { id: "required", type: "contains", required: true, weight: 1, config: {} },
  { id: "optional", type: "judge", required: false, weight: 3, config: {} },
];
const policy: QualityGatePolicy = {
  minimumPassRate: 0.9,
  minimumScore: 0.7,
  maximumErrorRate: 0.02,
  blockOnCriticalFailure: true,
  maximumCategoryRegressionPoints: 3,
  warningCountsAsPass: false,
  reviewThreshold: 0.7,
};
const metadata: RunMetadata = {
  runId: "run_001",
  startedAt: "2026-09-15T00:00:00.000Z",
  completedAt: "2026-09-15T00:00:01.000Z",
  configHash: "config",
  suiteHash: "suite",
  target: { provider: "mock", model: "fixture-v1" },
};

function evaluation(
  evaluatorId: string,
  verdict: Verdict,
  kind: EvaluationResult["kind"] = "DETERMINISTIC",
  metrics: Pick<EvaluationResult, "score" | "confidence"> = {},
): EvaluationResult {
  return { evaluatorId, kind, verdict, reason: verdict, durationMs: 0, ...metrics };
}

function testCase(
  caseId: string,
  verdict: Verdict,
  severity: Severity = "LOW",
  category = "general",
): CaseResult {
  return { caseId, category, severity, verdict, evaluations: [] };
}

describe("RiskScoringEngine case aggregation", () => {
  it("gives a required deterministic failure precedence over a high semantic score", () => {
    const aggregate = engine.aggregateCase(
      [
        evaluation("required", "FAIL"),
        evaluation("optional", "PASS", "MODEL_BASED", { score: 1, confidence: 1 }),
      ],
      specs,
      policy,
    );
    expect(aggregate).toEqual({ verdict: "FAIL", score: 1, confidence: 1 });
  });

  it("keeps ERROR separate and routes low confidence to WARNING", () => {
    expect(engine.aggregateCase([evaluation("required", "ERROR")], specs, policy).verdict).toBe(
      "ERROR",
    );
    expect(
      engine.aggregateCase(
        [evaluation("optional", "PASS", "MODEL_BASED", { score: 0.9, confidence: 0.69 })],
        specs,
        policy,
      ),
    ).toEqual({ verdict: "WARNING", score: 0.9, confidence: 0.69 });
  });

  it("uses weighted model-based score without mixing deterministic binary scores", () => {
    const weightedSpecs: EvaluatorSpec[] = [
      { id: "det", type: "contains", required: true, weight: 10, config: {} },
      { id: "judge-a", type: "judge", required: true, weight: 1, config: {} },
      { id: "judge-b", type: "judge", required: true, weight: 3, config: {} },
    ];
    const aggregate = engine.aggregateCase(
      [
        evaluation("det", "PASS", "DETERMINISTIC", { score: 1 }),
        evaluation("judge-a", "PASS", "MODEL_BASED", { score: 0.4, confidence: 0.8 }),
        evaluation("judge-b", "PASS", "MODEL_BASED", { score: 0.8, confidence: 1 }),
      ],
      weightedSpecs,
      policy,
    );
    expect(aggregate.score).toBeCloseTo(0.7);
    expect(aggregate.confidence).toBeCloseTo(0.95);
    expect(aggregate.verdict).toBe("PASS");
  });

  it("fails low semantic scores and warns on optional deterministic failures", () => {
    expect(
      engine.aggregateCase(
        [evaluation("optional", "PASS", "MODEL_BASED", { score: 0.69, confidence: 1 })],
        specs,
        policy,
      ).verdict,
    ).toBe("FAIL");
    expect(engine.aggregateCase([evaluation("optional", "FAIL")], specs, policy).verdict).toBe(
      "WARNING",
    );
    expect(engine.aggregateCase([evaluation("optional", "ERROR")], specs, policy).verdict).toBe(
      "WARNING",
    );
  });

  it("treats missing results and out-of-range metrics as ERROR", () => {
    expect(engine.aggregateCase([], specs, policy).verdict).toBe("ERROR");
    expect(
      engine.aggregateCase(
        [evaluation("optional", "PASS", "MODEL_BASED", { score: 1.1 })],
        specs,
        policy,
      ).verdict,
    ).toBe("ERROR");
    expect(
      engine.aggregateCase(
        [evaluation("optional", "PASS", "MODEL_BASED", { score: Number.NaN })],
        specs,
        policy,
      ).verdict,
    ).toBe("ERROR");
  });
});

describe("RiskScoringEngine quality gate", () => {
  it("blocks a critical failure even when overall pass rate is 99%", () => {
    const cases = Array.from({ length: 99 }, (_, index) => testCase(`PASS_${index}`, "PASS"));
    cases.push(testCase("CRITICAL_FAIL", "FAIL", "CRITICAL", "refund"));
    const artifact = engine.buildRunArtifact(metadata, cases, policy);
    expect(artifact.metrics.passRate).toBe(0.99);
    expect(artifact.status).toBe("QUALITY_FAILED");
    expect(artifact.gateFailures.map(({ code }) => code)).toEqual(["CRITICAL_CASE_FAILURE"]);
  });

  it("enforces exact error-rate and category-regression boundaries", () => {
    const twoErrors = [
      ...Array.from({ length: 98 }, (_, index) => testCase(`PASS_${index}`, "PASS")),
      testCase("ERROR_1", "ERROR"),
      testCase("ERROR_2", "ERROR"),
    ];
    expect(engine.buildRunArtifact(metadata, twoErrors, policy).status).toBe("PASSED");
    expect(
      engine.buildRunArtifact(metadata, [...twoErrors, testCase("ERROR_3", "ERROR")], policy)
        .status,
    ).toBe("OPERATIONAL_FAILED");
    expect(
      engine.buildRunArtifact(metadata, twoErrors.slice(0, 10), policy, {
        categoryRegressions: [{ category: "refund", regressionPoints: 3, affectedCaseIds: [] }],
      }).status,
    ).toBe("PASSED");
    expect(
      engine.buildRunArtifact(metadata, twoErrors.slice(0, 10), policy, {
        categoryRegressions: [
          { category: "refund", regressionPoints: 3.01, affectedCaseIds: ["A"] },
        ],
      }).gateFailures,
    ).toContainEqual(
      expect.objectContaining({ code: "CATEGORY_REGRESSION", affectedCaseIds: ["A"] }),
    );
  });

  it("lists every known gate failure in deterministic decision order", () => {
    const artifact = engine.buildRunArtifact(
      metadata,
      [testCase("ERROR", "ERROR"), testCase("CRITICAL", "FAIL", "CRITICAL", "refund")],
      policy,
      {
        categoryRegressions: [
          { category: "refund", regressionPoints: 4, affectedCaseIds: ["CRITICAL"] },
        ],
      },
    );
    expect(artifact.status).toBe("OPERATIONAL_FAILED");
    expect(artifact.gateFailures.map(({ code }) => code)).toEqual([
      "OPERATIONAL_ERROR_RATE",
      "CRITICAL_CASE_FAILURE",
      "CATEGORY_REGRESSION",
      "MINIMUM_PASS_RATE",
    ]);
  });

  it("uses the defined warning denominator and computes category metrics", () => {
    const warning = testCase("WARNING", "WARNING", "LOW", "support");
    const strict = engine.buildRunArtifact(metadata, [warning], policy);
    const permissive = engine.buildRunArtifact(metadata, [warning], {
      ...policy,
      warningCountsAsPass: true,
    });
    expect(strict.metrics).toMatchObject({
      executableCases: 1,
      passedCases: 0,
      passRate: 0,
      categories: [{ category: "support", passRate: 0 }],
    });
    expect(permissive.metrics).toMatchObject({
      passedCases: 1,
      passRate: 1,
      categories: [{ category: "support", passRate: 1 }],
    });
    expect(permissive.status).toBe("PASSED");
  });

  it("aggregates only known costs and never produces invalid rates", () => {
    const cases = [testCase("A", "PASS"), testCase("B", "ERROR")];
    cases[0] = {
      ...cases[0]!,
      generation: {
        text: "ok",
        usage: { estimatedCostUsd: 0.01 },
        latencyMs: 1,
        resolvedProvider: "mock",
        resolvedModel: "fixture-v1",
      },
    };
    const artifact = engine.buildRunArtifact(metadata, cases, {
      ...policy,
      maximumErrorRate: 1,
      minimumPassRate: 0,
    });
    expect(artifact.metrics.totalEstimatedCostUsd).toBe(0.01);
    expect(artifact.metrics.passRate).toBeGreaterThanOrEqual(0);
    expect(artifact.metrics.passRate).toBeLessThanOrEqual(1);
    expect(artifact.metrics.errorRate).toBeGreaterThanOrEqual(0);
    expect(artifact.metrics.errorRate).toBeLessThanOrEqual(1);
    const empty = engine.buildRunArtifact(metadata, [], { ...policy, minimumPassRate: 0 });
    expect(empty.metrics).toMatchObject({ passRate: 0, errorRate: 0, categories: [] });
  });
});
