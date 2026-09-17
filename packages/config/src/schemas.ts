import { z } from "zod";

import {
  ARTIFACT_SCHEMA_VERSION,
  INPUT_SCHEMA_VERSION,
  type EvaluationSuite,
  type ProjectConfig,
  type RunArtifact,
} from "@llm-eval-kit/core";

const identifierSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "Use letters, numbers, dots, underscores, or hyphens.");

const probabilitySchema = z.number().min(0).max(1);
const nonNegativeFiniteSchema = z.number().finite().nonnegative();

export const severitySchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export const verdictSchema = z.enum(["PASS", "FAIL", "WARNING", "ERROR"]);

export const modelTargetSchema = z
  .object({
    provider: z.enum(["mock", "openai", "gemini"]),
    model: z.string().min(1).max(200),
    apiKeyEnv: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]*$/)
      .optional(),
    temperature: z.number().finite().min(0).max(2).optional(),
    maxOutputTokens: z.number().int().positive().optional(),
    pricing: z
      .object({
        inputUsdPerMillionTokens: nonNegativeFiniteSchema,
        outputUsdPerMillionTokens: nonNegativeFiniteSchema,
      })
      .strict()
      .optional(),
  })
  .strict();

export const evaluatorSpecSchema = z
  .object({
    id: identifierSchema,
    type: identifierSchema,
    required: z.boolean().default(true),
    weight: z.number().finite().positive().default(1),
    config: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export const expectedBehaviorSchema = z
  .object({
    behavior: z.string().min(1).optional(),
    exact: z.string().optional(),
    mustContain: z.array(z.string().min(1)).optional(),
    mustNotContain: z.array(z.string().min(1)).optional(),
    jsonSchemaRef: z.string().min(1).optional(),
  })
  .strict();

export const evaluationCaseSchema = z
  .object({
    id: identifierSchema,
    name: z.string().min(1).max(200),
    category: identifierSchema,
    severity: severitySchema,
    tags: z.array(identifierSchema).default([]),
    input: z
      .object({
        user: z.string().min(1),
        context: z.string().optional(),
        variables: z
          .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
          .default({}),
      })
      .strict(),
    expected: expectedBehaviorSchema.optional(),
    evaluators: z.array(evaluatorSpecSchema).min(1),
  })
  .strict();

export const evaluationSuiteSchema = z
  .object({
    schemaVersion: z.literal(INPUT_SCHEMA_VERSION),
    id: identifierSchema,
    name: z.string().min(1).max(200),
    description: z.string().optional(),
    cases: z.array(evaluationCaseSchema).min(1),
  })
  .strict()
  .superRefine((suite, context) => {
    const seen = new Set<string>();

    suite.cases.forEach((testCase, index) => {
      if (seen.has(testCase.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate case id: ${testCase.id}`,
          path: ["cases", index, "id"],
        });
      }

      seen.add(testCase.id);

      testCase.evaluators.forEach((evaluator, evaluatorIndex) => {
        const path = ["cases", index, "evaluators", evaluatorIndex, "config"];

        if (evaluator.type === "regex") {
          const pattern = evaluator.config.pattern;
          const flags = evaluator.config.flags;

          if (typeof pattern !== "string" || pattern.length === 0) {
            context.addIssue({
              code: "custom",
              message: "Regex evaluator requires a non-empty config.pattern.",
              path,
            });
          } else {
            try {
              new RegExp(pattern, typeof flags === "string" ? flags : undefined);
            } catch {
              context.addIssue({ code: "custom", message: "Invalid regular expression.", path });
            }
          }

          if (flags !== undefined && typeof flags !== "string") {
            context.addIssue({ code: "custom", message: "Regex flags must be a string.", path });
          }
        }

        if (evaluator.type === "json_schema") {
          const inlineSchema = evaluator.config.schema;
          const schemaRef = testCase.expected?.jsonSchemaRef;
          const hasInlineSchema =
            typeof inlineSchema === "object" &&
            inlineSchema !== null &&
            !Array.isArray(inlineSchema);

          if (!hasInlineSchema && schemaRef === undefined) {
            context.addIssue({
              code: "custom",
              message: "JSON Schema evaluator requires config.schema or expected.jsonSchemaRef.",
              path,
            });
          }

          if (
            schemaRef !== undefined &&
            (/^[a-z][a-z0-9+.-]*:/i.test(schemaRef) ||
              schemaRef.startsWith("/") ||
              schemaRef.split(/[\\/]/).includes(".."))
          ) {
            context.addIssue({
              code: "custom",
              message: "JSON Schema reference must be a safe relative local path.",
              path: ["cases", index, "expected", "jsonSchemaRef"],
            });
          }
        }

        if (
          evaluator.type === "llm_judge" &&
          evaluator.config.rubric !== undefined &&
          (typeof evaluator.config.rubric !== "string" || evaluator.config.rubric.length === 0)
        ) {
          context.addIssue({
            code: "custom",
            message: "LLM judge rubric must be a non-empty string.",
            path,
          });
        }
      });
    });
  });

export const projectConfigSchema = z
  .object({
    schemaVersion: z.literal(INPUT_SCHEMA_VERSION),
    project: z
      .object({
        id: identifierSchema,
        name: z.string().min(1).max(200),
      })
      .strict(),
    target: modelTargetSchema,
    judge: modelTargetSchema.optional(),
    execution: z
      .object({
        concurrency: z.number().int().min(1).max(100).default(4),
        timeoutMs: z.number().int().min(100).max(600_000).default(30_000),
        maxRetries: z.number().int().min(0).max(10).default(2),
        maxEstimatedCostUsd: nonNegativeFiniteSchema.optional(),
        collectAllEvidence: z.boolean().default(false),
      })
      .strict(),
    qualityGate: z
      .object({
        minimumPassRate: probabilitySchema.default(0.9),
        minimumScore: probabilitySchema.default(0.7),
        maximumErrorRate: probabilitySchema.default(0.02),
        blockOnCriticalFailure: z.boolean().default(true),
        maximumCategoryRegressionPoints: z.number().finite().min(0).max(100).default(3),
        warningCountsAsPass: z.boolean().default(false),
        reviewThreshold: probabilitySchema.default(0.7),
      })
      .strict(),
    output: z
      .object({
        directory: z.string().min(1).default("reports"),
        formats: z
          .array(z.enum(["terminal", "json", "html"]))
          .min(1)
          .refine((formats) => new Set(formats).size === formats.length, {
            message: "Output formats must be unique.",
          }),
        retainRawResponses: z.boolean().default(false),
      })
      .strict(),
  })
  .strict();

export const runArtifactSchema = z
  .object({
    artifactSchemaVersion: z.literal(ARTIFACT_SCHEMA_VERSION),
    metadata: z
      .object({
        runId: identifierSchema,
        suiteId: identifierSchema.optional(),
        metricDefinitionsVersion: z.literal("1.0").optional(),
        startedAt: z.string().datetime(),
        completedAt: z.string().datetime().optional(),
        configHash: z.string().min(1),
        suiteHash: z.string().min(1),
        promptHash: z.string().min(1).optional(),
        gitSha: z.string().min(1).optional(),
        target: modelTargetSchema,
      })
      .strict(),
    status: z.enum(["PASSED", "QUALITY_FAILED", "OPERATIONAL_FAILED"]),
    metrics: z
      .object({
        selectedCases: z.number().int().nonnegative(),
        executableCases: z.number().int().nonnegative(),
        passedCases: z.number().int().nonnegative(),
        failedCases: z.number().int().nonnegative(),
        warningCases: z.number().int().nonnegative(),
        errorCases: z.number().int().nonnegative(),
        passRate: probabilitySchema,
        errorRate: probabilitySchema,
        categories: z
          .array(
            z
              .object({
                category: identifierSchema,
                selectedCases: z.number().int().nonnegative(),
                executableCases: z.number().int().nonnegative(),
                passedCases: z.number().int().nonnegative(),
                failedCases: z.number().int().nonnegative(),
                warningCases: z.number().int().nonnegative(),
                errorCases: z.number().int().nonnegative(),
                passRate: probabilitySchema,
              })
              .strict(),
          )
          .default([]),
        totalLatencyMs: nonNegativeFiniteSchema.optional(),
        averageLatencyMs: nonNegativeFiniteSchema.optional(),
        totalInputTokens: z.number().int().nonnegative().optional(),
        totalOutputTokens: z.number().int().nonnegative().optional(),
        totalTokens: z.number().int().nonnegative().optional(),
        totalEstimatedCostUsd: nonNegativeFiniteSchema.optional(),
        usageCoverage: probabilitySchema.default(0),
        costCoverage: probabilitySchema.default(0),
      })
      .strict(),
    gateFailures: z.array(
      z
        .object({
          code: identifierSchema,
          reason: z.string().min(1),
          affectedCaseIds: z.array(identifierSchema),
        })
        .strict(),
    ),
    cases: z.array(
      z
        .object({
          caseId: identifierSchema,
          definitionHash: z.string().min(1).optional(),
          category: identifierSchema,
          severity: severitySchema,
          tags: z.array(identifierSchema).optional(),
          verdict: verdictSchema,
          score: probabilitySchema.optional(),
          confidence: probabilitySchema.optional(),
          generation: z.unknown().optional(),
          evaluations: z.array(z.unknown()),
          errorCode: identifierSchema.optional(),
        })
        .passthrough(),
    ),
  })
  .strict();

export function parseProjectConfig(input: unknown): ProjectConfig {
  return projectConfigSchema.parse(input) as ProjectConfig;
}

export function parseEvaluationSuite(input: unknown): EvaluationSuite {
  return evaluationSuiteSchema.parse(input) as EvaluationSuite;
}

export function parseRunArtifact(input: unknown): RunArtifact {
  return runArtifactSchema.parse(input) as RunArtifact;
}
