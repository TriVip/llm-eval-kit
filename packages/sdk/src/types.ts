import type {
  BaselineComparison,
  CaseFilters,
  EvaluationSuite,
  ExecutionLogEvent,
  LlmProvider,
  ModelTarget,
  ProjectConfig,
  RunArtifact,
} from "@llm-eval-kit/core";
import type { MockFixtureFile } from "@llm-eval-kit/providers";

export type ValidationResult = { projectId: string; suiteId: string; caseCount: number };
export type RunPlan = {
  projectId: string;
  suiteId: string;
  provider: string;
  model: string;
  selectedCases: number;
  maximumCalls: number;
  preflightCost: "UNAVAILABLE" | "PRICING_CONFIGURED";
};
export type RunInput = {
  config: ProjectConfig;
  suite: EvaluationSuite;
  schemaRoot: string;
  filters?: CaseFilters;
  targetFixtures?: MockFixtureFile;
  judgeFixtures?: MockFixtureFile;
};
export type CompareInput = {
  candidate: RunArtifact;
  baseline: RunArtifact;
  maximumCategoryRegressionPoints?: number;
};
export type PromoteInput = { artifact: RunArtifact; outputPath: string; overwrite?: boolean };
export type ProviderFactoryInput = { target: ModelTarget; fixtures?: MockFixtureFile };
export type ProviderFactory = (input: ProviderFactoryInput) => LlmProvider;
export type ApplicationDependencies = { createProvider?: ProviderFactory };
export type RunControl = {
  runId?: string;
  signal?: AbortSignal;
  onEvent?: (event: ExecutionLogEvent) => Promise<void> | void;
};
export interface EvaluationApplication {
  validate(config: ProjectConfig, suite: EvaluationSuite): ValidationResult;
  plan(config: ProjectConfig, suite: EvaluationSuite, filters?: CaseFilters): RunPlan;
  run(input: RunInput, control?: RunControl): Promise<RunArtifact>;
  compare(input: CompareInput): BaselineComparison;
  promote(input: PromoteInput): Promise<string>;
}
