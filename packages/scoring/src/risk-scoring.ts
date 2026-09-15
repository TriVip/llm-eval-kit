import {
  ARTIFACT_SCHEMA_VERSION,
  type CaseAggregate,
  type CaseResult,
  type CategoryMetrics,
  type EvaluationResult,
  type EvaluatorSpec,
  type GateFailure,
  type QualityGateContext,
  type QualityGatePolicy,
  type RunArtifact,
  type RunMetadata,
  type ScoringEngine,
  type Verdict,
} from "@llm-eval-kit/core";

function requiredResult(result: EvaluationResult, specs: EvaluatorSpec[]): boolean {
  return specs.find((spec) => spec.id === result.evaluatorId)?.required ?? true;
}

function resultWeight(result: EvaluationResult, specs: EvaluatorSpec[]): number {
  return specs.find((spec) => spec.id === result.evaluatorId)?.weight ?? 1;
}

function weightedMetric(
  results: EvaluationResult[],
  specs: EvaluatorSpec[],
  field: "score" | "confidence",
): number | undefined {
  const measured = results.filter(
    (result) => result.kind === "MODEL_BASED" && result[field] !== undefined,
  );
  if (measured.length === 0) return undefined;
  const totalWeight = measured.reduce((total, result) => total + resultWeight(result, specs), 0);
  return (
    measured.reduce(
      (total, result) => total + (result[field] ?? 0) * resultWeight(result, specs),
      0,
    ) / totalWeight
  );
}

function invalidMetric(result: EvaluationResult): boolean {
  return (
    (result.score !== undefined &&
      (!Number.isFinite(result.score) || result.score < 0 || result.score > 1)) ||
    (result.confidence !== undefined &&
      (!Number.isFinite(result.confidence) || result.confidence < 0 || result.confidence > 1))
  );
}

function countVerdict(cases: CaseResult[], verdict: Verdict): number {
  return cases.filter((result) => result.verdict === verdict).length;
}

function categoryMetrics(cases: CaseResult[], policy: QualityGatePolicy): CategoryMetrics[] {
  const categories = [...new Set(cases.map((result) => result.category))];
  return categories.map((category) => {
    const selected = cases.filter((result) => result.category === category);
    const errorCases = countVerdict(selected, "ERROR");
    const warningCases = countVerdict(selected, "WARNING");
    const passedCases =
      countVerdict(selected, "PASS") + (policy.warningCountsAsPass ? warningCases : 0);
    const executableCases = selected.length - errorCases;
    return {
      category,
      selectedCases: selected.length,
      executableCases,
      passedCases,
      failedCases: countVerdict(selected, "FAIL"),
      warningCases,
      errorCases,
      passRate: executableCases === 0 ? 0 : passedCases / executableCases,
    };
  });
}

export class RiskScoringEngine implements ScoringEngine {
  public aggregateCase(
    results: EvaluationResult[],
    specs: EvaluatorSpec[],
    policy: QualityGatePolicy,
  ): CaseAggregate {
    const score = weightedMetric(results, specs, "score");
    const confidence = weightedMetric(results, specs, "confidence");
    const aggregate = (verdict: Verdict): CaseAggregate => ({
      verdict,
      ...(score === undefined ? {} : { score }),
      ...(confidence === undefined ? {} : { confidence }),
    });

    if (results.length === 0 || results.some(invalidMetric)) return aggregate("ERROR");
    if (
      results.some(
        (result) =>
          result.kind === "DETERMINISTIC" &&
          requiredResult(result, specs) &&
          result.verdict === "FAIL",
      )
    ) {
      return aggregate("FAIL");
    }
    if (results.some((result) => requiredResult(result, specs) && result.verdict === "ERROR")) {
      return aggregate("ERROR");
    }
    if (
      results.some(
        (result) =>
          result.kind === "MODEL_BASED" &&
          result.confidence !== undefined &&
          result.confidence < policy.reviewThreshold,
      )
    ) {
      return aggregate("WARNING");
    }
    if (
      results.some(
        (result) =>
          result.kind === "MODEL_BASED" &&
          requiredResult(result, specs) &&
          result.verdict === "FAIL",
      ) ||
      (score !== undefined && score < policy.minimumScore)
    ) {
      return aggregate("FAIL");
    }
    if (
      results.some(
        (result) =>
          result.verdict === "WARNING" || result.verdict === "FAIL" || result.verdict === "ERROR",
      )
    ) {
      return aggregate("WARNING");
    }
    return aggregate("PASS");
  }

