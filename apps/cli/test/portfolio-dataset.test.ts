import { resolve } from "node:path";

import { loadEvaluationSuite } from "@llm-eval-kit/config";
import { loadMockFixtureFile } from "@llm-eval-kit/providers";
import { describe, expect, it } from "vitest";

const exampleRoot = resolve(process.cwd(), "examples/ecommerce-support");
const minimumCasesByCategory = {
  refund_policy: 12,
  product_information: 10,
  shipping: 10,
  promotions: 10,
  safety_escalation: 8,
} as const;

describe("portfolio dataset", () => {
  it("meets the reviewed Sprint 5 coverage profile", async () => {
    const suite = await loadEvaluationSuite(resolve(exampleRoot, "suite.yaml"));
    const categoryCounts = new Map<string, number>();

    for (const testCase of suite.cases) {
      categoryCounts.set(testCase.category, (categoryCounts.get(testCase.category) ?? 0) + 1);
    }

    expect(suite.cases.length).toBeGreaterThanOrEqual(50);
    for (const [category, minimum] of Object.entries(minimumCasesByCategory)) {
      expect(categoryCounts.get(category) ?? 0, category).toBeGreaterThanOrEqual(minimum);
      const tags = new Set(
        suite.cases.filter((item) => item.category === category).flatMap((item) => item.tags),
      );
      for (const requiredTag of ["positive", "negative", "boundary", "adversarial"]) {
        expect(tags.has(requiredTag), `${category} has ${requiredTag}`).toBe(true);
      }
    }

    const riskCases = suite.cases.filter(
      (item) => item.severity === "HIGH" || item.severity === "CRITICAL",
    );
    expect(riskCases.length / suite.cases.length).toBeGreaterThanOrEqual(0.2);
    expect(new Set(suite.cases.map((item) => item.severity))).toEqual(
      new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
    );
  });

  it("has exactly one mock fixture for every reviewed case", async () => {
    const suite = await loadEvaluationSuite(resolve(exampleRoot, "suite.yaml"));
    const fixtureFile = await loadMockFixtureFile(resolve(exampleRoot, "fixtures.json"));
    const caseIds = suite.cases.map((item) => item.id).sort();

    expect(Object.keys(fixtureFile.fixtures).sort()).toEqual(caseIds);
    expect(suite.cases.find((item) => item.id === "REFUND_001")?.expected).toMatchObject({
      mustContain: ["14 days"],
      mustNotContain: ["30 days"],
    });
  });
});
