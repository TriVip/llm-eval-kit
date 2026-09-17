import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { loadMockFixtureFile } from "@llm-eval-kit/providers";
import type { ExecutionLogEvent } from "@llm-eval-kit/core";

import { loadEvaluationSuite, loadProjectConfig } from "../../config/src/index.js";
import { createEvaluationApplication } from "../src/index.js";

const example = resolve("examples/ecommerce-support");

async function resources(fixtures = "fixtures.json") {
  const suitePath = join(example, "suite.yaml");
  return {
    config: await loadProjectConfig(join(example, "llmeval.config.json")),
    suite: await loadEvaluationSuite(suitePath),
    schemaRoot: dirname(suitePath),
    targetFixtures: await loadMockFixtureFile(join(example, fixtures)),
  };
}

describe("evaluation application facade", () => {
  it("validates and plans without creating a provider", async () => {
    let calls = 0;
    const app = createEvaluationApplication({
      createProvider: () => {
        calls += 1;
        throw new Error("must not run");
      },
    });
    const input = await resources();
    expect(app.validate(input.config, input.suite).caseCount).toBe(input.suite.cases.length);
    expect(app.plan(input.config, input.suite, { caseIds: ["REFUND_001"] })).toMatchObject({
      selectedCases: 1,
      maximumCalls: 1,
    });
    expect(calls).toBe(0);
    expect(
      app.plan(
        {
          ...input.config,
          target: {
            ...input.config.target,
            pricing: {
              inputUsdPerMillionTokens: 1,
              outputUsdPerMillionTokens: 1,
            },
          },
        },
        input.suite,
      ).preflightCost,
    ).toBe("PRICING_CONFIGURED");
  });

  it("rejects missing judge configuration before creating providers", async () => {
    const input = await resources();
    const judgeSuite = {
      ...input.suite,
      cases: [
        {
          ...input.suite.cases[0]!,
          evaluators: [{ id: "judge", type: "llm_judge", required: true, weight: 1, config: {} }],
        },
      ],
    };
    expect(() => createEvaluationApplication().validate(input.config, judgeSuite)).toThrow(
      "no judge target",
    );
  });

  it("guards provider resources and unsupported providers", async () => {
    const app = createEvaluationApplication();
    const input = await resources();
    await expect(
      app.run({ config: input.config, suite: input.suite, schemaRoot: input.schemaRoot }),
    ).rejects.toThrow("fixture resource");
    await expect(
      app.run({
        ...input,
        config: { ...input.config, target: { ...input.config.target, provider: "unsupported" } },
      }),
    ).rejects.toThrow("Unsupported provider");
  });

  it.each(["openai", "gemini"])(
    "constructs the %s provider through the shared facade",
    async (provider) => {
      const input = await resources();
      const artifact = await createEvaluationApplication().run({
        config: { ...input.config, target: { ...input.config.target, provider } },
        suite: input.suite,
        schemaRoot: input.schemaRoot,
        filters: { caseIds: ["REFUND_001"] },
      });
      expect(artifact.metadata.target.provider).toBe(provider);
      expect(artifact.status).toBe("OPERATIONAL_FAILED");
    },
  );

  it("runs the same pass and critical-regression scenarios as the CLI", async () => {
    const app = createEvaluationApplication();
    const passing = await app.run(await resources(), {
      onEvent: () => {
        throw new Error("subscriber failure must be observational");
      },
    });
    const regression = await app.run({
      ...(await resources("fixtures-regression.json")),
      filters: { caseIds: ["REFUND_001"] },
    });
    expect(passing.status).toBe("PASSED");
    expect(regression.status).toBe("QUALITY_FAILED");
    expect(regression.gateFailures.map(({ code }) => code)).toContain("CRITICAL_CASE_FAILURE");
  });

  it("emits ordered observational progress with the caller run ID and no model content", async () => {
    const input = await resources();
    const events: ExecutionLogEvent[] = [];
    const artifact = await createEvaluationApplication().run(
      { ...input, filters: { caseIds: ["REFUND_001"] } },
      { runId: "studio-run-001", onEvent: (event) => events.push(event) },
    );
    expect(artifact.metadata.runId).toBe("studio-run-001");
    expect(events[0]).toMatchObject({
      runId: "studio-run-001",
      phase: "run",
      status: "started",
    });
    expect(events.at(-1)).toMatchObject({
      runId: "studio-run-001",
      phase: "run",
      status: "completed",
    });
    expect(
      events.some(
        ({ caseId, phase, status }) =>
          caseId === "REFUND_001" && phase === "run" && status === "completed",
      ),
    ).toBe(true);
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain(input.suite.cases[0]?.input.user);
    expect(serialized).not.toContain("generation");
  });

  it("compares and explicitly promotes immutable artifacts", async () => {
    const app = createEvaluationApplication();
    const artifact = await app.run({
      ...(await resources()),
      filters: { caseIds: ["REFUND_001"] },
    });
    expect(app.compare({ candidate: artifact, baseline: artifact }).status).toBe("PASSED");
    const directory = await mkdtemp(join(tmpdir(), "llmeval-sdk-"));
    const outputPath = join(directory, "baseline.json");
    await expect(app.promote({ artifact, outputPath })).resolves.toBe(outputPath);
    await expect(app.promote({ artifact, outputPath })).rejects.toMatchObject({
      code: "ARTIFACT_ERROR",
    });
  });
});
