import { describe, expect, it } from "vitest";

import {
  calculateJudgeCalibration,
  judgeCalibrationPasses,
  type JudgeCalibrationSample,
} from "../src/index.js";

function sample(index: number): JudgeCalibrationSample {
  const humanLabel = index % 2 === 0 ? "PASS" : "FAIL";
  return {
    id: `CAL_${index}`,
    severity: humanLabel === "FAIL" && index < 12 ? "CRITICAL" : "MEDIUM",
    humanLabel,
    reason: "Human-reviewed reference decision.",
    runs: [0, 1, 2].map(() => ({
      verdict: humanLabel,
      parseSuccess: true,
      confidence: index < 4 ? 0.6 : 0.95,
      routedToReview: index < 4,
    })) as JudgeCalibrationSample["runs"],
  };
}

describe("judge calibration", () => {
  it("accepts a representative 30-sample calibration set", () => {
    const metrics = calculateJudgeCalibration(
      Array.from({ length: 30 }, (_, index) => sample(index)),
    );

    expect(metrics).toEqual({
      sampleCount: 30,
      verdictAgreement: 1,
      criticalFalsePassRate: 0,
      structuredParseRate: 1,
      repeatedRunAgreement: 1,
      lowConfidenceRoutingRate: 1,
    });
    expect(judgeCalibrationPasses(metrics)).toBe(true);
  });

  it("rejects unsafe critical false passes and missed review routing", () => {
    const samples = Array.from({ length: 30 }, (_, index) => sample(index));
    samples[1]!.runs = samples[1]!.runs.map((run) => ({
      ...run,
      verdict: "PASS",
    })) as JudgeCalibrationSample["runs"];
    samples[2]!.runs = samples[2]!.runs.map((run) => ({
      ...run,
      routedToReview: false,
    })) as JudgeCalibrationSample["runs"];

    const metrics = calculateJudgeCalibration(samples);

    expect(metrics.criticalFalsePassRate).toBeGreaterThan(0);
    expect(metrics.lowConfidenceRoutingRate).toBeLessThan(1);
    expect(judgeCalibrationPasses(metrics)).toBe(false);
  });
});
