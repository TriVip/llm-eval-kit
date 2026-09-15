import {
  ProviderError,
  type GenerationRequest,
  type GenerationResult,
  type LlmProvider,
  type ProviderExecutionContext,
  type UsageMetrics,
} from "@llm-eval-kit/core";

import {
  apiKeyFromEnvironment,
  httpProviderError,
  isRecord,
  networkProviderError,
  parseJsonResponse,
  type FetchLike,
} from "./http.js";
import { estimateUsageCost } from "./pricing.js";

export type GeminiProviderOptions = {
  fetch?: FetchLike;
  environment?: Readonly<Record<string, string | undefined>>;
  baseUrl?: string;
  now?: () => number;
  maxConcurrency?: number;
};

function textFromResponse(body: Record<string, unknown>): string {
  if (!Array.isArray(body.candidates)) return "";
  return body.candidates
    .flatMap((candidate) => {
      if (!isRecord(candidate) || !isRecord(candidate.content)) return [];
      const parts = candidate.content.parts;
      if (!Array.isArray(parts)) return [];
      return parts.flatMap((part) =>
        isRecord(part) && typeof part.text === "string" ? [part.text] : [],
      );
    })
    .join("");
}

function usageFromResponse(body: Record<string, unknown>): UsageMetrics {
  const raw = isRecord(body.usageMetadata) ? body.usageMetadata : {};
  return {
    ...(typeof raw.promptTokenCount === "number" ? { inputTokens: raw.promptTokenCount } : {}),
    ...(typeof raw.candidatesTokenCount === "number"
      ? { outputTokens: raw.candidatesTokenCount }
      : {}),
    ...(typeof raw.totalTokenCount === "number" ? { totalTokens: raw.totalTokenCount } : {}),
  };
}

function finishReason(body: Record<string, unknown>): string | undefined {
  const first = Array.isArray(body.candidates) ? body.candidates[0] : undefined;
  return isRecord(first) && typeof first.finishReason === "string" ? first.finishReason : undefined;
}

export class GeminiProvider implements LlmProvider {
  public readonly id = "gemini";
  public readonly maxConcurrency: number;
  private readonly fetch: FetchLike;
  private readonly environment: Readonly<Record<string, string | undefined>>;
  private readonly baseUrl: string;
  private readonly now: () => number;

  public constructor(options: GeminiProviderOptions = {}) {
    this.fetch = options.fetch ?? fetch;
    this.environment = options.environment ?? process.env;
    this.baseUrl = (options.baseUrl ?? "https://generativelanguage.googleapis.com").replace(
      /\/$/,
      "",
    );
    this.now = options.now ?? Date.now;
    this.maxConcurrency = options.maxConcurrency ?? 4;
  }

  public async generate(
    request: GenerationRequest,
    context: ProviderExecutionContext,
  ): Promise<GenerationResult> {
    const apiKey = apiKeyFromEnvironment(
      "Gemini",
      request.target.apiKeyEnv,
      "GEMINI_API_KEY",
      this.environment,
    );
    const startedAt = this.now();
    const userText =
      request.context === undefined
        ? request.user
        : `Context:\n${request.context}\n\nUser request:\n${request.user}`;

    try {
      const response = await this.fetch(
        `${this.baseUrl}/v1beta/models/${encodeURIComponent(request.target.model)}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: userText }] }],
            ...(request.system === undefined
              ? {}
              : { systemInstruction: { parts: [{ text: request.system }] } }),
            generationConfig: {
              ...(request.target.temperature === undefined
                ? {}
                : { temperature: request.target.temperature }),
              ...(request.target.maxOutputTokens === undefined
                ? {}
                : { maxOutputTokens: request.target.maxOutputTokens }),
            },
          }),
          signal: context.signal,
        },
      );
      if (!response.ok) throw httpProviderError("Gemini", response.status);
      const parsed = await parseJsonResponse(response);
      if (!isRecord(parsed)) {
        throw new ProviderError({
          code: "PROVIDER_INVALID_RESPONSE",
          safeMessage: "Gemini returned an invalid response shape.",
          retryable: false,
        });
      }
      const text = textFromResponse(parsed);
      if (text.length === 0) {
        throw new ProviderError({
          code: "PROVIDER_INVALID_RESPONSE",
          safeMessage: "Gemini response did not contain generated text.",
          retryable: false,
        });
      }
      const usage = usageFromResponse(parsed);
      const estimatedCostUsd = estimateUsageCost(usage, request.target.pricing);
      const reason = finishReason(parsed);
      return {
        text,
        usage: { ...usage, ...(estimatedCostUsd === undefined ? {} : { estimatedCostUsd }) },
        latencyMs: Math.max(0, this.now() - startedAt),
        resolvedProvider: this.id,
        resolvedModel:
          typeof parsed.modelVersion === "string" ? parsed.modelVersion : request.target.model,
        ...(typeof parsed.responseId === "string" ? { providerRequestId: parsed.responseId } : {}),
        ...(reason === undefined ? {} : { finishReason: reason }),
      };
    } catch (error) {
      throw networkProviderError("Gemini", error);
    }
  }
}
