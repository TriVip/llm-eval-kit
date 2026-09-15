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

export type OpenAiProviderOptions = {
  fetch?: FetchLike;
  environment?: Readonly<Record<string, string | undefined>>;
  baseUrl?: string;
  now?: () => number;
  maxConcurrency?: number;
};

function textFromResponse(body: Record<string, unknown>): string {
  if (typeof body.output_text === "string") return body.output_text;
  if (!Array.isArray(body.output)) return "";
  return body.output
    .flatMap((item) => {
      if (!isRecord(item) || !Array.isArray(item.content)) return [];
      return item.content.flatMap((content) =>
        isRecord(content) && typeof content.text === "string" ? [content.text] : [],
      );
    })
    .join("");
}

function usageFromResponse(body: Record<string, unknown>): UsageMetrics {
  const raw = isRecord(body.usage) ? body.usage : {};
  return {
    ...(typeof raw.input_tokens === "number" ? { inputTokens: raw.input_tokens } : {}),
    ...(typeof raw.output_tokens === "number" ? { outputTokens: raw.output_tokens } : {}),
    ...(typeof raw.total_tokens === "number" ? { totalTokens: raw.total_tokens } : {}),
  };
}

function promptInput(request: GenerationRequest): Array<Record<string, unknown>> {
  const userText =
    request.context === undefined
      ? request.user
      : `Context:\n${request.context}\n\nUser request:\n${request.user}`;
  return [
    ...(request.system === undefined
      ? []
      : [{ role: "system", content: [{ type: "input_text", text: request.system }] }]),
    { role: "user", content: [{ type: "input_text", text: userText }] },
  ];
}

export class OpenAiProvider implements LlmProvider {
  public readonly id = "openai";
  public readonly maxConcurrency: number;
  private readonly fetch: FetchLike;
  private readonly environment: Readonly<Record<string, string | undefined>>;
  private readonly baseUrl: string;
  private readonly now: () => number;

  public constructor(options: OpenAiProviderOptions = {}) {
    this.fetch = options.fetch ?? fetch;
    this.environment = options.environment ?? process.env;
    this.baseUrl = (options.baseUrl ?? "https://api.openai.com").replace(/\/$/, "");
    this.now = options.now ?? Date.now;
    this.maxConcurrency = options.maxConcurrency ?? 4;
  }

  public async generate(
    request: GenerationRequest,
    context: ProviderExecutionContext,
  ): Promise<GenerationResult> {
    const apiKey = apiKeyFromEnvironment(
      "OpenAI",
      request.target.apiKeyEnv,
      "OPENAI_API_KEY",
      this.environment,
    );
    const startedAt = this.now();

    try {
      const response = await this.fetch(`${this.baseUrl}/v1/responses`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: request.target.model,
          input: promptInput(request),
          ...(request.target.temperature === undefined
            ? {}
            : { temperature: request.target.temperature }),
          ...(request.target.maxOutputTokens === undefined
            ? {}
            : { max_output_tokens: request.target.maxOutputTokens }),
        }),
        signal: context.signal,
      });
      if (!response.ok) throw httpProviderError("OpenAI", response.status);
      const parsed = await parseJsonResponse(response);
      if (!isRecord(parsed)) {
        throw new ProviderError({
          code: "PROVIDER_INVALID_RESPONSE",
          safeMessage: "OpenAI returned an invalid response shape.",
          retryable: false,
        });
      }
      const text = textFromResponse(parsed);
      if (text.length === 0) {
        throw new ProviderError({
          code: "PROVIDER_INVALID_RESPONSE",
          safeMessage: "OpenAI response did not contain generated text.",
          retryable: false,
        });
      }
      const usage = usageFromResponse(parsed);
      const estimatedCostUsd = estimateUsageCost(usage, request.target.pricing);
      return {
        text,
        usage: { ...usage, ...(estimatedCostUsd === undefined ? {} : { estimatedCostUsd }) },
        latencyMs: Math.max(0, this.now() - startedAt),
        resolvedProvider: this.id,
        resolvedModel: typeof parsed.model === "string" ? parsed.model : request.target.model,
        ...(typeof parsed.id === "string" ? { providerRequestId: parsed.id } : {}),
        ...(typeof parsed.status === "string" ? { finishReason: parsed.status } : {}),
      };
    } catch (error) {
      throw networkProviderError("OpenAI", error);
    }
  }
}
