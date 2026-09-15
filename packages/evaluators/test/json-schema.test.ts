import { mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { EvaluationInput } from "@llm-eval-kit/core";

import { JsonSchemaEvaluator } from "../src/index.js";

const personSchema = {
  type: "object",
  required: ["name", "age"],
  additionalProperties: false,
  properties: { name: { type: "string" }, age: { type: "integer", minimum: 0 } },
};

function input(
  text: string,
  rawStructuredOutput?: EvaluationInput["generation"]["rawStructuredOutput"],
): EvaluationInput {
  return {
    testCase: {
      id: "JSON_001",
      name: "Structured output",
      category: "contract",
      severity: "HIGH",
      tags: [],
      input: { user: "Return a person", variables: {} },
      evaluators: [],
    },
    generation: {
      text,
      ...(rawStructuredOutput === undefined ? {} : { rawStructuredOutput }),
      usage: {},
      latencyMs: 1,
      resolvedProvider: "mock",
      resolvedModel: "fixture-v1",
    },
  };
}

describe("JsonSchemaEvaluator", () => {
  it("passes valid JSON and prefers normalized structured output", async () => {
    const evaluator = new JsonSchemaEvaluator({ schemaRoot: tmpdir() });
    await expect(
      evaluator.evaluate(input("not json", { name: "Lan", age: 30 }), { schema: personSchema }),
    ).resolves.toMatchObject({ verdict: "PASS", evidence: { kind: "SCHEMA_VALID" } });
  });

  it("distinguishes malformed JSON from schema violations with path and keyword", async () => {
    const evaluator = new JsonSchemaEvaluator({ schemaRoot: tmpdir() });
    await expect(evaluator.evaluate(input("{"), { schema: personSchema })).resolves.toMatchObject({
      verdict: "FAIL",
      evidence: { kind: "JSON_PARSE_ERROR" },
    });
    const invalid = await evaluator.evaluate(input(JSON.stringify({ name: "Lan", age: "30" })), {
      schema: personSchema,
    });
    expect(invalid).toMatchObject({
      verdict: "FAIL",
      evidence: { kind: "SCHEMA_VALIDATION_ERROR", errors: [{ path: "/age", keyword: "type" }] },
    });
  });

  it("loads a schema from a safe path beneath the suite directory", async () => {
    const root = join(tmpdir(), `llm-eval-schema-${crypto.randomUUID()}`);
    await mkdir(join(root, "schemas"), { recursive: true });
    await writeFile(join(root, "schemas", "person.json"), JSON.stringify(personSchema));
    const evaluationInput = input('{"name":"Lan","age":30}');
    evaluationInput.testCase.expected = { jsonSchemaRef: "schemas/person.json" };
    await expect(
      new JsonSchemaEvaluator({ schemaRoot: root }).evaluate(evaluationInput, {}),
    ).resolves.toMatchObject({ verdict: "PASS" });
  });

  it("blocks traversal, external refs, unreadable files, and invalid schemas", async () => {
    const evaluator = new JsonSchemaEvaluator({ schemaRoot: tmpdir() });
    const traversal = input("{}");
    traversal.testCase.expected = { jsonSchemaRef: "../secret.json" };
    await expect(evaluator.evaluate(traversal, {})).resolves.toMatchObject({
      verdict: "ERROR",
      reason: expect.stringContaining("outside"),
    });
    await expect(
      evaluator.evaluate(input("{}"), { schema: { $ref: "https://example.com/schema.json" } }),
    ).resolves.toMatchObject({ verdict: "ERROR", reason: expect.stringContaining("External") });
    const missing = input("{}");
    missing.testCase.expected = { jsonSchemaRef: "missing.json" };
    await expect(evaluator.evaluate(missing, {})).resolves.toMatchObject({
      verdict: "ERROR",
      reason: expect.stringContaining("read or parse"),
    });
    await expect(
      evaluator.evaluate(input("{}"), { schema: { type: "not-a-type" } }),
    ).resolves.toMatchObject({ verdict: "ERROR", reason: expect.stringContaining("compiled") });
    await expect(evaluator.evaluate(input("{}"), null)).resolves.toMatchObject({
      verdict: "ERROR",
    });
  });

  it("does not follow a schema symlink outside the allowed root", async () => {
    const root = join(tmpdir(), `llm-eval-schema-root-${crypto.randomUUID()}`);
    const outside = join(tmpdir(), `llm-eval-schema-outside-${crypto.randomUUID()}.json`);
    await mkdir(root, { recursive: true });
    await writeFile(outside, JSON.stringify(personSchema));
    await symlink(outside, join(root, "escaped.json"));
    const evaluationInput = input('{"name":"Lan","age":30}');
    evaluationInput.testCase.expected = { jsonSchemaRef: "escaped.json" };
    await expect(
      new JsonSchemaEvaluator({ schemaRoot: root }).evaluate(evaluationInput, {}),
    ).resolves.toMatchObject({
      verdict: "ERROR",
      reason: expect.stringContaining("allowed schema root"),
    });
  });
});
