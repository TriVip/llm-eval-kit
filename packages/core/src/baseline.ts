import { ConfigurationError } from "./errors.js";
import type {
  BaselineCaseClassification,
  BaselineComparison,
  CaseResult,
  GateFailure,
  MetricDelta,
  RunArtifact,
} from "./types.js";

export type BaselineComparisonOptions = {
  maximumCategoryRegressionPoints?: number;
};

function major(version: string): string {
  return version.split(".")[0] ?? version;
}

function assertCompatible(candidate: RunArtifact, baseline: RunArtifact): void {
  if (candidate.metadata.suiteId === undefined || baseline.metadata.suiteId === undefined) {
    throw new ConfigurationError(
      "Baseline comparison requires artifacts produced with suite compatibility metadata.",
    );
  }
  if (candidate.metadata.suiteId !== baseline.metadata.suiteId) {
    throw new ConfigurationError(
      `Baseline suite ${baseline.metadata.suiteId} is not compatible with candidate suite ${candidate.metadata.suiteId}.`,
    );
  }
  if (major(candidate.artifactSchemaVersion) !== major(baseline.artifactSchemaVersion)) {
    throw new ConfigurationError("Baseline and candidate artifact schema major versions differ.");
  }
  if (
    candidate.metadata.metricDefinitionsVersion === undefined ||
    baseline.metadata.metricDefinitionsVersion === undefined ||
    candidate.metadata.metricDefinitionsVersion !== baseline.metadata.metricDefinitionsVersion
  ) {
    throw new ConfigurationError("Baseline and candidate metric definitions are not compatible.");
  }
}

function classify(candidate: RunArtifact, baseline: RunArtifact): BaselineCaseClassification {
  const candidateCases = new Map(candidate.cases.map((item) => [item.caseId, item]));
  const baselineCases = new Map(baseline.cases.map((item) => [item.caseId, item]));
  const matched: string[] = [];
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  for (const [caseId, candidateCase] of candidateCases) {
    const baselineCase = baselineCases.get(caseId);
    if (baselineCase === undefined) added.push(caseId);
    else if (candidateCase.definitionHash === baselineCase.definitionHash) matched.push(caseId);
    else changed.push(caseId);
  }
  for (const caseId of baselineCases.keys()) {
    if (!candidateCases.has(caseId)) removed.push(caseId);
  }
  return { matched, added, removed, changed };
}

function passRate(cases: CaseResult[]): number {
  const executable = cases.filter(({ verdict }) => verdict !== "ERROR");
  if (executable.length === 0) return 0;
  return executable.filter(({ verdict }) => verdict === "PASS").length / executable.length;
}

function delta(candidate: number, baseline: number): MetricDelta {
  return { baseline, candidate, delta: candidate - baseline };
}

function optionalDelta(
  candidate: number | undefined,
  baseline: number | undefined,
): MetricDelta | undefined {
  return candidate === undefined || baseline === undefined ? undefined : delta(candidate, baseline);
}

export function compareRunArtifacts(
  candidate: RunArtifact,
  baseline: RunArtifact,
  options: BaselineComparisonOptions = {},
): BaselineComparison {
  assertCompatible(candidate, baseline);
  const classification = classify(candidate, baseline);
  const matched = new Set(classification.matched);
  const candidateCases = candidate.cases.filter(({ caseId }) => matched.has(caseId));
  const baselineById = new Map(baseline.cases.map((item) => [item.caseId, item]));
  const baselineCases = candidateCases.flatMap((item) => {
    const baselineCase = baselineById.get(item.caseId);
    return baselineCase === undefined ? [] : [baselineCase];
  });
  const categories = [...new Set(candidateCases.map(({ category }) => category))]
    .sort()
    .map((category) => {
      const candidateCategory = candidateCases.filter((item) => item.category === category);
      const ids = new Set(candidateCategory.map(({ caseId }) => caseId));
      const baselineCategory = baselineCases.filter(({ caseId }) => ids.has(caseId));
      return {
        category,
        matchedCaseIds: candidateCategory.map(({ caseId }) => caseId),
        passRate: delta(passRate(candidateCategory), passRate(baselineCategory)),
      };
    });
  const maximumRegression = (options.maximumCategoryRegressionPoints ?? 3) / 100;
  const gateFailures: GateFailure[] = categories
    .filter(({ passRate: metric }) => metric.delta < -maximumRegression - 1e-9)
    .map(({ category, matchedCaseIds, passRate: metric }) => ({
      code: "CATEGORY_REGRESSION",
      reason: `${category} regressed by ${Math.abs(metric.delta * 100).toFixed(2)} percentage points.`,
      affectedCaseIds: matchedCaseIds,
    }));
  const criticalRegressionCaseIds = candidateCases
    .filter((item) => {
      const previous = baselineById.get(item.caseId);
      return (
        item.severity === "CRITICAL" && item.verdict === "FAIL" && previous?.verdict !== "FAIL"
      );
    })
    .map(({ caseId }) => caseId);
  if (criticalRegressionCaseIds.length > 0) {
    gateFailures.unshift({
      code: "CRITICAL_CASE_REGRESSION",
      reason: "One or more matched critical cases newly failed.",
      affectedCaseIds: criticalRegressionCaseIds,
    });
  }

  const costDeltaUsd =
    candidate.metrics.costCoverage === 1 && baseline.metrics.costCoverage === 1
      ? optionalDelta(
          candidate.metrics.totalEstimatedCostUsd,
          baseline.metrics.totalEstimatedCostUsd,
        )
      : undefined;
  const latencyDeltaMs =
    candidate.metrics.usageCoverage === 1 && baseline.metrics.usageCoverage === 1
      ? optionalDelta(candidate.metrics.totalLatencyMs, baseline.metrics.totalLatencyMs)
      : undefined;

  return {
    schemaVersion: "1.0",
    baselineRunId: baseline.metadata.runId,
    candidateRunId: candidate.metadata.runId,
    classification,
    overallPassRate: delta(passRate(candidateCases), passRate(baselineCases)),
    categories,
    criticalRegressionCaseIds,
    gateFailures,
    status: gateFailures.length === 0 ? "PASSED" : "QUALITY_FAILED",
    ...(costDeltaUsd === undefined ? {} : { costDeltaUsd }),
    ...(latencyDeltaMs === undefined ? {} : { latencyDeltaMs }),
  };
}
