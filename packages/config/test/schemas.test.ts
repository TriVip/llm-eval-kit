import { describe, expect, it } from "vitest";

import { parseEvaluationSuite, parseProjectConfig, parseRunArtifact } from "../src/index.js";

const validCase = {
  id: "REFUND_001",
  name: "Reject an expired return",
  category: "refund_policy",
  severity: "CRITICAL",
  input: {
    user: "Can I return an item after 20 days?",
    context: "Returns are accepted within 14 days.",
  },
  evaluators: [
    {
      id: "must-mention-window",
      type: "contains",
      config: { values: ["14 days"] },
    },
  ],
};

describe("evaluation suite schema", () => {
  it("normalizes a valid suite and applies safe defaults", () => {
    const suite = parseEvaluationSuite({
      schemaVersion: "1.0",
      id: "ecommerce-support",
      name: "E-commerce support",
      cases: [validCase],
    });

    expect(suite.cases[0]?.tags).toEqual([]);
    expect(suite.cases[0]?.input.variables).toEqual({});
    expect(suite.cases[0]?.evaluators[0]).toMatchObject({
      required: true,
      weight: 1,
    });
  });

  it("rejects unknown fields with an actionable path", () => {
    expect(() =>
      parseEvaluationSuite({
        schemaVersion: "1.0",
        id: "ecommerce-support",
        name: "E-commerce support",
        unexpected: true,
        cases: [validCase],
      }),
    ).toThrow();
  });

  it("rejects duplicate case ids", () => {
    expect(() =>
      parseEvaluationSuite({
        schemaVersion: "1.0",
        id: "ecommerce-support",
        name: "E-commerce support",
        cases: [validCase, { ...validCase, name: "Duplicate" }],
      }),
    ).toThrow(/Duplicate case id/);
  });
});

describe("project config schema", () => {
  it("applies the approved execution and quality-gate defaults", () => {
    const config = parseProjectConfig({
      schemaVersion: "1.0",
      project: { id: "demo", name: "Demo" },
      target: { provider: "mock", model: "fixture-v1" },
      execution: {},
      qualityGate: {},
      output: { formats: ["terminal", "json"] },
    });

    expect(config.execution).toMatchObject({
      concurrency: 4,
      timeoutMs: 30_000,
      maxRetries: 2,
      collectAllEvidence: false,
    });
    expect(config.qualityGate).toMatchObject({
      minimumPassRate: 0.9,
      minimumScore: 0.7,
      maximumErrorRate: 0.02,
      blockOnCriticalFailure: true,
      maximumCategoryRegressionPoints: 3,
      warningCountsAsPass: false,
    });
    expect(config.output.retainRawResponses).toBe(false);
  });

  it("rejects unsafe quality-gate probabilities", () => {
    expect(() =>
      parseProjectConfig({
        schemaVersion: "1.0",
        project: { id: "demo", name: "Demo" },
        target: { provider: "mock", model: "fixture-v1" },
        execution: {},
        qualityGate: { minimumPassRate: 1.2 },
        output: { formats: ["json"] },
      }),
    ).toThrow();
  });
});

describe("run artifact schema", () => {
  it("accepts a versioned canonical run artifact", () => {
    const artifact = parseRunArtifact({
      artifactSchemaVersion: "1.0",
      metadata: {
        runId: "run_001",
        startedAt: "2026-09-15T00:00:00.000Z",
        completedAt: "2026-09-15T00:00:01.000Z",
        configHash: "config-sha256",
        suiteHash: "suite-sha256",
        target: { provider: "mock", model: "fixture-v1" },
      },
      status: "PASSED",
      metrics: {
        selectedCases: 1,
        executableCases: 1,
        passedCases: 1,
        failedCases: 0,
        warningCases: 0,
        errorCases: 0,
        passRate: 1,
        errorRate: 0,
        categories: [],
      },
      gateFailures: [],
      cases: [],
    });

    expect(artifact.status).toBe("PASSED");
    expect(artifact.artifactSchemaVersion).toBe("1.0");
  });

  it("rejects invalid regex and unsafe JSON Schema references before execution", () => {
    expect(() =>
      parseEvaluationSuite({
        schemaVersion: "1.0",
        id: "invalid-regex",
        name: "Invalid regex",
        cases: [
          { ...validCase, evaluators: [{ id: "bad", type: "regex", config: { pattern: "[" } }] },
        ],
      }),
    ).toThrow(/Invalid regular expression/);

    expect(() =>
      parseEvaluationSuite({
        schemaVersion: "1.0",
        id: "unsafe-schema",
        name: "Unsafe schema",
        cases: [
          {
            ...validCase,
            expected: { jsonSchemaRef: "../secret.json" },
            evaluators: [{ id: "schema", type: "json_schema", config: {} }],
          },
        ],
      }),
    ).toThrow(/safe relative local path/);
  });
});
