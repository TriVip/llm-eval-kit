import type { BaselineComparison, RunArtifact } from "@llm-eval-kit/core";

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

export function renderTerminalReport(
  artifact: RunArtifact,
  paths: string[] = [],
  comparison?: BaselineComparison,
): string {
  const { metrics } = artifact;
  const failedCategories = metrics.categories
    .filter(({ failedCases, errorCases }) => failedCases + errorCases > 0)
    .sort((left, right) => left.passRate - right.passRate)
    .slice(0, 5);
  const criticalFailures = artifact.cases.filter(
    ({ severity, verdict }) => severity === "CRITICAL" && verdict === "FAIL",
  );
  return [
    `Run: ${artifact.metadata.runId}`,
    `Suite: ${artifact.metadata.suiteId}`,
    `Status: ${artifact.status}`,
    `Cases: ${metrics.passedCases} passed, ${metrics.failedCases} failed, ${metrics.warningCases} warnings, ${metrics.errorCases} errors`,
    `Pass rate: ${percent(metrics.passRate)}`,
    ...(metrics.totalLatencyMs === undefined
      ? []
      : [`Total latency: ${metrics.totalLatencyMs.toFixed(0)} ms`]),
    ...(metrics.totalEstimatedCostUsd === undefined
      ? []
      : [`Estimated cost: $${metrics.totalEstimatedCostUsd.toFixed(6)}`]),
    ...artifact.gateFailures.map(
      (failure) =>
        `Gate failure [${failure.code}]: ${failure.reason} Cases: ${failure.affectedCaseIds.join(", ") || "none"}`,
    ),
    ...failedCategories.map(
      (category) => `Failed category: ${category.category} (${percent(category.passRate)} pass)`,
    ),
    ...(criticalFailures.length === 0
      ? []
      : [`Critical failures: ${criticalFailures.map(({ caseId }) => caseId).join(", ")}`]),
    ...(comparison === undefined
      ? []
      : [
          `Baseline: ${comparison.baselineRunId}`,
          `Regression status: ${comparison.status}`,
          `Matched/added/removed/changed: ${comparison.classification.matched.length}/${comparison.classification.added.length}/${comparison.classification.removed.length}/${comparison.classification.changed.length}`,
        ]),
    ...paths.map((path) => (path.endsWith("run.json") ? `Artifact: ${path}` : `Report: ${path}`)),
    "",
  ].join("\n");
}
