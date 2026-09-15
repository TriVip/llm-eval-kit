import { describe, expect, it } from "vitest";

import {
  ProviderError,
  type GenerationRequest,
  type ProviderExecutionContext,
} from "@llm-eval-kit/core";

import {
  estimateUsageCost,
  GeminiProvider,
  httpProviderError,
  networkProviderError,
  OpenAiProvider,
  parseJsonResponse,
  type FetchLike,
} from "../src/index.js";

const context: ProviderExecutionContext = {
  runId: "run_1",
  caseId: "CASE_1",
  attemptId: "attempt_1",
  signal: new AbortController().signal,
};

function request(provider: string): GenerationRequest {
  return {
    system: "Follow policy",
    user: "Can I return this?",
    context: "Returns are allowed for 14 days.",
    variables: {},
    target: {
      provider,
      model: "test-model",
      temperature: 0,
      maxOutputTokens: 100,
      pricing: { inputUsdPerMillionTokens: 1, outputUsdPerMillionTokens: 2 },
    },
  };
}

describe("OpenAI provider adapter", () => {
  it("normalizes Responses API text, identifiers, usage, latency, and cost", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    const provider = new OpenAiProvider({
      environment: { OPENAI_API_KEY: "test-secret" },
      now: (() => {
        const values = [100, 125];
        return () => values.shift() ?? 125;
      })(),
      fetch: async (input, init) => {
        capturedUrl = String(input);
        capturedInit = init;
        return new Response(
          JSON.stringify({
            id: "resp_123",
            model: "resolved-openai-model",
            status: "completed",
            output: [{ content: [{ type: "output_text", text: "Fourteen days." }] }],
            usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    });

    const result = await provider.generate(request("openai"), context);

    expect(capturedUrl).toBe("https://api.openai.com/v1/responses");
    expect(capturedInit?.headers).toMatchObject({ Authorization: "Bearer test-secret" });
    expect(JSON.parse(String(capturedInit?.body))).toMatchObject({
      model: "test-model",
      temperature: 0,
      max_output_tokens: 100,
    });
    expect(result).toEqual({
      text: "Fourteen days.",
      usage: {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        estimatedCostUsd: 0.0002,
      },
      latencyMs: 25,
      providerRequestId: "resp_123",
      finishReason: "completed",
      resolvedProvider: "openai",
      resolvedModel: "resolved-openai-model",
    });
  });

  it("maps HTTP failures without leaking API keys", async () => {
    const secret = "must-not-appear";
    const provider = new OpenAiProvider({
      environment: { OPENAI_API_KEY: secret },
      fetch: async () => new Response("{}", { status: 401 }),
    });
    const error = await provider
      .generate(request("openai"), context)
      .catch((cause: unknown) => cause);
    expect(error).toMatchObject({ code: "PROVIDER_AUTHENTICATION_ERROR", retryable: false });
    expect(JSON.stringify(error)).not.toContain(secret);
  });

  it("requires an environment key before invoking the transport", async () => {
    let called = false;
    const provider = new OpenAiProvider({
      environment: {},
      fetch: (async () => {
        called = true;
        return new Response("{}");
      }) as FetchLike,
    });
    await expect(provider.generate(request("openai"), context)).rejects.toMatchObject({
      code: "PROVIDER_AUTHENTICATION_ERROR",
    });
    expect(called).toBe(false);
  });
});

describe("Gemini provider adapter", () => {
  it("normalizes generateContent while preserving unavailable usage as unknown", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    const provider = new GeminiProvider({
      environment: { GEMINI_API_KEY: "gemini-secret" },
      now: () => 50,
      fetch: async (input, init) => {
        capturedUrl = String(input);
        capturedInit = init;
        return new Response(
          JSON.stringify({
            responseId: "gem_123",
            modelVersion: "resolved-gemini-model",
            candidates: [
              { content: { parts: [{ text: "Fourteen days." }] }, finishReason: "STOP" },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    });

    const result = await provider.generate(request("gemini"), context);

    expect(capturedUrl).toContain("/v1beta/models/test-model:generateContent");
    expect(capturedInit?.headers).toMatchObject({ "x-goog-api-key": "gemini-secret" });
    expect(result).toEqual({
      text: "Fourteen days.",
      usage: {},
      latencyMs: 0,
      providerRequestId: "gem_123",
      finishReason: "STOP",
      resolvedProvider: "gemini",
      resolvedModel: "resolved-gemini-model",
    });
    expect(result.usage.estimatedCostUsd).toBeUndefined();
  });

  it("marks rate limits and server failures as retryable", async () => {
    for (const status of [429, 503]) {
      const provider = new GeminiProvider({
        environment: { GEMINI_API_KEY: "secret" },
        fetch: async () => new Response("{}", { status }),
      });
      await expect(provider.generate(request("gemini"), context)).rejects.toMatchObject({
        retryable: true,
      });
    }
  });
});

describe("provider error and pricing normalization", () => {
  it("maps every supported HTTP error class", () => {
    expect(httpProviderError("Provider", 408)).toMatchObject({
      code: "PROVIDER_TIMEOUT",
      retryable: true,
    });
    expect(httpProviderError("Provider", 400)).toMatchObject({
      code: "PROVIDER_INVALID_REQUEST",
      retryable: false,
    });
    expect(httpProviderError("Provider", 500)).toMatchObject({
      code: "PROVIDER_SERVER_ERROR",
      retryable: true,
    });
    expect(httpProviderError("Provider", 302)).toMatchObject({
      code: "PROVIDER_HTTP_ERROR",
      retryable: false,
    });
  });

  it("normalizes aborts, network errors, and pre-normalized provider errors", () => {
    const normalized = new ProviderError({
      code: "ALREADY_NORMALIZED",
      safeMessage: "safe",
      retryable: false,
    });
    expect(networkProviderError("Provider", normalized)).toBe(normalized);
    expect(networkProviderError("Provider", new DOMException("abort", "AbortError"))).toMatchObject(
      {
        code: "PROVIDER_TIMEOUT",
        retryable: true,
      },
    );
    expect(networkProviderError("Provider", new Error("socket secret"))).toMatchObject({
      code: "PROVIDER_NETWORK_ERROR",
      safeMessage: "Provider could not be reached.",
      retryable: true,
    });
  });

  it("rejects malformed JSON and keeps unknown price inputs unavailable", async () => {
    await expect(parseJsonResponse(new Response("not-json"))).rejects.toMatchObject({
      code: "PROVIDER_INVALID_RESPONSE",
    });
    expect(
      estimateUsageCost(
        { inputTokens: 1, outputTokens: 1 },
        { inputUsdPerMillionTokens: 1, outputUsdPerMillionTokens: 1 },
      ),
    ).toBe(0.000002);
    expect(estimateUsageCost({}, undefined)).toBeUndefined();
    expect(
      estimateUsageCost({}, { inputUsdPerMillionTokens: 1, outputUsdPerMillionTokens: 1 }),
    ).toBeUndefined();
  });
});
