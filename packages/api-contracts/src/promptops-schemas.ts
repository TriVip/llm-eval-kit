import { z } from "zod";

export const PROMPTOPS_API_VERSION = "1.0" as const;

const identifier = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
const variableIdentifier = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const timestamp = z.string().datetime();
const boundedText = z.string().max(8 * 1024);

export const promptTemplateSchema = z
  .object({
    schemaVersion: z.literal(PROMPTOPS_API_VERSION),
    system: z.string().optional(),
    user: z.string().min(1),
    declaredVariables: z.array(variableIdentifier).max(100),
  })
  .strict()
  .superRefine((template, context) => {
    const bytes = new TextEncoder().encode(`${template.system ?? ""}${template.user}`).byteLength;
    if (bytes > 32 * 1024) {
      context.addIssue({ code: "custom", path: ["user"], message: "Prompt exceeds 32 KiB." });
    }
    if (new Set(template.declaredVariables).size !== template.declaredVariables.length) {
      context.addIssue({
        code: "custom",
        path: ["declaredVariables"],
        message: "Prompt variables must be unique.",
      });
    }
  });

export const promptCreateRequestSchema = z
  .object({
    apiVersion: z.literal(PROMPTOPS_API_VERSION),
    promptId: identifier,
    displayName: z.string().min(1).max(256),
    note: boundedText.optional(),
    template: promptTemplateSchema,
  })
  .strict();

export const promptDraftSaveRequestSchema = z
  .object({
    apiVersion: z.literal(PROMPTOPS_API_VERSION),
    expectedRevision: z.number().int().nonnegative(),
    note: boundedText.optional(),
    template: promptTemplateSchema,
  })
  .strict();

export const promptDraftCreateRequestSchema = z
  .object({
    apiVersion: z.literal(PROMPTOPS_API_VERSION),
    parentVersion: z.number().int().positive().optional(),
  })
  .strict();

