import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ConfigurationError, DatasetValidationError } from "@llm-eval-kit/core";

import { loadEvaluationSuite, loadProjectConfig } from "../src/index.js";

const fixturePath = (name: string): string =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

describe("configuration and suite loaders", () => {
  it("loads JSON configuration and YAML evaluation suites", async () => {
    const [config, suite] = await Promise.all([
      loadProjectConfig(fixturePath("project.json")),
      loadEvaluationSuite(fixturePath("suite.yaml")),
    ]);

    expect(config.target).toEqual({ provider: "mock", model: "fixture-v1" });
    expect(config.execution.concurrency).toBe(4);
    expect(suite.id).toBe("ecommerce-support");
    expect(suite.cases[0]?.id).toBe("REFUND_001");
  });

  it("reports a safe configuration error for missing files", async () => {
    await expect(loadProjectConfig(fixturePath("missing.json"))).rejects.toMatchObject({
      code: "CONFIGURATION_ERROR",
    });
  });

  it("rejects unsupported file extensions", async () => {
    await expect(loadProjectConfig(fixturePath("project.txt"))).rejects.toBeInstanceOf(
      ConfigurationError,
    );
  });

  it("rejects malformed JSON and schema-invalid project configuration", async () => {
    await expect(loadProjectConfig(fixturePath("malformed.json"))).rejects.toMatchObject({
      code: "CONFIGURATION_ERROR",
      safeMessage: expect.stringContaining("Unable to parse"),
    });
    await expect(loadProjectConfig(fixturePath("invalid-project.json"))).rejects.toMatchObject({
      code: "CONFIGURATION_ERROR",
      safeMessage: expect.stringContaining("Invalid configuration"),
    });
  });

  it("rejects invalid suites as dataset failures with an actionable path", async () => {
    await expect(loadEvaluationSuite(fixturePath("invalid-suite.yaml"))).rejects.toMatchObject({
      code: "DATASET_VALIDATION_ERROR",
      safeMessage: expect.stringContaining("cases.1.id"),
    });
  });

  it("classifies a missing suite as a dataset validation failure", async () => {
    await expect(loadEvaluationSuite(fixturePath("missing.yaml"))).rejects.toBeInstanceOf(
      DatasetValidationError,
    );
  });
});
