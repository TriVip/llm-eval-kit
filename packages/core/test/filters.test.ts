import { describe, expect, it } from "vitest";

import {
  DatasetValidationError,
  filterEvaluationSuite,
  type EvaluationSuite,
} from "../src/index.js";

const suite: EvaluationSuite = {
  schemaVersion: "1.0",
  id: "filter-suite",
  name: "Filter suite",
  cases: [
    {
      id: "A",
      name: "A",
      category: "refund",
      severity: "CRITICAL",
      tags: ["smoke"],
      input: { user: "A", variables: {} },
      evaluators: [{ id: "a", type: "exact_match", required: true, weight: 1, config: {} }],
    },
    {
      id: "B",
      name: "B",
      category: "refund",
      severity: "LOW",
      tags: ["regression"],
      input: { user: "B", variables: {} },
      evaluators: [{ id: "b", type: "exact_match", required: true, weight: 1, config: {} }],
    },
    {
      id: "C",
      name: "C",
      category: "shipping",
      severity: "HIGH",
      tags: ["smoke", "api"],
      input: { user: "C", variables: {} },
      evaluators: [{ id: "c", type: "exact_match", required: true, weight: 1, config: {} }],
    },
  ],
};

describe("filterEvaluationSuite", () => {
  it("supports independent and combined case/category/severity/tag filters", () => {
    expect(filterEvaluationSuite(suite, { caseIds: ["B"] }).cases.map(({ id }) => id)).toEqual([
      "B",
    ]);
    expect(
      filterEvaluationSuite(suite, { categories: ["refund"] }).cases.map(({ id }) => id),
    ).toEqual(["A", "B"]);
    expect(
      filterEvaluationSuite(suite, { severities: ["HIGH"] }).cases.map(({ id }) => id),
    ).toEqual(["C"]);
    expect(
      filterEvaluationSuite(suite, { tags: ["api", "unknown"] }).cases.map(({ id }) => id),
    ).toEqual(["C"]);
    expect(
      filterEvaluationSuite(suite, {
        categories: ["refund"],
        severities: ["CRITICAL"],
        tags: ["smoke"],
      }).cases.map(({ id }) => id),
    ).toEqual(["A"]);
  });

  it("returns the full suite without filters and preserves source order", () => {
    expect(filterEvaluationSuite(suite).cases.map(({ id }) => id)).toEqual(["A", "B", "C"]);
  });

  it("throws an actionable validation error for an empty selection", () => {
    expect(() => filterEvaluationSuite(suite, { categories: ["missing"] })).toThrow(
      DatasetValidationError,
    );
    expect(() =>
      filterEvaluationSuite(suite, { categories: ["refund"], severities: ["HIGH"] }),
    ).toThrow(/No evaluation cases matched/);
  });
});