  public buildRunArtifact(
    metadata: RunMetadata,
    cases: CaseResult[],
    policy: QualityGatePolicy,
    gateContext: QualityGateContext = {},
  ): RunArtifact {
    const errorCases = countVerdict(cases, "ERROR");
    const failedCases = countVerdict(cases, "FAIL");
    const warningCases = countVerdict(cases, "WARNING");
    const passedCases =
      countVerdict(cases, "PASS") + (policy.warningCountsAsPass ? warningCases : 0);
    const executableCases = cases.length - errorCases;
    const passRate = executableCases === 0 ? 0 : passedCases / executableCases;
    const errorRate = cases.length === 0 ? 0 : errorCases / cases.length;
    const categories = categoryMetrics(cases, policy);
    const knownCosts = cases
      .map((result) => result.generation?.usage.estimatedCostUsd)
      .filter((cost): cost is number => cost !== undefined);
    const generations = cases.flatMap((result) =>
      result.generation === undefined ? [] : [result.generation],
    );
    const modelEvaluations = cases.flatMap((result) =>
      result.evaluations.filter((evaluation) => evaluation.kind === "MODEL_BASED"),
    );
    const usageRecords = [
      ...generations.map(({ usage }) => usage),
      ...modelEvaluations.map(({ usage }) => usage ?? {}),
    ];
    const knownInputTokens = usageRecords
      .map((usage) => usage.inputTokens)
      .filter((tokens): tokens is number => tokens !== undefined);
    const knownOutputTokens = usageRecords
      .map((usage) => usage.outputTokens)
      .filter((tokens): tokens is number => tokens !== undefined);
    const knownTotalTokens = usageRecords
      .map((usage) => usage.totalTokens)
      .filter((tokens): tokens is number => tokens !== undefined);
    const usageMeasured = usageRecords.filter((usage) =>
      [usage.inputTokens, usage.outputTokens, usage.totalTokens].some(
        (value) => value !== undefined,
      ),
    ).length;
    const modelEvaluationLatencyMs = modelEvaluations.reduce(
      (total, evaluation) => total + evaluation.durationMs,
      0,
    );
    const totalLatencyMs =
      generations.reduce((total, result) => total + result.latencyMs, 0) + modelEvaluationLatencyMs;
    const allKnownCosts = [
      ...knownCosts,
      ...modelEvaluations
        .map((evaluation) => evaluation.usage?.estimatedCostUsd)
        .filter((cost): cost is number => cost !== undefined),
    ];
    const gateFailures: GateFailure[] = [];

    if (errorRate > policy.maximumErrorRate) {
      gateFailures.push({
        code: "OPERATIONAL_ERROR_RATE",
        reason: `Error rate ${errorRate.toFixed(4)} exceeds ${policy.maximumErrorRate.toFixed(4)}.`,
        affectedCaseIds: cases
          .filter(({ verdict }) => verdict === "ERROR")
          .map(({ caseId }) => caseId),
      });
    }

    const budgetExhaustedCases = cases.filter(({ errorCode }) => errorCode === "BUDGET_EXHAUSTED");
    if (budgetExhaustedCases.length > 0) {
      gateFailures.push({
        code: "BUDGET_EXHAUSTED",
        reason: "The configured cost budget was reached before all selected cases were scheduled.",
        affectedCaseIds: budgetExhaustedCases.map(({ caseId }) => caseId),
      });
    }

    const criticalFailures = cases.filter(
      ({ severity, verdict }) => severity === "CRITICAL" && verdict === "FAIL",
    );
    if (policy.blockOnCriticalFailure && criticalFailures.length > 0) {
      gateFailures.push({
        code: "CRITICAL_CASE_FAILURE",
        reason: "One or more critical evaluation cases failed.",
        affectedCaseIds: criticalFailures.map(({ caseId }) => caseId),
      });
    }

    for (const regression of gateContext.categoryRegressions ?? []) {
      if (regression.regressionPoints > policy.maximumCategoryRegressionPoints) {
        gateFailures.push({
          code: "CATEGORY_REGRESSION",
          reason: `${regression.category} regressed by ${regression.regressionPoints.toFixed(2)} points, exceeding ${policy.maximumCategoryRegressionPoints.toFixed(2)}.`,
          affectedCaseIds: regression.affectedCaseIds,
        });
      }
    }

    if (passRate < policy.minimumPassRate) {
      gateFailures.push({
        code: "MINIMUM_PASS_RATE",
        reason: `Pass rate ${passRate.toFixed(4)} is below ${policy.minimumPassRate.toFixed(4)}.`,
        affectedCaseIds: cases
          .filter(({ verdict }) => verdict === "FAIL" || verdict === "WARNING")
          .map(({ caseId }) => caseId),
      });
    }

    const operationallyFailed =
      errorRate > policy.maximumErrorRate || budgetExhaustedCases.length > 0;
    const qualityFailed = gateFailures.some(
      (failure) => failure.code !== "OPERATIONAL_ERROR_RATE" && failure.code !== "BUDGET_EXHAUSTED",
    );

    return {
      artifactSchemaVersion: ARTIFACT_SCHEMA_VERSION,
      metadata,
      status: operationallyFailed
        ? "OPERATIONAL_FAILED"
        : qualityFailed
          ? "QUALITY_FAILED"
          : "PASSED",
      metrics: {
        selectedCases: cases.length,
        executableCases,
        passedCases,
        failedCases,
        warningCases,
        errorCases,
        passRate,
        errorRate,
        categories,
        usageCoverage: usageRecords.length === 0 ? 0 : usageMeasured / usageRecords.length,
        costCoverage: usageRecords.length === 0 ? 0 : allKnownCosts.length / usageRecords.length,
        ...(usageRecords.length === 0
          ? {}
          : {
              totalLatencyMs,
              averageLatencyMs: totalLatencyMs / usageRecords.length,
            }),
        ...(knownInputTokens.length === 0
          ? {}
          : { totalInputTokens: knownInputTokens.reduce((total, tokens) => total + tokens, 0) }),
        ...(knownOutputTokens.length === 0
          ? {}
          : { totalOutputTokens: knownOutputTokens.reduce((total, tokens) => total + tokens, 0) }),
        ...(knownTotalTokens.length === 0
          ? {}
          : { totalTokens: knownTotalTokens.reduce((total, tokens) => total + tokens, 0) }),
        ...(allKnownCosts.length === 0
          ? {}
          : {
              totalEstimatedCostUsd: allKnownCosts.reduce((total, cost) => total + cost, 0),
            }),
      },
      gateFailures,
      cases,
    };
  }
}

/** @deprecated Use RiskScoringEngine. Kept as a migration alias during the MVP. */
export class MinimalScoringEngine extends RiskScoringEngine {}
