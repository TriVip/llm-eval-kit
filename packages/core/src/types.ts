export const INPUT_SCHEMA_VERSION = "1.0" as const;
export const ARTIFACT_SCHEMA_VERSION = "1.0" as const;

export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type Verdict = "PASS" | "FAIL" | "WARNING" | "ERROR";
export type EvaluatorKind = "DETERMINISTIC" | "MODEL_BASED";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type ModelTarget = {
  provider: string;
  model: string;
  apiKeyEnv?: string;
  temperature?: number;
  maxOutputTokens?: number;
  pricing?: TokenPricing;
};

export type TokenPricing = {
  inputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
};

export type ExecutionPolicy = {
  concurrency: number;
  timeoutMs: number;
  maxRetries: number;
  maxEstimatedCostUsd?: number;
  collectAllEvidence: boolean;
};

export type QualityGatePolicy = {
  minimumPassRate: number;
  minimumScore: number;
  maximumErrorRate: number;
  blockOnCriticalFailure: boolean;
  maximumCategoryRegressionPoints: number;
  warningCountsAsPass: boolean;
  reviewThreshold: number;
};

export type OutputPolicy = {
  directory: string;
  formats: Array<"terminal" | "json" | "html">;
  retainRawResponses: boolean;
};

export type ProjectConfig = {
  schemaVersion: typeof INPUT_SCHEMA_VERSION;
  project: {
    id: string;
    name: string;
  };
  target: ModelTarget;
  judge?: ModelTarget;
  execution: ExecutionPolicy;
  qualityGate: QualityGatePolicy;
  output: OutputPolicy;
};

export type EvaluatorSpec = {
  id: string;
  type: string;
  required: boolean;
  weight: number;
  config: Record<string, unknown>;
};

export type ExpectedBehavior = {
  behavior?: string;
  exact?: string;
  mustContain?: string[];
  mustNotContain?: string[];
  jsonSchemaRef?: string;
};

export type EvaluationCase = {
  id: string;
  name: string;
  category: string;
  severity: Severity;
  tags: string[];
  input: {
    user: string;
    context?: string;
    variables: Record<string, JsonPrimitive>;
  };
  expected?: ExpectedBehavior;
  evaluators: EvaluatorSpec[];
};

export type EvaluationSuite = {
  schemaVersion: typeof INPUT_SCHEMA_VERSION;
  id: string;
  name: string;
  description?: string;
  cases: EvaluationCase[];
};

export type GenerationRequest = {
  system?: string;
  user: string;
  context?: string;
  variables: Record<string, JsonPrimitive>;
  target: ModelTarget;
};

export type ProviderExecutionContext = {
  runId: string;
  caseId: string;
  attemptId: string;
  signal: AbortSignal;
};

export type ExecutionLogEvent = {
  runId: string;
  caseId?: string;
  attemptId?: string;
  providerId?: string;
  evaluatorId?: string;
  phase: "provider" | "evaluator" | "run";
  status: "started" | "completed" | "failed";
  durationMs?: number;
  errorCode?: string;
  usage?: UsageMetrics;
};

export type UsageMetrics = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
};

export type GenerationResult = {
  text: string;
  rawStructuredOutput?: JsonValue;
  finishReason?: string;
  usage: UsageMetrics;
  latencyMs: number;
  providerRequestId?: string;
  resolvedProvider: string;
  resolvedModel: string;
  attemptCount?: number;
};

export interface LlmProvider {
  readonly id: string;
  readonly maxConcurrency?: number;
  generate(
    request: GenerationRequest,
    context: ProviderExecutionContext,
  ): Promise<GenerationResult>;
}

export type EvaluationInput = {
  testCase: EvaluationCase;
  generation: GenerationResult;
};

export type EvaluationResult = {
  evaluatorId: string;
  kind: EvaluatorKind;
  verdict: Verdict;
  score?: number;
  confidence?: number;
  reason: string;
  evidence?: JsonValue;
  usage?: UsageMetrics;
  durationMs: number;
};

