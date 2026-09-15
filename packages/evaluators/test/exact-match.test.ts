import { describe, expect, it } from "vitest";

import type { EvaluationInput } from "@llm-eval-kit/core";

import { ExactMatchEvaluator } from "../src/index.js";

const makeInput = (actual: string, expected?: string): EvaluationInput => ({
  testCase: {
    id: "CASE_001",
    name: "Exact response",
    category: "response_contract",
    severity: "HIGH",
    tags: [],
    input: { user: "Question", variables: {} },
    ...(expected === undefined ? {} : { expected: { exact: expected } }),
    evaluators: [
      { id: "exact-response", type: "exact_match", required: true, weight: 1, config: {} },
    ],
  },
  generation: {
    text: actual,
    usage: {},
    latencyMs: 0,
    resolvedProvider: "mock",
    resolvedModel: "fixture-v1",
  },
});

describe("ExactMatchEvaluator", () => {
  const evaluator = new ExactMatchEvaluator();

  it("passes equal values and trims surrounding whitespace by default", async () => {
    const result = await evaluator.evaluate(makeInput("  Hanoi  ", "Hanoi"), {});

    expect(result).toMatchObject({ verdict: "PASS", score: 1 });
  });

  it("supports case-insensitive and Unicode-normalized comparison", async () => {
    const result = await evaluator.evaluate(makeInput("CAFE\u0301", "café"), {
      caseSensitive: false,
      unicodeNormalization: "NFC",
    });

    expect(result.verdict).toBe("PASS");
  });

  it("fails with inspectable evidence when values differ", async () => {
    const result = await evaluator.evaluate(makeInput("30 days", "14 days"), {});

    expect(result).toMatchObject({
      verdict: "FAIL",
      score: 0,
      evidence: { actual: "30 days", expected: "14 days" },
    });
  });

  it("returns ERROR for invalid configuration or missing expected values", async () => {
    const invalidConfig = await evaluator.evaluate(makeInput("value", "value"), {
      caseSensitive: "no",
    });
    const missingExpected = await evaluator.evaluate(makeInput("value"), {});

    expect(invalidConfig.verdict).toBe("ERROR");
    expect(missingExpected.verdict).toBe("ERROR");
  });
});
