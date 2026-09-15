import { ProviderError } from "@llm-eval-kit/core";

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function parseJsonResponse(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch (cause) {
    throw new ProviderError({
      code: "PROVIDER_INVALID_RESPONSE",
      safeMessage: "Provider returned a malformed JSON response.",
      retryable: false,
      cause,
    });
  }
}

export function httpProviderError(provider: string, status: number): ProviderError {
  if (status === 401 || status === 403) {
    return new ProviderError({
      code: "PROVIDER_AUTHENTICATION_ERROR",
      safeMessage: `${provider} authentication failed.`,
      retryable: false,
    });
  }
  if (status === 408) {
    return new ProviderError({
      code: "PROVIDER_TIMEOUT",
      safeMessage: `${provider} request timed out.`,
      retryable: true,
    });
  }
  if (status === 429) {
    return new ProviderError({
      code: "PROVIDER_RATE_LIMITED",
      safeMessage: `${provider} rate limit was reached.`,
      retryable: true,
    });
  }
  if (status >= 500) {
    return new ProviderError({
      code: "PROVIDER_SERVER_ERROR",
      safeMessage: `${provider} returned a server error.`,
      retryable: true,
    });
  }
  if (status >= 400 && status < 500) {
    return new ProviderError({
      code: "PROVIDER_INVALID_REQUEST",
      safeMessage: `${provider} rejected the request.`,
      retryable: false,
    });
  }
  return new ProviderError({
    code: "PROVIDER_HTTP_ERROR",
    safeMessage: `${provider} returned an unexpected HTTP status.`,
    retryable: false,
  });
}

export function networkProviderError(provider: string, cause: unknown): ProviderError {
  if (cause instanceof ProviderError) return cause;
  if (cause instanceof Error && cause.name === "AbortError") {
    return new ProviderError({
      code: "PROVIDER_TIMEOUT",
      safeMessage: `${provider} request was aborted or timed out.`,
      retryable: true,
      cause,
    });
  }
  return new ProviderError({
    code: "PROVIDER_NETWORK_ERROR",
    safeMessage: `${provider} could not be reached.`,
    retryable: true,
    cause,
  });
}

export function apiKeyFromEnvironment(
  provider: string,
  configuredName: string | undefined,
  defaultName: string,
  environment: Readonly<Record<string, string | undefined>>,
): string {
  const variableName = configuredName ?? defaultName;
  const value = environment[variableName];
  if (value === undefined || value.length === 0) {
    throw new ProviderError({
      code: "PROVIDER_AUTHENTICATION_ERROR",
      safeMessage: `${provider} API key is missing from environment variable ${variableName}.`,
      retryable: false,
    });
  }
  return value;
}