export interface Evaluator<TConfig = unknown> {
  readonly id: string;
  readonly kind: EvaluatorKind;
  evaluate(input: EvaluationInput, config: TConfig): Promise<EvaluationResult>;
}

export type RunMetadata = {
  runId: string;
  suiteId?: string;
  metricDefinitionsVersion?: "1.0";
  startedAt: string;
  completedAt?: string;
  configHash: string;
  suiteHash: string;
  promptHash?: string;
  gitSha?: string;
  target: ModelTarget;
};

export type CaseResult = {
  caseId: string;
  definitionHash?: string;
  category: string;
  severity: Severity;
  verdict: Verdict;
  score?: number;
  confidence?: number;
  generation?: GenerationResult;
  evaluations: EvaluationResult[];
  errorCode?: string;
};

export type CategoryMetrics = {
  category: string;
  selectedCases: number;
  executableCases: number;
  passedCases: number;
  failedCases: number;
  warningCases: number;
  errorCases: number;
  passRate: number;
};

export type RunMetrics = {
  selectedCases: number;
  executableCases: number;
  passedCases: number;
  failedCases: number;
  warningCases: number;
  errorCases: number;
  passRate: number;
  errorRate: number;
  categories: CategoryMetrics[];
  totalLatencyMs?: number;
  averageLatencyMs?: number;
  totalInputTokens?: number;
  totalOutputTokens?: number;
  totalTokens?: number;
  totalEstimatedCostUsd?: number;
  usageCoverage: number;
  costCoverage: number;
};

export type HumanReviewItem = {
  caseId: string;
  category: string;
  severity: Severity;
  verdict: Verdict;
  score?: number;
  confidence?: number;
  reasons: string[];
};

export type HumanReviewQueue = {
  schemaVersion: "1.0";
  runId: string;
  createdAt: string;
  items: HumanReviewItem[];
};

export type CategoryRegression = {
  category: string;
  regressionPoints: number;
  affectedCaseIds: string[];
};

export type QualityGateContext = {
  categoryRegressions?: CategoryRegression[];
};

export type CaseAggregate = {
  verdict: Verdict;
  score?: number;
  confidence?: number;
};

export type GateFailure = {
  code: string;
  reason: string;
  affectedCaseIds: string[];
};

export type RunArtifact = {
  artifactSchemaVersion: typeof ARTIFACT_SCHEMA_VERSION;
  metadata: RunMetadata;
  status: "PASSED" | "QUALITY_FAILED" | "OPERATIONAL_FAILED";
  metrics: RunMetrics;
  gateFailures: GateFailure[];
  cases: CaseResult[];
};

export type BaselineCaseClassification = {
  matched: string[];
  added: string[];
  removed: string[];
  changed: string[];
};

export type MetricDelta = {
  baseline: number;
  candidate: number;
  delta: number;
};

export type CategoryComparison = {
  category: string;
  matchedCaseIds: string[];
  passRate: MetricDelta;
};

export type BaselineComparison = {
  schemaVersion: "1.0";
  baselineRunId: string;
  candidateRunId: string;
  classification: BaselineCaseClassification;
  overallPassRate: MetricDelta;
  categories: CategoryComparison[];
  criticalRegressionCaseIds: string[];
  gateFailures: GateFailure[];
  status: "PASSED" | "QUALITY_FAILED";
  costDeltaUsd?: MetricDelta;
  latencyDeltaMs?: MetricDelta;
};

export interface ScoringEngine {
  aggregateCase(
    results: EvaluationResult[],
    specs: EvaluatorSpec[],
    policy: QualityGatePolicy,
  ): CaseAggregate;
  buildRunArtifact(
    metadata: RunMetadata,
    cases: CaseResult[],
    policy: QualityGatePolicy,
    gateContext?: QualityGateContext,
  ): RunArtifact;
}
