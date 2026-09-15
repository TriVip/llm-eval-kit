import type { EvaluationInput, EvaluationResult, Evaluator, JsonValue } from "@llm-eval-kit/core";

import { normalizeText, type UnicodeForm } from "./text-normalization.js";

export type ExactMatchConfig = {
  expected?: string;
  trim?: boolean;
  caseSensitive?: boolean;
  unicodeNormalization?: UnicodeForm;
};

function parseConfig(value: unknown): ExactMatchConfig | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const config = value as Record<string, unknown>;

  if (config.expected !== undefined && typeof config.expected !== "string") {
    return undefined;
  }

  if (config.trim !== undefined && typeof config.trim !== "boolean") {
    return undefined;
  }

  if (config.caseSensitive !== undefined && typeof config.caseSensitive !== "boolean") {
    return undefined;
  }

  if (
    config.unicodeNormalization !== undefined &&
    !["NFC", "NFD", "NFKC", "NFKD"].includes(String(config.unicodeNormalization))
  ) {
    return undefined;
  }

  return config as ExactMatchConfig;
}

export class ExactMatchEvaluator implements Evaluator<unknown> {
  public readonly id = "exact_match";
  public readonly kind = "DETERMINISTIC" as const;

  public async evaluate(input: EvaluationInput, rawConfig: unknown): Promise<EvaluationResult> {
    const startedAt = performance.now();
    const config = parseConfig(rawConfig);

    if (config === undefined) {
      return this.error("Exact-match evaluator configuration is invalid.", startedAt);
    }

    const expected = config.expected ?? input.testCase.expected?.exact;

    if (expected === undefined) {
      return this.error("Exact-match evaluator requires an expected value.", startedAt);
    }

    const actualNormalized = normalizeText(
      config.trim === false ? input.generation.text : input.generation.text.trim(),
      config,
    );
    const expectedNormalized = normalizeText(
      config.trim === false ? expected : expected.trim(),
      config,
    );
    const passed = actualNormalized === expectedNormalized;
    const evidence: JsonValue = {
      actual: input.generation.text,
      expected,
    };

    return {
      evaluatorId: this.id,
      kind: this.kind,
      verdict: passed ? "PASS" : "FAIL",
      score: passed ? 1 : 0,
      reason: passed
        ? "The response exactly matches the expected value."
        : "The response does not exactly match the expected value.",
      evidence,
      durationMs: performance.now() - startedAt,
    };
  }

  private error(reason: string, startedAt: number): EvaluationResult {
    return {
      evaluatorId: this.id,
      kind: this.kind,
      verdict: "ERROR",
      reason,
      durationMs: performance.now() - startedAt,
    };
  }
}
