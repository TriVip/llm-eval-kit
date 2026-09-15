import { readFile } from "node:fs/promises";

import {
  ConfigurationError,
  ProviderError,
  type GenerationRequest,
  type GenerationResult,
  type JsonValue,
  type LlmProvider,
  type ProviderExecutionContext,
  type UsageMetrics,
} from "@llm-eval-kit/core";

export type MockFixture = {
  text: string;
  usage?: UsageMetrics;
  latencyMs?: number;
  finishReason?: string;
  rawStructuredOutput?: JsonValue;
  providerRequestId?: string;
};

export type MockFixtureFile = {
  schemaVersion: "1.0";
  fixtures: Record<string, MockFixture>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseFixture(value: unknown, caseId: string): MockFixture {
  if (!isRecord(value) || typeof value.text !== "string") {
    throw new ConfigurationError(`Invalid mock fixture for case: ${caseId}`);
  }

  if (
    value.latencyMs !== undefined &&
    (typeof value.latencyMs !== "number" || value.latencyMs < 0)
  ) {
    throw new ConfigurationError(`Invalid mock latency for case: ${caseId}`);
  }

  if (value.usage !== undefined && !isRecord(value.usage)) {
    throw new ConfigurationError(`Invalid mock usage for case: ${caseId}`);
  }

  return value as MockFixture;
}

export async function loadMockFixtureFile(filePath: string): Promise<MockFixtureFile> {
  let input: unknown;

  try {
    input = JSON.parse(await readFile(filePath, "utf8")) as unknown;
  } catch {
    throw new ConfigurationError(`Unable to read or parse mock fixture file: ${filePath}`);
  }

  if (!isRecord(input) || input.schemaVersion !== "1.0" || !isRecord(input.fixtures)) {
    throw new ConfigurationError("Invalid mock fixture file structure.");
  }

  const fixtures = Object.fromEntries(
    Object.entries(input.fixtures).map(([caseId, fixture]) => [
      caseId,
      parseFixture(fixture, caseId),
    ]),
  );

  return { schemaVersion: "1.0", fixtures };
}

export class MockProvider implements LlmProvider {
  public readonly id = "mock";

  public constructor(private readonly fixtures: Readonly<Record<string, MockFixture>>) {}

  public async generate(
    request: GenerationRequest,
    context: ProviderExecutionContext,
  ): Promise<GenerationResult> {
    const fixture = this.fixtures[context.caseId];

    if (fixture === undefined) {
      throw new ProviderError({
        code: "MOCK_FIXTURE_NOT_FOUND",
        safeMessage: `No mock fixture exists for case: ${context.caseId}`,
        retryable: false,
      });
    }

    return {
      text: fixture.text,
      usage: { ...fixture.usage },
      latencyMs: fixture.latencyMs ?? 0,
      resolvedProvider: this.id,
      resolvedModel: request.target.model,
      ...(fixture.finishReason === undefined ? {} : { finishReason: fixture.finishReason }),
      ...(fixture.rawStructuredOutput === undefined
        ? {}
        : { rawStructuredOutput: fixture.rawStructuredOutput }),
      ...(fixture.providerRequestId === undefined
        ? {}
        : { providerRequestId: fixture.providerRequestId }),
    };
  }
}