export const promptPublishRequestSchema = z
  .object({
    apiVersion: z.literal(PROMPTOPS_API_VERSION),
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict();

export const promptDraftSchema = z
  .object({
    draftId: identifier,
    promptId: identifier,
    revision: z.number().int().nonnegative(),
    parentVersion: z.number().int().positive().optional(),
    template: promptTemplateSchema,
    note: boundedText.optional(),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .strict();

export const promptSummarySchema = z
  .object({
    promptId: identifier,
    displayName: z.string().min(1).max(256),
    note: boundedText.optional(),
    createdAt: timestamp,
    updatedAt: timestamp,
    draftRevision: z.number().int().nonnegative().optional(),
    latestVersion: z.number().int().positive().optional(),
  })
  .strict();

export const publishedPromptVersionSchema = z
  .object({
    apiVersion: z.literal(PROMPTOPS_API_VERSION),
    promptId: identifier,
    version: z.number().int().positive(),
    parentVersion: z.number().int().positive().optional(),
    template: promptTemplateSchema,
    contentHash: sha256,
    publishedAt: timestamp,
  })
  .strict();

export const recommendationPolicyV1Schema = z
  .object({
    version: z.literal(PROMPTOPS_API_VERSION),
    baselineVariantId: identifier,
    minimumValidRepetitions: z.number().int().min(1).max(10).default(3),
    minimumMeanPassRate: z.number().min(0).max(1),
    maximumPassRateRegressionPoints: z.number().min(0).default(0),
    minimumVerdictAgreement: z.number().min(0).max(1).default(0.95),
    maximumFlakyCaseRate: z.number().min(0).max(1).default(0.05),
    blockOnCriticalRegression: z.literal(true),
    maximumLatencyRegressionPercent: z.number().nonnegative().optional(),
    maximumCostRegressionPercent: z.number().nonnegative().optional(),
    requireCompleteUsageForLatencyGate: z.boolean(),
    requireCompleteCostForCostGate: z.boolean(),
  })
  .strict();

export const experimentVariantSchema = z
  .object({
    variantId: identifier,
    label: z.string().min(1).max(256),
    prompt: z
      .object({ promptId: identifier, version: z.number().int().positive(), hash: sha256 })
      .strict(),
    targetId: identifier,
    targetHash: sha256,
  })
  .strict();

export const experimentPlanSchema = z
  .object({
    apiVersion: z.literal(PROMPTOPS_API_VERSION),
    schemaVersion: z.literal(PROMPTOPS_API_VERSION),
    experimentId: identifier,
    projectId: identifier,
    suiteId: identifier,
    fixtureSetId: identifier.optional(),
    variants: z.array(experimentVariantSchema).min(2).max(4),
    repetitions: z.number().int().min(1).max(10),
    policy: recommendationPolicyV1Schema,
    compatibilityHash: sha256,
    planHash: sha256,
  })
  .strict();

const recommendationStateSchema = z.enum(["PROMOTE_CANDIDATE", "KEEP_BASELINE", "NO_DECISION"]);

export const experimentRecommendationSchema = z
  .object({
    apiVersion: z.literal(PROMPTOPS_API_VERSION),
    recommendationId: identifier,
    state: recommendationStateSchema,
    selectedVariantId: identifier.optional(),
    evidenceHash: sha256,
    policyHash: sha256,
    reasons: z
      .array(
        z
          .object({
            code: identifier,
            message: z.string().min(1).max(1024),
            variantId: identifier.optional(),
            caseIds: z.array(identifier).optional(),
          })
          .strict(),
      )
      .min(1),
    createdAt: timestamp,
  })
  .strict();

export const humanDecisionRequestSchema = z
  .object({
    apiVersion: z.literal(PROMPTOPS_API_VERSION),
    action: z.enum(["ACCEPT_RECOMMENDATION", "OVERRIDE_RECOMMENDATION"]),
    outcome: z.enum(["PROMOTE_CANDIDATE", "KEEP_BASELINE", "DEFER"]),
    selectedVariantId: identifier.optional(),
    recommendationId: identifier,
    evidenceHash: sha256,
    reviewerLabel: z.string().min(1).max(256),
    rationale: z
      .string()
      .trim()
      .min(1)
      .max(4 * 1024),
  })
  .strict();

export const promptOpsEventSchema = z
  .object({
    apiVersion: z.literal(PROMPTOPS_API_VERSION),
    id: z.number().int().positive(),
    experimentId: identifier,
    correlationId: identifier,
    timestamp,
    type: z.enum([
      "experiment.planned",
      "experiment.started",
      "cell.started",
      "cell.completed",
      "experiment.cancelling",
      "experiment.completed",
      "experiment.failed",
      "snapshot.required",
    ]),
    state: z.enum(["DRAFT", "PLANNED", "RUNNING", "CANCELLING", "PARTIAL", "COMPLETED", "FAILED"]),
    completedCells: z.number().int().nonnegative(),
    totalCells: z.number().int().min(1).max(40),
    variantId: identifier.optional(),
    repetition: z.number().int().min(1).max(10).optional(),
    safeErrorCode: identifier.optional(),
  })
  .strict();

export const promptOpsExportSchema = z
  .object({
    apiVersion: z.literal(PROMPTOPS_API_VERSION),
    experimentId: identifier,
    planHash: sha256,
    evidenceHash: sha256,
    recommendation: experimentRecommendationSchema,
    decision: humanDecisionRequestSchema.optional(),
    artifactReferences: z
      .array(z.object({ artifactId: identifier, artifactHash: sha256 }).strict())
      .max(40),
  })
  .strict();

export const promptOpsProblemSchema = z
  .object({
    apiVersion: z.literal(PROMPTOPS_API_VERSION),
    type: z.string().min(1),
    title: z.string().min(1),
    status: z.number().int().min(400).max(599),
    code: identifier,
    detail: z.string().min(1).max(1024),
    correlationId: identifier,
    fieldErrors: z
      .array(
        z
          .object({
            path: z.string().min(1).max(512),
            code: identifier,
            message: z.string().min(1).max(1024),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();
