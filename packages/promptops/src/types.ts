export const PROMPTOPS_SCHEMA_VERSION = "1.0" as const;

export type PromptId = string;
export type PromptDraftId = string;
export type PromptVersionNumber = number;
export type ExperimentId = string;
export type RecommendationId = string;
export type DecisionId = string;

export type PromptTemplate = {
  schemaVersion: typeof PROMPTOPS_SCHEMA_VERSION;
  system?: string;
  user: string;
  declaredVariables: string[];
};

export type Prompt = {
  promptId: PromptId;
  displayName: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

export type PromptSummary = Prompt & {
  draftRevision?: number;
  latestVersion?: PromptVersionNumber;
};

export type PromptDetails = Prompt & {
  draft?: PromptDraft;
  versions: PublishedPromptVersion[];
};

export type CreatePromptInput = {
  promptId: PromptId;
  displayName: string;
  note?: string;
  template: PromptTemplate;
};

export type SavePromptDraftInput = {
  draftId: PromptDraftId;
  expectedRevision: number;
  note?: string;
  template: PromptTemplate;
};

export type PromptDraft = {
  draftId: PromptDraftId;
  promptId: PromptId;
  revision: number;
  parentVersion?: PromptVersionNumber;
  template: PromptTemplate;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

export type PublishedPromptVersion = {
  promptId: PromptId;
  version: PromptVersionNumber;
  parentVersion?: PromptVersionNumber;
  template: PromptTemplate;
  contentHash: string;
  publishedAt: string;
};

export const EXPERIMENT_STATES = [
  "DRAFT",
  "PLANNED",
  "RUNNING",
  "CANCELLING",
  "PARTIAL",
  "COMPLETED",
  "FAILED",
] as const;
export type ExperimentState = (typeof EXPERIMENT_STATES)[number];

export type PromptReference = {
  promptId: PromptId;
  version: PromptVersionNumber;
  hash: string;
};

export type ExperimentVariant = {
  variantId: string;
  label: string;
  prompt: PromptReference;
  targetId: string;
  targetHash: string;
};

export type RecommendationPolicyV1 = {
  version: typeof PROMPTOPS_SCHEMA_VERSION;
  baselineVariantId: string;
  minimumValidRepetitions: number;
  minimumMeanPassRate: number;
  maximumPassRateRegressionPoints: number;
  minimumVerdictAgreement: number;
  maximumFlakyCaseRate: number;
  blockOnCriticalRegression: true;
  maximumLatencyRegressionPercent?: number;
  maximumCostRegressionPercent?: number;
  requireCompleteUsageForLatencyGate: boolean;
  requireCompleteCostForCostGate: boolean;
};

export type ExperimentPlan = {
  schemaVersion: typeof PROMPTOPS_SCHEMA_VERSION;
  experimentId: ExperimentId;
  projectId: string;
  suiteId: string;
  fixtureSetId?: string;
  variants: ExperimentVariant[];
  repetitions: number;
  policy: RecommendationPolicyV1;
  compatibilityHash: string;
  planHash: string;
};

export const RECOMMENDATION_STATES = ["PROMOTE_CANDIDATE", "KEEP_BASELINE", "NO_DECISION"] as const;
export type RecommendationState = (typeof RECOMMENDATION_STATES)[number];

export type RecommendationReason = {
  code: string;
  message: string;
  variantId?: string;
  caseIds?: string[];
};

export type ExperimentRecommendation = {
  recommendationId: RecommendationId;
  state: RecommendationState;
  selectedVariantId?: string;
  evidenceHash: string;
  policyHash: string;
  reasons: RecommendationReason[];
  createdAt: string;
};

export const DECISION_ACTIONS = ["ACCEPT_RECOMMENDATION", "OVERRIDE_RECOMMENDATION"] as const;
export type DecisionAction = (typeof DECISION_ACTIONS)[number];

export const DECISION_OUTCOMES = ["PROMOTE_CANDIDATE", "KEEP_BASELINE", "DEFER"] as const;
export type DecisionOutcome = (typeof DECISION_OUTCOMES)[number];

export type HumanDecision = {
  decisionId: DecisionId;
  action: DecisionAction;
  outcome: DecisionOutcome;
  selectedVariantId?: string;
  recommendationId: RecommendationId;
  evidenceHash: string;
  reviewerLabel: string;
  rationale: string;
  createdAt: string;
};

export type PromptOpsExperiment = {
  experimentId: ExperimentId;
  name: string;
  note?: string;
  state: ExperimentState;
  plan?: ExperimentPlan;
  createdAt: string;
  updatedAt: string;
};

export type PromptOpsJsonPrimitive = string | number | boolean | null;
export type PromptOpsJsonValue =
  PromptOpsJsonPrimitive | PromptOpsJsonValue[] | { [key: string]: PromptOpsJsonValue };

export type PromptCaseInput = {
  user: string;
  context?: string;
  variables: Record<string, PromptOpsJsonPrimitive>;
};

export type PromptEvaluationCase = {
  id: string;
  input: PromptCaseInput;
};

export type PromptEvaluationSuite = {
  id: string;
  cases: PromptEvaluationCase[];
};

export type GenerationRequestContent = {
  system?: string;
  user: string;
  context?: string;
  variables: Record<string, PromptOpsJsonPrimitive>;
};
