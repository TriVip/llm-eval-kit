import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ConfigurationError } from "@llm-eval-kit/core";

import { loadMockFixtureFile, MockProvider } from "../src/index.js";

const request = {
  user: "Can I return an item after 20 days?",
  variables: {},
  target: { provider: "mock", model: "fixture-v1" },
};

const context = {
  runId: "run_001",
  caseId: "REFUND_001",
  attemptId: "attempt_001",
  signal: new AbortController().signal,
};

describe("MockProvider", () => {
  it("returns stable normalized fixture data", async () => {
    const provider = new MockProvider({
      REFUND_001: {
        text: "Returns are accepted within 14 days.",
        usage: { inputTokens: 12, outputTokens: 7, totalTokens: 19 },
        latencyMs: 5,
        finishReason: "stop",
      },
    });

    const first = await provider.generate(request, context);
    const second = await provider.generate(request, context);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      resolvedProvider: "mock",
      resolvedModel: "fixture-v1",
      latencyMs: 5,
      usage: { totalTokens: 19 },
    });
  });

  it("returns a non-retryable typed error when a fixture is missing", async () => {
    const provider = new MockProvider({});

    await expect(provider.generate(request, context)).rejects.toMatchObject({
      code: "MOCK_FIXTURE_NOT_FOUND",
      retryable: false,
    });
  });

  it("loads and validates a complete fixture file", async () => {
    const filePath = join(tmpdir(), `mock-fixtures-${crypto.randomUUID()}.json`);
    await writeFile(
      filePath,
      JSON.stringify({
        schemaVersion: "1.0",
        fixtures: {
          REFUND_001: {
            text: "Answer",
            latencyMs: 2,
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          },
        },
      }),
    );

    await expect(loadMockFixtureFile(filePath)).resolves.toMatchObject({
      schemaVersion: "1.0",
      fixtures: { REFUND_001: { text: "Answer", latencyMs: 2 } },
    });
  });

  it.each([
    ["wrong root", { schemaVersion: "2.0", fixtures: {} }],
    ["missing text", { schemaVersion: "1.0", fixtures: { CASE_001: {} } }],
    [
      "invalid latency",
      { schemaVersion: "1.0", fixtures: { CASE_001: { text: "Answer", latencyMs: -1 } } },
    ],
    [
      "invalid usage",
      { schemaVersion: "1.0", fixtures: { CASE_001: { text: "Answer", usage: "unknown" } } },
    ],
  ])("rejects %s", async (_name, contents) => {
    const filePath = join(tmpdir(), `mock-fixtures-${crypto.randomUUID()}.json`);
    await writeFile(filePath, JSON.stringify(contents));

    await expect(loadMockFixtureFile(filePath)).rejects.toBeInstanceOf(ConfigurationError);
  });

  it("reports unreadable or malformed fixture files safely", async () => {
    const malformedPath = join(tmpdir(), `mock-fixtures-${crypto.randomUUID()}.json`);
    await writeFile(malformedPath, "{");

    await expect(loadMockFixtureFile(malformedPath)).rejects.toMatchObject({
      code: "CONFIGURATION_ERROR",
      safeMessage: expect.stringContaining("Unable to read or parse"),
    });
  });
});
