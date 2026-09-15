import { createHash, randomUUID } from "node:crypto";

import { FrameworkError } from "./errors.js";
import { filterEvaluationSuite, type CaseFilters } from "./filters.js";
import type {
  CaseResult,
  EvaluationResult,
  EvaluationSuite,
  Evaluator,
  GenerationRequest,
  LlmProvider,
  ProjectConfig,
  RunArtifact,
  RunMetadata,
  ScoringEngine,
} from "./types.js";

export type EvaluatorRegistry = ReadonlyMap<string, Evaluator<unknown>>;

export type RunnerDependencies = {
  now: () => Date;
  createRunId: (now: Date) => string;
};

export type RunEvaluationInput = {
  config: ProjectConfig;
  suite: EvaluationSuite;
  provider: LlmProvider;
  evaluators: EvaluatorRegistry;
  scoring: ScoringEngine;
  filters?: CaseFilters;
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }

  return value;
}

function hash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

function defaultRunId(now: Date): string {
  const timestamp = now.toISOString().replace(/[-:.]/g, "").replace("Z", "Z");
  return `run_${timestamp}_${randomUUID().slice(0, 8)}`;
}

const defaultDependencies: RunnerDependencies = {
  now: () => new Date(),
  createRunId: defaultRunId,
};

function errorResult(evaluatorId: string, reason: string): EvaluationResult {
  return {
    evaluatorId,
    kind: "DETERMINISTIC",
    verdict: "ERROR",
    reason,
    durationMs: 0,
  };
}

function generationRequest(
  config: ProjectConfig,
  suiteCase: EvaluationSuite["cases"][number],
): GenerationRequest {
  return {
    user: suiteCase.input.user,
    variables: suiteCase.input.variables,
    target: config.target,
    ...(suiteCase.input.context === undefined ? {} : { context: suiteCase.input.context }),
  };
}

export async function runEvaluationSuite(
  input: RunEvaluationInput,
  dependencies: RunnerDependencies = defaultDependencies,
): Promise<RunArtifact> {
  const startedAt = dependencies.now();
  const runId = dependencies.createRunId(startedAt);
  const metadata: RunMetadata = {
    runId,
    startedAt: startedAt.toISOString(),
    configHash: hash(input.config),
    suiteHash: hash(input.suite),
    target: input.config.target,
  };
  const cases: CaseResult[] = [];
  const selectedSuite = filterEvaluationSuite(input.suite, input.filters);

  for (const suiteCase of selectedSuite.cases) {
    try {
      const generation = await input.provider.generate(generationRequest(input.config, suiteCase), {
        runId,
        caseId: suiteCase.id,
        attemptId: `${suiteCase.id}_attempt_1`,
        signal: new AbortController().signal,
      });
      const evaluations: EvaluationResult[] = [];

      for (const spec of suiteCase.evaluators) {
        const evaluator = input.evaluators.get(spec.type);

        if (evaluator === undefined) {
          evaluations.push(errorResult(spec.id, `Evaluator type is not registered: ${spec.type}`));
          continue;
        }

        try {
          const result = await evaluator.evaluate({ testCase: suiteCase, generation }, spec.config);
          evaluations.push({ ...result, evaluatorId: spec.id });
        } catch (error) {
          const reason =
            error instanceof FrameworkError
              ? error.safeMessage
              : `Evaluator failed unexpectedly: ${spec.id}`;
          evaluations.push(errorResult(spec.id, reason));
        }
      }

      const aggregate = input.scoring.aggregateCase(
        evaluations,
        suiteCase.evaluators,
        input.config.qualityGate,
      );
      cases.push({
        caseId: suiteCase.id,
        category: suiteCase.category,
        severity: suiteCase.severity,
        verdict: aggregate.verdict,
        ...(aggregate.score === undefined ? {} : { score: aggregate.score }),
        ...(aggregate.confidence === undefined ? {} : { confidence: aggregate.confidence }),
        generation,
        evaluations,
      });
    } catch (error) {
      cases.push({
        caseId: suiteCase.id,
        category: suiteCase.category,
        severity: suiteCase.severity,
        verdict: "ERROR",
        evaluations: [],
        errorCode: error instanceof FrameworkError ? error.code : "UNCLASSIFIED_PROVIDER_ERROR",
      });
    }
  }

  return input.scoring.buildRunArtifact(
    { ...metadata, completedAt: dependencies.now().toISOString() },
    cases,
    input.config.qualityGate,
  );
}
