import { z } from "zod";

export const STUDIO_API_VERSION = "1.0" as const;

const identifier = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
const filtersSchema = z
  .object({
    caseIds: z.array(identifier).optional(),
    categories: z.array(identifier).optional(),
    severities: z.array(z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"])).optional(),
    tags: z.array(identifier).optional(),
  })
  .strict();

export const studioRunRequestSchema = z
  .object({
    projectId: identifier,
    targetId: identifier,
    suiteId: identifier,
    fixtureSetId: identifier.optional(),
    filters: filtersSchema.optional(),
    executionOverrides: z
      .object({
        concurrency: z.number().int().min(1).max(100).optional(),
        timeoutMs: z.number().int().min(100).max(600_000).optional(),
        maxRetries: z.number().int().min(0).max(10).optional(),
        maxEstimatedCostUsd: z.number().finite().nonnegative().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const runPlanResponseSchema = z
  .object({
    apiVersion: z.literal(STUDIO_API_VERSION),
    projectId: identifier,
    suiteId: identifier,
    provider: z.string().min(1),
    model: z.string().min(1),
    selectedCases: z.number().int().nonnegative(),
    maximumCalls: z.number().int().nonnegative(),
    preflightCost: z.enum(["UNAVAILABLE", "PRICING_CONFIGURED"]),
  })
  .strict();

export const runAcceptedResponseSchema = z
  .object({
    apiVersion: z.literal(STUDIO_API_VERSION),
    runId: identifier,
    status: z.literal("ACCEPTED"),
  })
  .strict();

export const studioProblemSchema = z
  .object({
    apiVersion: z.literal(STUDIO_API_VERSION),
    type: z.string().min(1),
    title: z.string().min(1),
    status: z.number().int().min(400).max(599),
    code: identifier,
    detail: z.string().min(1),
    correlationId: identifier,
    fieldErrors: z
      .array(z.object({ path: z.string(), message: z.string().min(1) }).strict())
      .optional(),
  })
  .strict();

export const safeRunEventSchema = z
  .object({
    apiVersion: z.literal(STUDIO_API_VERSION),
    sequence: z.number().int().nonnegative(),
    runId: identifier,
    phase: z.enum(["provider", "evaluator", "run"]),
    status: z.enum(["started", "completed", "failed"]),
    caseId: identifier.optional(),
    evaluatorId: identifier.optional(),
    durationMs: z.number().nonnegative().optional(),
    errorCode: identifier.optional(),
  })
  .strict();

export const projectSummarySchema = z
  .object({
    id: identifier,
    name: z.string().min(1),
    targets: z.array(z.object({ id: identifier, name: z.string().min(1) }).strict()),
    suites: z.array(z.object({ id: identifier, name: z.string().min(1) }).strict()),
    scenarios: z.array(z.object({ id: identifier, name: z.string().min(1) }).strict()),
  })
  .strict();

export const providerReadinessSchema = z
  .object({
    id: identifier,
    provider: z.string().min(1),
    model: z.string().min(1),
    ready: z.boolean(),
  })
  .strict();

export const projectDetailSchema = z
  .object({
    id: identifier,
    name: z.string().min(1),
    targets: z.array(providerReadinessSchema),
    suites: z.array(
      z
        .object({
          id: identifier,
          name: z.string().min(1),
          caseCount: z.number().int().nonnegative(),
          fixtureSets: z.array(z.object({ id: identifier }).strict()),
        })
        .strict(),
    ),
    scenarios: z.array(
      z
        .object({
          id: identifier,
          name: z.string().min(1),
          targetId: identifier,
          suiteId: identifier,
          fixtureSetId: identifier.optional(),
        })
        .strict(),
    ),
  })
  .strict();

export const artifactSummarySchema = z
  .object({
    id: identifier,
    runId: identifier,
    projectId: identifier.optional(),
    suiteId: identifier.optional(),
    status: z.enum(["PASSED", "QUALITY_FAILED", "OPERATIONAL_FAILED"]),
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime().optional(),
    selectedCases: z.number().int().nonnegative(),
    passRate: z.number().min(0).max(1),
    errorRate: z.number().min(0).max(1),
  })
  .strict();

export const studioBootstrapResponseSchema = z
  .object({
    apiVersion: z.literal(STUDIO_API_VERSION),
    csrfToken: identifier,
    capabilities: z
      .object({ readArtifacts: z.literal(true), runEvaluations: z.boolean() })
      .strict(),
    projects: z.array(projectSummarySchema),
    artifacts: z.array(artifactSummarySchema),
  })
  .strict();

export type StudioRunRequest = z.infer<typeof studioRunRequestSchema>;
export type RunPlanResponse = z.infer<typeof runPlanResponseSchema>;
export type RunAcceptedResponse = z.infer<typeof runAcceptedResponseSchema>;
export type StudioProblem = z.infer<typeof studioProblemSchema>;
export type SafeRunEvent = z.infer<typeof safeRunEventSchema>;
export type StudioBootstrapResponse = z.infer<typeof studioBootstrapResponseSchema>;
export type ProjectDetail = z.infer<typeof projectDetailSchema>;
export type ArtifactSummary = z.infer<typeof artifactSummarySchema>;
