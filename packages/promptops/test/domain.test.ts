import { describe, expect, it } from "vitest";

import {
  DECISION_ACTIONS,
  DECISION_OUTCOMES,
  EXPERIMENT_STATES,
  PROMPTOPS_ERROR_CODES,
  RECOMMENDATION_STATES,
} from "../src/index.js";

describe("PromptOps domain enums", () => {
  it("keeps lifecycle and decision values exhaustive and stable", () => {
    expect(EXPERIMENT_STATES).toEqual([
      "DRAFT",
      "PLANNED",
      "RUNNING",
      "CANCELLING",
      "PARTIAL",
      "COMPLETED",
      "FAILED",
    ]);
    expect(RECOMMENDATION_STATES).toEqual(["PROMOTE_CANDIDATE", "KEEP_BASELINE", "NO_DECISION"]);
    expect(DECISION_ACTIONS).toEqual(["ACCEPT_RECOMMENDATION", "OVERRIDE_RECOMMENDATION"]);
    expect(DECISION_OUTCOMES).toEqual(["PROMOTE_CANDIDATE", "KEEP_BASELINE", "DEFER"]);
    expect(new Set(PROMPTOPS_ERROR_CODES).size).toBe(PROMPTOPS_ERROR_CODES.length);
  });
});
