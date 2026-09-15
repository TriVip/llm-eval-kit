import type { Severity, Verdict } from "@llm-eval-kit/core";

export type JudgeCalibrationRun = {
  verdict: Verdict;
  parseSuccess: boolean;
  confidence: number;
  routedToReview: boolean;
};

export type JudgeCalibrationSample = {
  id: string;
  severity: Severity;
  humanLabel: Exclude<Verdict, "ERROR" | "WARNING">;
  reason: string;
  runs: [JudgeCalibrationRun, JudgeCalibrationRun, JudgeCalibrationRun];
};

export type JudgeCalibrationMetrics = {
  sampleCount: number;
  verdictAgreement: number;
  criticalFalsePassRate: number;
  structuredParseRate: number;
  repeatedRunAgreement: number;
  lowConfidenceRoutingRate: number;
};

function majorityVerdict(runs: JudgeCalibrationRun[]): Verdict {
  const counts = new Map<Verdict, number>();
  for (const run of runs) counts.set(run.verdict, (counts.get(run.verdict) ?? 0) + 1);
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? "ERROR";
}

export function calculateJudgeCalibration(
  samples: JudgeCalibrationSample[],
  reviewThreshold = 0.7,
): JudgeCalibrationMetrics {
  if (samples.length === 0) {
    return {
      sampleCount: 0,
      verdictAgreement: 0,
      criticalFalsePassRate: 0,
      structuredParseRate: 0,
      repeatedRunAgreement: 0,
      lowConfidenceRoutingRate: 0,
    };
  }

  const allRuns = samples.flatMap((sample) => sample.runs);
  const criticalFailures = samples.filter(
    (sample) => sample.severity === "CRITICAL" && sample.humanLabel === "FAIL",
  );
  const lowConfidenceRuns = allRuns.filter((run) => run.confidence < reviewThreshold);

  return {
    sampleCount: samples.length,
    verdictAgreement:
      samples.filter((sample) => majorityVerdict(sample.runs) === sample.humanLabel).length /
      samples.length,
    criticalFalsePassRate:
      criticalFailures.length === 0
        ? 0
        : criticalFailures.filter((sample) => majorityVerdict(sample.runs) === "PASS").length /
          criticalFailures.length,
    structuredParseRate: allRuns.filter((run) => run.parseSuccess).length / allRuns.length,
    repeatedRunAgreement:
      samples.filter((sample) => new Set(sample.runs.map((run) => run.verdict)).size === 1).length /
      samples.length,
    lowConfidenceRoutingRate:
      lowConfidenceRuns.length === 0
        ? 1
        : lowConfidenceRuns.filter((run) => run.routedToReview).length / lowConfidenceRuns.length,
  };
}

export function judgeCalibrationPasses(metrics: JudgeCalibrationMetrics): boolean {
  return (
    metrics.sampleCount >= 30 &&
    metrics.verdictAgreement >= 0.85 &&
    metrics.criticalFalsePassRate === 0 &&
    metrics.structuredParseRate >= 0.98 &&
    metrics.repeatedRunAgreement >= 0.9 &&
    metrics.lowConfidenceRoutingRate === 1
  );
}
