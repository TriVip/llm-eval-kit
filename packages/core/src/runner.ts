import { createHash, randomUUID } from "node:crypto";

import { FrameworkError } from "./errors.js";
import { executeWithRetry, mapWithConcurrency, type RetryDependencies } from "./execution.js";
import { filterEvaluationSuite, type CaseFilters } from "./filters.js";
import type {
  CaseResult,
  ExecutionLogEvent,
  EvaluationResult,
  EvaluationSuite,
  Evaluator,
  GenerationRequest,
  GenerationRequestRenderer,
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
  retry: RetryDependencies;
  logEvent: (event: ExecutionLogEvent) => Promise<void>;
};

export type RunEvaluationInput = {
  config: ProjectConfig;
  suite: EvaluationSuite;
  provider: LlmProvider;
  evaluators: EvaluatorRegistry;
  scoring: ScoringEngine;
  requestRenderer?: GenerationRequestRenderer;
  filters?: CaseFilters;
  signal?: AbortSignal;
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
  retry: {
    sleep: async (milliseconds) =>
      new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
      }),
    random: Math.random,
  },
  logEvent: async () => undefined,
};

async function emitLog(
  logEvent: RunnerDependencies["logEvent"],
  event: ExecutionLogEvent,
): Promise<void> {
  await logEvent(event).catch(() => undefined);
}

function errorResult(
  evaluatorId: string,
  kind: EvaluationResult["kind"],
  reason: string,
): EvaluationResult {
  return {
    evaluatorId,
    kind,
    verdict: "ERROR",
    reason,
    durationMs: 0,
  };
}

async function evaluateCase(
  suiteCase: EvaluationSuite["cases"][number],
  generation: Awaited<ReturnType<LlmProvider["generate"]>>,
  evaluators: EvaluatorRegistry,
  scoring: ScoringEngine,
  config: ProjectConfig,
  runId: string,
  logEvent: RunnerDependencies["logEvent"],
  signal?: AbortSignal,
): Promise<CaseResult> {
  const evaluations: EvaluationResult[] = [];

  for (const spec of suiteCase.evaluators) {
    const evaluator = evaluators.get(spec.type);

    if (evaluator === undefined) {
      evaluations.push(
        errorResult(spec.id, "DETERMINISTIC", `Evaluator type is not registered: ${spec.type}`),
      );
      continue;
    }

    try {
      const result = await evaluator.evaluate(
        { testCase: suiteCase, generation, ...(signal === undefined ? {} : { signal }) },
        spec.config,
      );
      evaluations.push({ ...result, evaluatorId: spec.id });
      await emitLog(logEvent, {
        runId,
        caseId: suiteCase.id,
        evaluatorId: spec.id,
        phase: "evaluator",
        status: "completed",
        durationMs: result.durationMs,
        ...(result.usage === undefined ? {} : { usage: result.usage }),
      });
    } catch (error) {
      const reason =
        error instanceof FrameworkError
          ? error.safeMessage
          : `Evaluator failed unexpectedly: ${spec.id}`;
      evaluations.push(errorResult(spec.id, evaluator.kind, reason));
      await emitLog(logEvent, {
        runId,
        caseId: suiteCase.id,
        evaluatorId: spec.id,
        phase: "evaluator",
        status: "failed",
        errorCode: error instanceof FrameworkError ? error.code : "UNCLASSIFIED_EVALUATOR_ERROR",
      });
    }
  }

  const aggregate = scoring.aggregateCase(evaluations, suiteCase.evaluators, config.qualityGate);
  return {
    caseId: suiteCase.id,
    definitionHash: hash(suiteCase),
    category: suiteCase.category,
    severity: suiteCase.severity,
    tags: suiteCase.tags,
    verdict: aggregate.verdict,
    ...(aggregate.score === undefined ? {} : { score: aggregate.score }),
    ...(aggregate.confidence === undefined ? {} : { confidence: aggregate.confidence }),
    generation,
    evaluations,
  };
}

function providerErrorCase(
  suiteCase: EvaluationSuite["cases"][number],
  errorCode: string,
): CaseResult {
  return {
    caseId: suiteCase.id,
    definitionHash: hash(suiteCase),
    category: suiteCase.category,
    severity: suiteCase.severity,
    tags: suiteCase.tags,
    verdict: "ERROR",
    evaluations: [],
    errorCode,
  };
}

function generationRequest(
  config: ProjectConfig,
  suiteCase: EvaluationSuite["cases"][number],
  requestRenderer?: GenerationRequestRenderer,
): GenerationRequest {
  if (requestRenderer !== undefined) {
    return { ...requestRenderer.render(suiteCase), target: config.target };
  }
  return {
    user: suiteCase.input.user,
    variables: suiteCase.input.variables,
    target: config.target,
    ...(suiteCase.input.context === undefined ? {} : { context: suiteCase.input.context }),
  };
}

