import type { TokenPricing, UsageMetrics } from "@llm-eval-kit/core";

export function estimateUsageCost(
  usage: UsageMetrics,
  pricing: TokenPricing | undefined,
): number | undefined {
  if (
    pricing === undefined ||
    usage.inputTokens === undefined ||
    usage.outputTokens === undefined
  ) {
    return undefined;
  }
  return (
    (usage.inputTokens * pricing.inputUsdPerMillionTokens +
      usage.outputTokens * pricing.outputUsdPerMillionTokens) /
    1_000_000
  );
}
