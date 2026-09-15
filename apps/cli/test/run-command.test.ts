import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runCli } from "../src/main.js";

type TestProject = {
  cwd: string;
  configPath: string;
  suitePath: string;
  fixturesPath: string;
};

async function createProject(actualResponse: string, validSuite = true): Promise<TestProject> {
  const cwd = join(tmpdir(), `llm-eval-cli-${crypto.randomUUID()}`);
  const configPath = join(cwd, "llmeval.config.json");
  const suitePath = join(cwd, "suite.json");
  const fixturesPath = join(cwd, "fixtures.json");

  await import("node:fs/promises").then(({ mkdir }) => mkdir(cwd, { recursive: true }));
  await writeFile(
    configPath,
    JSON.stringify({
      schemaVersion: "1.0",
      project: { id: "cli-test", name: "CLI test" },
      target: { provider: "mock", model: "fixture-v1" },
      execution: {},
      qualityGate: {},
      output: { directory: "reports", formats: ["terminal", "json"] },
    }),
  );
  await writeFile(
    suitePath,
    JSON.stringify({
      schemaVersion: "1.0",
      ...(validSuite ? { id: "cli-suite" } : {}),
      name: "CLI suite",
      cases: [
        {
          id: "REFUND_001",
          name: "Refund policy",
          category: "refund_policy",
          severity: "CRITICAL",
          tags: ["smoke"],
          input: { user: "What is the return window?" },
          expected: { exact: "Returns are accepted within 14 days." },
          evaluators: [{ id: "exact-policy", type: "exact_match" }],
        },
      ],
    }),
  );
  await writeFile(
    fixturesPath,
    JSON.stringify({
      schemaVersion: "1.0",
      fixtures: { REFUND_001: { text: actualResponse, latencyMs: 5 } },
    }),
  );

  return { cwd, configPath, suitePath, fixturesPath };
}

async function execute(
  project: TestProject,
  extraArguments: string[] = [],
): Promise<{
  code: number;
  stdout: string;
  stderr: string;
}> {
  let stdout = "";
  let stderr = "";
  const code = await runCli(
    [
      "run",
      "--config",
      project.configPath,
      "--suite",
      project.suitePath,
      "--fixtures",
      project.fixturesPath,
      ...extraArguments,
    ],
    {
      cwd: project.cwd,
      writeOut: (message) => {
        stdout += message;
      },
      writeErr: (message) => {
        stderr += message;
      },
    },
  );

  return { code, stdout, stderr };
}

