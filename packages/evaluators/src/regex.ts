import type { EvaluationInput, EvaluationResult, Evaluator, JsonValue } from "@llm-eval-kit/core";

export type RegexConfig = { pattern: string; flags?: string };

function parseConfig(value: unknown): RegexConfig | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const config = value as Record<string, unknown>;
  if (typeof config.pattern !== "string" || config.pattern.length === 0) return undefined;
  if (config.flags !== undefined && typeof config.flags !== "string") return undefined;
  return config as RegexConfig;
}

export class RegexEvaluator implements Evaluator<unknown> {
  public readonly id = "regex";
  public readonly kind = "DETERMINISTIC" as const;

  public async evaluate(input: EvaluationInput, rawConfig: unknown): Promise<EvaluationResult> {
    const startedAt = performance.now();
    const config = parseConfig(rawConfig);
    if (config === undefined)
      return this.error("Regex evaluator configuration is invalid.", startedAt);

    let expression: RegExp;
    try {
      expression = new RegExp(config.pattern, config.flags);
    } catch {
      return this.error("Regex evaluator configuration is invalid.", startedAt);
    }

    const match = expression.exec(input.generation.text);
    const evidence: JsonValue = {
      pattern: config.pattern,
      flags: config.flags ?? "",
      matchedText: match?.[0] ?? null,
    };
    return {
      evaluatorId: this.id,
      kind: this.kind,
      verdict: match === null ? "FAIL" : "PASS",
      reason:
        match === null
          ? "The response does not match the pattern."
          : "The response matches the pattern.",
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
