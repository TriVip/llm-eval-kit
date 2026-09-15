import { describe, expect, it } from "vitest";

import type { EvaluationInput } from "@llm-eval-kit/core";

import { ContainsEvaluator, ForbiddenEvaluator, RegexEvaluator } from "../src/index.js";

function evaluationInput(text: string): EvaluationInput {
  return {
    testCase: {
      id: "CASE_001",
      name: "Text rules",
      category: "policy",
      severity: "HIGH",
      tags: [],
      input: { user: "Question", variables: {} },
      expected: { mustContain: ["14 days"], mustNotContain: ["30 days"] },
      evaluators: [],
    },
    generation: {
      text,
      usage: {},
      latencyMs: 1,
      resolvedProvider: "mock",
      resolvedModel: "fixture-v1",
    },
  };
}

describe("ContainsEvaluator", () => {
  it("matches all configured values with Unicode and case normalization", async () => {
    const result = await new ContainsEvaluator().evaluate(evaluationInput("CAFÉ — 14 DAYS"), {
      values: ["cafe\u0301", "14 days"],
      caseSensitive: false,
      unicodeNormalization: "NFC",
    });
    expect(result).toMatchObject({ verdict: "PASS", kind: "DETERMINISTIC" });
  });

  it("supports any matching and reports missing evidence", async () => {
    const evaluator = new ContainsEvaluator();
    await expect(
      evaluator.evaluate(evaluationInput("window is 14 days"), {
        values: ["14", "30"],
        match: "any",
      }),
    ).resolves.toMatchObject({ verdict: "PASS" });
    const failed = await evaluator.evaluate(evaluationInput("unknown"), {});
    expect(failed).toMatchObject({ verdict: "FAIL", evidence: { missingValues: ["14 days"] } });
  });

  it("returns ERROR for invalid or absent expectations", async () => {
    const input = evaluationInput("answer");
    delete input.testCase.expected;
    await expect(new ContainsEvaluator().evaluate(input, { values: [] })).resolves.toMatchObject({
      verdict: "ERROR",
    });
  });
});

describe("ForbiddenEvaluator", () => {
  it("fails when forbidden text appears and otherwise passes", async () => {
    const evaluator = new ForbiddenEvaluator();
    await expect(
      evaluator.evaluate(evaluationInput("The window is 30 DAYS."), { caseSensitive: false }),
    ).resolves.toMatchObject({ verdict: "FAIL", evidence: { foundValues: ["30 days"] } });
    await expect(
      evaluator.evaluate(evaluationInput("The window is 14 days."), {}),
    ).resolves.toMatchObject({ verdict: "PASS" });
  });

  it("returns ERROR for invalid configuration", async () => {
    await expect(
      new ForbiddenEvaluator().evaluate(evaluationInput("answer"), { values: "bad" }),
    ).resolves.toMatchObject({ verdict: "ERROR" });
  });
});

describe("RegexEvaluator", () => {
  it("returns match evidence for a valid expression", async () => {
    await expect(
      new RegexEvaluator().evaluate(evaluationInput("Order SKU-1234 is ready"), {
        pattern: "SKU-\\d{4}",
        flags: "u",
      }),
    ).resolves.toMatchObject({ verdict: "PASS", evidence: { matchedText: "SKU-1234" } });
  });

  it("returns FAIL for no match and ERROR for invalid expressions", async () => {
    const evaluator = new RegexEvaluator();
    await expect(
      evaluator.evaluate(evaluationInput("none"), { pattern: "SKU-\\d+" }),
    ).resolves.toMatchObject({ verdict: "FAIL" });
    await expect(
      evaluator.evaluate(evaluationInput("none"), { pattern: "[" }),
    ).resolves.toMatchObject({ verdict: "ERROR" });
    await expect(evaluator.evaluate(evaluationInput("none"), null)).resolves.toMatchObject({
      verdict: "ERROR",
    });
  });
});