describe("llmeval run", () => {
  it("returns exit 0 and writes canonical run.json for a passing suite", async () => {
    const project = await createProject("Returns are accepted within 14 days.");
    const result = await execute(project);
    const artifactPath = result.stdout.match(/Artifact: (.+)/)?.[1];

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Status: PASSED");
    expect(artifactPath).toBeDefined();

    const artifact = JSON.parse(await readFile(artifactPath as string, "utf8")) as {
      status: string;
    };
    expect(artifact.status).toBe("PASSED");
  });

  it("returns exit 1 for an exact-match quality failure", async () => {
    const project = await createProject("Returns are accepted within 30 days.");
    const result = await execute(project);

    expect(result.code).toBe(1);
    expect(result.stdout).toContain("Status: QUALITY_FAILED");
    expect(result.stdout).toContain("0 passed, 1 failed, 0 warnings, 0 errors");
    expect(result.stdout).toContain("CRITICAL_CASE_FAILURE");
  });

  it("returns exit 2 before execution for an invalid suite", async () => {
    const project = await createProject("irrelevant", false);
    const result = await execute(project);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("Invalid evaluation suite");
  });

  it("combines repeatable filters and excludes unselected cases from metrics", async () => {
    const project = await createProject("Returns are accepted within 14 days.");
    const suite = JSON.parse(await readFile(project.suitePath, "utf8")) as { cases: unknown[] };
    suite.cases.push({
      id: "OTHER_001",
      name: "Unselected case without a fixture",
      category: "shipping",
      severity: "LOW",
      tags: ["regression"],
      input: { user: "When will it arrive?" },
      expected: { exact: "Tomorrow" },
      evaluators: [{ id: "exact", type: "exact_match" }],
    });
    await writeFile(project.suitePath, JSON.stringify(suite));
    const result = await execute(project, [
      "--case",
      "REFUND_001",
      "--category",
      "refund_policy",
      "--severity",
      "critical",
      "--tag",
      "smoke",
    ]);
    expect(result.code).toBe(0);
    const artifactPath = result.stdout.match(/Artifact: (.+)/)?.[1];
    const artifact = JSON.parse(await readFile(artifactPath as string, "utf8")) as {
      metrics: { selectedCases: number };
    };
    expect(artifact.metrics.selectedCases).toBe(1);
  });

  it("returns exit 2 for empty or invalid filter selections", async () => {
    const project = await createProject("Returns are accepted within 14 days.");
    expect(await execute(project, ["--category", "unknown"])).toMatchObject({
      code: 2,
      stderr: expect.stringContaining("No evaluation cases matched"),
    });
    expect(await execute(project, ["--severity", "urgent"])).toMatchObject({
      code: 2,
      stderr: expect.stringContaining("Severity filter"),
    });
  });

  it("returns exit 3 and preserves an artifact for an operational run failure", async () => {
    const project = await createProject("unused");
    await writeFile(project.fixturesPath, JSON.stringify({ schemaVersion: "1.0", fixtures: {} }));
    const result = await execute(project);
    expect(result.code).toBe(3);
    expect(result.stdout).toContain("Status: OPERATIONAL_FAILED");
    expect(result.stdout).toContain("OPERATIONAL_ERROR_RATE");
  });

  it("returns exit 4 for an internal/reporting failure on an otherwise passing run", async () => {
    const project = await createProject("Returns are accepted within 14 days.");
    const config = JSON.parse(await readFile(project.configPath, "utf8")) as {
      output: { directory: string };
    };
    config.output.directory = "fixtures.json";
    await writeFile(project.configPath, JSON.stringify(config));
    const result = await execute(project);
    expect(result.code).toBe(4);
    expect(result.stderr).toContain("Unable to write run artifact");
  });

  it("does not let an artifact failure mask an existing quality failure", async () => {
    const project = await createProject("Returns are accepted within 30 days.");
    const config = JSON.parse(await readFile(project.configPath, "utf8")) as {
      output: { directory: string };
    };
    config.output.directory = "fixtures.json";
    await writeFile(project.configPath, JSON.stringify(config));
    const result = await execute(project);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("preserving the run failure exit code");
  });

  it("runs a multi-case evaluator suite and keeps canonical suite order", async () => {
    const project = await createProject("unused");
    const cases = [
      {
        id: "EXACT",
        name: "Exact",
        category: "general",
        severity: "LOW",
        input: { user: "one" },
        expected: { exact: "one" },
        evaluators: [{ id: "exact", type: "exact_match" }],
      },
      {
        id: "CONTAINS",
        name: "Contains",
        category: "policy",
        severity: "HIGH",
        input: { user: "two" },
        expected: { mustContain: ["14 days"] },
        evaluators: [{ id: "contains", type: "contains", config: { caseSensitive: false } }],
      },
      {
        id: "REGEX",
        name: "Regex",
        category: "product",
        severity: "MEDIUM",
        input: { user: "three" },
        evaluators: [{ id: "regex", type: "regex", config: { pattern: "SKU-\\d{4}" } }],
      },
      {
        id: "JSON",
        name: "JSON",
        category: "contract",
        severity: "HIGH",
        input: { user: "four" },
        evaluators: [
          {
            id: "schema",
            type: "json_schema",
            config: {
              schema: { type: "object", required: ["ok"], properties: { ok: { const: true } } },
            },
          },
        ],
      },
    ];
    await writeFile(
      project.suitePath,
      JSON.stringify({ schemaVersion: "1.0", id: "golden", name: "Golden", cases }),
    );
    await writeFile(
      project.fixturesPath,
      JSON.stringify({
        schemaVersion: "1.0",
        fixtures: {
          EXACT: { text: "one" },
          CONTAINS: { text: "Returns: 14 DAYS" },
          REGEX: { text: "SKU-1234" },
          JSON: { text: '{"ok":true}' },
        },
      }),
    );
    const result = await execute(project);
    const artifactPath = result.stdout.match(/Artifact: (.+)/)?.[1];
    const artifact = JSON.parse(await readFile(artifactPath as string, "utf8")) as {
      status: string;
      cases: Array<{ caseId: string }>;
    };
    expect(result.code).toBe(0);
    expect(artifact.status).toBe("PASSED");
    expect(artifact.cases.map(({ caseId }) => caseId)).toEqual([
      "EXACT",
      "CONTAINS",
      "REGEX",
      "JSON",
    ]);
  });

  it("supports a no-cost dry run without fixtures or provider credentials", async () => {
    const project = await createProject("unused");
    const config = JSON.parse(await readFile(project.configPath, "utf8")) as {
      target: { provider: string; model: string };
    };
    config.target = { provider: "openai", model: "gpt-test" };
    await writeFile(project.configPath, JSON.stringify(config));
    let stdout = "";
    const code = await runCli(
      ["run", "--config", project.configPath, "--suite", project.suitePath, "--dry-run"],
      {
        cwd: project.cwd,
        writeOut: (message) => {
          stdout += message;
        },
      },
    );

    expect(code).toBe(0);
    expect(stdout).toContain("no provider calls were made");
    expect(stdout).toContain("Selected cases: 1");
  });

  it("routes a low-confidence mock judge result to human review end to end", async () => {
    const project = await createProject("Candidate answer");
    const judgeFixturesPath = join(project.cwd, "judge-fixtures.json");
    const config = JSON.parse(await readFile(project.configPath, "utf8")) as Record<
      string,
      unknown
    >;
    config.judge = { provider: "mock", model: "judge-fixture" };
    config.qualityGate = { minimumPassRate: 0, reviewThreshold: 0.7 };
    await writeFile(project.configPath, JSON.stringify(config));
    await writeFile(
      project.suitePath,
      JSON.stringify({
        schemaVersion: "1.0",
        id: "judge-suite",
        name: "Judge suite",
        cases: [
          {
            id: "REFUND_001",
            name: "Refund policy",
            category: "refund_policy",
            severity: "HIGH",
            input: { user: "Can I return this?", context: "Fourteen-day policy." },
            expected: { behavior: "Apply the policy." },
            evaluators: [{ id: "judge", type: "llm_judge" }],
          },
        ],
      }),
    );
    await writeFile(
      judgeFixturesPath,
      JSON.stringify({
        schemaVersion: "1.0",
        fixtures: {
          REFUND_001: {
            text: JSON.stringify({
              verdict: "PASS",
              score: 0.9,
              confidence: 0.5,
              reason: "Human confirmation is recommended.",
            }),
          },
        },
      }),
    );

    const result = await execute(project, ["--judge-fixtures", judgeFixturesPath]);
    const artifactPath = result.stdout.match(/Artifact: (.+)/)?.[1] as string;
    const artifact = JSON.parse(await readFile(artifactPath, "utf8")) as {
      cases: Array<{ verdict: string }>;
    };
    const queue = JSON.parse(
      await readFile(artifactPath.replace(/run\.json$/, "human-review.json"), "utf8"),
    ) as { items: Array<{ caseId: string }> };

    expect(result.code).toBe(0);
    expect(artifact.cases[0]?.verdict).toBe("WARNING");
    expect(queue.items).toEqual([expect.objectContaining({ caseId: "REFUND_001" })]);
  });
});
