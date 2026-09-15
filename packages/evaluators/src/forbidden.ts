import type { EvaluationInput, EvaluationResult, Evaluator, JsonValue } from "@llm-eval-kit/core";

import {
  isTextNormalizationConfig,
  normalizeText,
  type TextNormalizationConfig,
} from "./text-normalization.js";

export type ForbiddenConfig = TextNormalizationConfig & { values?: string[] };

function parseConfig(value: unknown): ForbiddenConfig | undefined {
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
  return config as ForbiddenConfig;
}

export class ForbiddenEvaluator implements Evaluator<unknown> {
  public readonly id = "forbidden";
  public readonly kind = "DETERMINISTIC" as const;

  public async evaluate(input: EvaluationInput, rawConfig: unknown): Promise<EvaluationResult> {
    const startedAt = performance.now();
    const config = parseConfig(rawConfig);
    const values = config?.values ?? input.testCase.expected?.mustNotContain;

    if (config === undefined || values === undefined || values.length === 0) {
      return this.error("Forbidden evaluator requires valid non-empty values.", startedAt);
    }

    const actual = normalizeText(input.generation.text, config);
    const found = values.filter((value) => actual.includes(normalizeText(value, config)));
    const evidence: JsonValue = { forbiddenValues: values, foundValues: found };

    return {
      evaluatorId: this.id,
      kind: this.kind,
      verdict: found.length === 0 ? "PASS" : "FAIL",
      reason:
        found.length === 0
          ? "The response does not contain forbidden text."
          : "The response contains forbidden text.",
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