export async function runEvaluationSuite(
  input: RunEvaluationInput,
  providedDependencies: Partial<RunnerDependencies> = {},
): Promise<RunArtifact> {
  const dependencies: RunnerDependencies = {
    ...defaultDependencies,
    ...providedDependencies,
    retry: { ...defaultDependencies.retry, ...providedDependencies.retry },
  };
  const startedAt = dependencies.now();
  const runId = dependencies.createRunId(startedAt);
  const metadata: RunMetadata = {
    runId,
    suiteId: input.suite.id,
    metricDefinitionsVersion: "1.0",
    startedAt: startedAt.toISOString(),
    configHash: hash(input.config),
    suiteHash: hash(input.suite),
    ...(input.requestRenderer === undefined
      ? {}
      : { promptHash: input.requestRenderer.promptHash }),
    target: input.config.target,
  };
  const selectedSuite = filterEvaluationSuite(input.suite, input.filters);
  let cancellationRequestedAt: string | undefined;
  const recordCancellation = () => {
    const reason = input.signal?.reason;
    cancellationRequestedAt =
      typeof reason === "string" && !Number.isNaN(Date.parse(reason))
        ? new Date(reason).toISOString()
        : dependencies.now().toISOString();
  };
  if (input.signal?.aborted === true) recordCancellation();
  else input.signal?.addEventListener("abort", recordCancellation, { once: true });
  await emitLog(dependencies.logEvent, {
    runId,
    phase: "run",
    status: "started",
  });
  const budget = input.config.execution.maxEstimatedCostUsd;
  let observedCostUsd = 0;
  const concurrency = Math.min(
    input.config.execution.concurrency,
    input.provider.maxConcurrency ?? Number.POSITIVE_INFINITY,
  );

  const execution = await mapWithConcurrency(
    selectedSuite.cases,
    concurrency,
    async (suiteCase): Promise<CaseResult> => {
      await emitLog(dependencies.logEvent, {
        runId,
        caseId: suiteCase.id,
        phase: "run",
        status: "started",
      });
      try {
        const generation = await executeWithRetry(
          async (attempt, signal) => {
            const attemptId = `${suiteCase.id}_attempt_${attempt}`;
            await emitLog(dependencies.logEvent, {
              runId,
              caseId: suiteCase.id,
              attemptId,
              providerId: input.provider.id,
              phase: "provider",
              status: "started",
            });
            try {
              const result = await input.provider.generate(
                generationRequest(input.config, suiteCase, input.requestRenderer),
                { runId, caseId: suiteCase.id, attemptId, signal },
              );
              await emitLog(dependencies.logEvent, {
                runId,
                caseId: suiteCase.id,
                attemptId,
                providerId: input.provider.id,
                phase: "provider",
                status: "completed",
                durationMs: result.latencyMs,
                usage: result.usage,
              });
              return { ...result, attemptCount: attempt };
            } catch (error) {
              await emitLog(dependencies.logEvent, {
                runId,
                caseId: suiteCase.id,
                attemptId,
                providerId: input.provider.id,
                phase: "provider",
                status: "failed",
                errorCode:
                  error instanceof FrameworkError ? error.code : "UNCLASSIFIED_PROVIDER_ERROR",
              });
              throw error;
            }
          },
          input.config.execution,
          dependencies.retry,
          input.signal,
        );
        const result = await evaluateCase(
          suiteCase,
          generation,
          input.evaluators,
          input.scoring,
          input.config,
          runId,
          dependencies.logEvent,
          input.signal,
        );
        observedCostUsd +=
          (result.generation?.usage.estimatedCostUsd ?? 0) +
          result.evaluations.reduce(
            (total, evaluation) => total + (evaluation.usage?.estimatedCostUsd ?? 0),
            0,
          );
        await emitLog(dependencies.logEvent, {
          runId,
          caseId: suiteCase.id,
          phase: "run",
          status: "completed",
        });
        return result;
      } catch (error) {
        await emitLog(dependencies.logEvent, {
          runId,
          caseId: suiteCase.id,
          phase: "run",
          status: "failed",
          errorCode: error instanceof FrameworkError ? error.code : "UNCLASSIFIED_PROVIDER_ERROR",
        });
        return providerErrorCase(
          suiteCase,
          error instanceof FrameworkError ? error.code : "UNCLASSIFIED_PROVIDER_ERROR",
        );
      }
    },
    () => input.signal?.aborted === true || (budget !== undefined && observedCostUsd >= budget),
  );

  const unscheduled = new Set(execution.unscheduledIndexes);
  const cases = selectedSuite.cases.map((suiteCase, index) => {
    if (unscheduled.has(index)) {
      return providerErrorCase(
        suiteCase,
        input.signal?.aborted === true ? "EVALUATION_CANCELLED" : "BUDGET_EXHAUSTED",
      );
    }
    return execution.results[index] ?? providerErrorCase(suiteCase, "INTERNAL_SCHEDULER_ERROR");
  });
  input.signal?.removeEventListener("abort", recordCancellation);

  const artifact = input.scoring.buildRunArtifact(
    { ...metadata, completedAt: dependencies.now().toISOString() },
    cases,
    input.config.qualityGate,
  );
  if (input.signal?.aborted === true) {
    artifact.status = "OPERATIONAL_FAILED";
    artifact.termination = {
      kind: "CANCELLED",
      selectedCases: selectedSuite.cases.length,
      completedCases: cases.filter(({ errorCode }) => errorCode !== "EVALUATION_CANCELLED").length,
      requestedAt: cancellationRequestedAt ?? dependencies.now().toISOString(),
    };
  }
  await emitLog(dependencies.logEvent, { runId, phase: "run", status: "completed" });
  return artifact;
}
