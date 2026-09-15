import type { EvaluationInput, EvaluationResult, Evaluator, JsonValue } from "@llm-eval-kit/core";

import {
  isTextNormalizationConfig,
  normalizeText,
  type TextNormalizationConfig,
} from "./text-normalization.js";

export type ContainsConfig = TextNormalizationConfig & {
  values?: string[];
  match?: "all" | "any";
};

function parseConfig(value: unknown): ContainsConfig | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const config = value as Record<string, unknown>;
  if (!isTextNormalizationConfig(config)) return undefined;
  if (
    config.values !== undefined &&
    (!Array.isArray(config.values) ||
      config.values.length === 0 ||
      config.values.some((item) => typeof item !== "string" || item.length === 0))
  ) {
    return undefined;
  }
  if (config.match !== undefined && config.match !== "all" && config.match !== "any") {
    return undefined;
  }
  return config as ContainsConfig;
}

export class ContainsEvaluator implements Evaluator<unknown> {
  public readonly id = "contains";
  public readonly kind = "DETERMINISTIC" as const;

  public async evaluate(input: EvaluationInput, rawConfig: unknown): Promise<EvaluationResult> {
    const startedAt = performance.now();
    const config = parseConfig(rawConfig);
    const values = config?.values ?? input.testCase.expected?.mustContain;

    if (config === undefined || values === undefined || values.length === 0) {
      return this.error("Contains evaluator requires valid non-empty values.", startedAt);
    }

    const actual = normalizeText(input.generation.text, config);
    const checks = values.map((value) => ({
      value,
      matched: actual.includes(normalizeText(value, config)),
    }));
    const passed =
      config.match === "any"
        ? checks.some(({ matched }) => matched)
        : checks.every(({ matched }) => matched);
    const evidence: JsonValue = {
      expectedValues: values,
      matchedValues: checks.filter(({ matched }) => matched).map(({ value }) => value),
      missingValues: checks.filter(({ matched }) => !matched).map(({ value }) => value),
      match: config.match ?? "all",
    };

    return {
      evaluatorId: this.id,
      kind: this.kind,
      verdict: passed ? "PASS" : "FAIL",
      reason: passed
        ? "The response contains the required text."
        : "The response is missing required text.",
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
