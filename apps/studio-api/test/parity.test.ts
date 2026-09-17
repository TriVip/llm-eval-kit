import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadEvaluationSuite, loadProjectConfig } from "@llm-eval-kit/config";
import type { RunArtifact } from "@llm-eval-kit/core";
import { loadMockFixtureFile } from "@llm-eval-kit/providers";
import { createEvaluationApplication } from "@llm-eval-kit/sdk";

import { runCli } from "../../cli/src/main.js";
import { buildStudioServer } from "../src/index.js";

const instances: Awaited<ReturnType<typeof buildStudioServer>>[] = [];
const example = resolve("examples/ecommerce-support");

function semanticEvidence(artifact: RunArtifact) {
  return {
    status: artifact.status,
    metrics: {
      selectedCases: artifact.metrics.selectedCases,
      passedCases: artifact.metrics.passedCases,
      failedCases: artifact.metrics.failedCases,
      warningCases: artifact.metrics.warningCases,
      errorCases: artifact.metrics.errorCases,
      passRate: artifact.metrics.passRate,
    },
    cases: artifact.cases.map((testCase) => ({
      id: testCase.id,
      verdict: testCase.verdict,
      evaluations: testCase.evaluations.map((evaluation) => ({
        evaluatorId: evaluation.evaluatorId,
        verdict: evaluation.verdict,
        reason: evaluation.reason,
        evidence: evaluation.evidence,
      })),
    })),
    gateFailures: artifact.gateFailures.map(({ code, affectedCaseIds }) => ({
      code,
      affectedCaseIds,
    })),
  };
}

afterEach(async () => {
  await Promise.all(instances.splice(0).map((instance) => instance.close()));
});

describe("CLI, SDK, and Studio API parity", () => {
  it("produces the same canonical evaluation semantics for the same registered run", async () => {
    const configPath = join(example, "llmeval.config.json");
    const suitePath = join(example, "suite.yaml");
    const fixturePath = join(example, "fixtures.json");
    const config = await loadProjectConfig(configPath);
    const suite = await loadEvaluationSuite(suitePath);
    const targetFixtures = await loadMockFixtureFile(fixturePath);
    const filters = { caseIds: ["REFUND_001"] };

    const sdkArtifact = await createEvaluationApplication().run({
      config,
      suite,
      schemaRoot: dirname(suitePath),
      targetFixtures,
      filters,
    });

    const cliRoot = await mkdtemp(join(tmpdir(), "llmeval-parity-cli-"));
    const cliReports = join(cliRoot, "reports");
    const cliConfig = join(cliRoot, "llmeval.config.json");
    await writeFile(
      cliConfig,
      JSON.stringify({ ...config, output: { ...config.output, directory: cliReports } }),
    );
    const cliExitCode = await runCli(
      [
        "run",
        "--config",
        cliConfig,
        "--suite",
        suitePath,
        "--fixtures",
        fixturePath,
        "--case",
        "REFUND_001",
      ],
      { cwd: resolve("."), writeOut: () => undefined, writeErr: () => undefined },
    );
    expect(cliExitCode).toBe(0);
    const cliRunDirectory = (await readdir(cliReports, { withFileTypes: true })).find((entry) =>
      entry.isDirectory(),
    );
    expect(cliRunDirectory).toBeDefined();
    const cliArtifact = JSON.parse(
      await readFile(join(cliReports, cliRunDirectory!.name, "run.json"), "utf8"),
    ) as RunArtifact;

    const apiReports = await mkdtemp(join(tmpdir(), "llmeval-parity-api-"));
    const instance = await buildStudioServer({
      workspaceRoot: resolve("."),
      reportRoot: apiReports,
      origin: "http://127.0.0.1:4317",
      allowedHosts: ["127.0.0.1:4317"],
    });
    instances.push(instance);
    const bootstrap = await instance.inject({
      method: "GET",
      url: "/api/v1/bootstrap",
      headers: { host: "127.0.0.1:4317" },
    });
    const mutationHeaders = {
      host: "127.0.0.1:4317",
      origin: "http://127.0.0.1:4317",
      cookie: bootstrap.headers["set-cookie"]?.split(";")[0] ?? "",
      "x-csrf-token": bootstrap.json().csrfToken as string,
    };
    const accepted = await instance.inject({
      method: "POST",
      url: "/api/v1/runs",
      headers: mutationHeaders,
      payload: {
        projectId: "ecommerce-support",
        targetId: "mock",
        suiteId: "main",
        fixtureSetId: "passing",
        filters,
      },
    });
    expect(accepted.statusCode).toBe(202);
    const runId = accepted.json().runId as string;
    let artifactId: string | undefined;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const snapshot = (
        await instance.inject({
          method: "GET",
          url: `/api/v1/runs/${runId}`,
          headers: { host: "127.0.0.1:4317" },
        })
      ).json();
      if (snapshot.state === "COMPLETED") {
        artifactId = snapshot.artifactId;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    expect(artifactId).toBeDefined();
    const apiArtifact = (
      await instance.inject({
        method: "GET",
        url: `/api/v1/artifacts/${artifactId!}`,
        headers: { host: "127.0.0.1:4317" },
      })
    ).json().artifact as RunArtifact;

    expect(semanticEvidence(cliArtifact)).toEqual(semanticEvidence(sdkArtifact));
    expect(semanticEvidence(apiArtifact)).toEqual(semanticEvidence(sdkArtifact));
  });
});
