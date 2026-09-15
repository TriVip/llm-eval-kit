import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import { Ajv, type ErrorObject } from "ajv";

import type { EvaluationInput, EvaluationResult, Evaluator, JsonValue } from "@llm-eval-kit/core";

export type JsonSchemaConfig = { schema?: Record<string, unknown> };
export type JsonSchemaEvaluatorOptions = { schemaRoot: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasUnsafeReference(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasUnsafeReference);
  if (!isRecord(value)) return false;
  if (typeof value.$ref === "string" && !value.$ref.startsWith("#")) return true;
  return Object.values(value).some(hasUnsafeReference);
}

function safeSchemaPath(root: string, reference: string): string | undefined {
  if (/^[a-z][a-z0-9+.-]*:/i.test(reference) || isAbsolute(reference)) return undefined;
  const candidate = resolve(root, reference);
  const relation = relative(resolve(root), candidate);
  if (relation === "" || relation.startsWith("..") || isAbsolute(relation)) return undefined;
  return candidate;
}

function compactErrors(errors: ErrorObject[] | null | undefined): JsonValue {
  return (errors ?? []).map((error) => ({
    path: error.instancePath || "/",
    keyword: error.keyword,
    message: error.message ?? "Schema validation failed.",
  }));
}

export class JsonSchemaEvaluator implements Evaluator<unknown> {
  public readonly id = "json_schema";
  public readonly kind = "DETERMINISTIC" as const;

  public constructor(private readonly options: JsonSchemaEvaluatorOptions) {}

  public async evaluate(input: EvaluationInput, rawConfig: unknown): Promise<EvaluationResult> {
    const startedAt = performance.now();
    const config = isRecord(rawConfig) ? (rawConfig as JsonSchemaConfig) : undefined;
    if (config === undefined)
      return this.error("JSON Schema evaluator configuration is invalid.", startedAt);

    let schema: Record<string, unknown>;
    try {
      schema = await this.loadSchema(config, input.testCase.expected?.jsonSchemaRef);
    } catch (error) {
      return this.error(
        error instanceof Error ? error.message : "Unable to load JSON Schema.",
        startedAt,
      );
    }

    let actual: unknown = input.generation.rawStructuredOutput;
    if (actual === undefined) {
      try {
        actual = JSON.parse(input.generation.text) as unknown;
      } catch {
        return {
          evaluatorId: this.id,
          kind: this.kind,
          verdict: "FAIL",
          reason: "The response is not valid JSON.",
          evidence: { kind: "JSON_PARSE_ERROR" },
          durationMs: performance.now() - startedAt,
        };
      }
    }

    try {
      const validate = new Ajv({ allErrors: true, strict: true }).compile(schema);
      const passed = validate(actual);
      return {
        evaluatorId: this.id,
        kind: this.kind,
        verdict: passed ? "PASS" : "FAIL",
        reason: passed
          ? "The structured response satisfies the JSON Schema."
          : "The structured response violates the JSON Schema.",
        evidence: passed
          ? { kind: "SCHEMA_VALID" }
          : { kind: "SCHEMA_VALIDATION_ERROR", errors: compactErrors(validate.errors) },
        durationMs: performance.now() - startedAt,
      };
    } catch {
      return this.error("The JSON Schema could not be compiled safely.", startedAt);
    }
  }

  private async loadSchema(
    config: JsonSchemaConfig,
    reference: string | undefined,
  ): Promise<Record<string, unknown>> {
    let schema: unknown = config.schema;
    if (schema === undefined) {
      if (reference === undefined) throw new Error("JSON Schema evaluator requires a schema.");
      const filePath = safeSchemaPath(this.options.schemaRoot, reference);
      if (filePath === undefined)
        throw new Error("JSON Schema reference is outside the allowed schema root.");
      try {
        const [canonicalRoot, canonicalPath] = await Promise.all([
          realpath(this.options.schemaRoot),
          realpath(filePath),
        ]);
        const canonicalRelation = relative(canonicalRoot, canonicalPath);
        if (canonicalRelation.startsWith("..") || isAbsolute(canonicalRelation)) {
          throw new Error("SCHEMA_PATH_ESCAPE");
        }
        schema = JSON.parse(await readFile(canonicalPath, "utf8")) as unknown;
      } catch {
        throw new Error("Unable to read or parse a schema within the allowed schema root.");
      }
    }

    if (!isRecord(schema)) throw new Error("JSON Schema must be an object.");
    if (hasUnsafeReference(schema))
      throw new Error("External JSON Schema references are not allowed.");
    return schema;
  }

  private error(reason: string, startedAt: number): EvaluationResult {
    return {
      evaluatorId: this.id,
      kind: this.kind,
      verdict: "ERROR",
      reason,
      durationMs: performance.now() - startedAt,
    };
  }
}
