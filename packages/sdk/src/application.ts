import { promoteBaseline } from "@llm-eval-kit/artifacts";
import {
  compareRunArtifacts,
  ConfigurationError,
  filterEvaluationSuite,
  runEvaluationSuite,
  type EvaluationSuite,
  type Evaluator,
  type LlmProvider,
} from "@llm-eval-kit/core";
import {
  ContainsEvaluator,
  ExactMatchEvaluator,
  ForbiddenEvaluator,
  JsonSchemaEvaluator,
  LlmJudgeEvaluator,
  RegexEvaluator,
} from "@llm-eval-kit/evaluators";
import { GeminiProvider, MockProvider, OpenAiProvider } from "@llm-eval-kit/providers";
import { RiskScoringEngine } from "@llm-eval-kit/scoring";

import type {
  ApplicationDependencies,
  EvaluationApplication,
  ProviderFactory,
  RunInput,
} from "./types.js";

function usesJudge(suite: EvaluationSuite): boolean {
  return suite.cases.some((testCase) =>
    testCase.evaluators.some((evaluator) => evaluator.type === "llm_judge"),
  );
}

const defaultProviderFactory: ProviderFactory = ({ target, fixtures }) => {
  if (target.provider === "mock") {
    if (fixtures === undefined) {
      throw new ConfigurationError("The mock provider requires a fixture resource.");
    }
    return new MockProvider(fixtures.fixtures);
  }
  if (target.provider === "openai") return new OpenAiProvider();
  if (target.provider === "gemini") return new GeminiProvider();
  throw new ConfigurationError(`Unsupported provider: ${target.provider}`);
};

function validateProject(config: RunInput["config"], suite: EvaluationSuite) {
  if (usesJudge(suite) && config.judge === undefined) {
    throw new ConfigurationError("Suite uses llm_judge but project config has no judge target.");
  }
  return { projectId: config.project.id, suiteId: suite.id, caseCount: suite.cases.length };
}

function evaluatorRegistry(input: RunInput, createProvider: ProviderFactory) {
  const entries: Array<[string, Evaluator<unknown>]> = [
    ["exact_match", new ExactMatchEvaluator()],
    ["contains", new ContainsEvaluator()],
    ["forbidden", new ForbiddenEvaluator()],
    ["regex", new RegexEvaluator()],
    ["json_schema", new JsonSchemaEvaluator({ schemaRoot: input.schemaRoot })],
  ];
  if (input.config.judge !== undefined) {
    const provider = createProvider({
      target: input.config.judge,
      ...((input.judgeFixtures ?? input.targetFixtures) === undefined
        ? {}
        : { fixtures: input.judgeFixtures ?? input.targetFixtures }),
    });
    entries.push([
      "llm_judge",
      new LlmJudgeEvaluator({
        provider,
        target: input.config.judge,
        execution: input.config.execution,
      }) as Evaluator<unknown>,
    ]);
  }
  return new Map(entries);
}

export function createEvaluationApplication(
  dependencies: ApplicationDependencies = {},
): EvaluationApplication {
  const createProvider = dependencies.createProvider ?? defaultProviderFactory;
  return {
    validate: validateProject,
    plan(config, suite, filters) {
      validateProject(config, suite);
      const selected = filterEvaluationSuite(suite, filters);
      return {
        projectId: config.project.id,
        suiteId: suite.id,
        provider: config.target.provider,
        model: config.target.model,
        selectedCases: selected.cases.length,
        maximumCalls: selected.cases.length,
        preflightCost: config.target.pricing === undefined ? "UNAVAILABLE" : "PRICING_CONFIGURED",
      };
    },
    async run(input, control = {}) {
      validateProject(input.config, input.suite);
      const provider: LlmProvider = createProvider({
        target: input.config.target,
        ...(input.targetFixtures === undefined ? {} : { fixtures: input.targetFixtures }),
      });
      return runEvaluationSuite(
        {
          config: input.config,
          suite: input.suite,
          provider,
          evaluators: evaluatorRegistry(input, createProvider),
          scoring: new RiskScoringEngine(),
          ...(input.filters === undefined ? {} : { filters: input.filters }),
        },
        {
          logEvent: async (event) => void (await control.onEvent?.(event)),
          ...(control.runId === undefined ? {} : { createRunId: () => control.runId! }),
        },
      );
    },
    compare(input) {
      return compareRunArtifacts(input.candidate, input.baseline, {
        ...(input.maximumCategoryRegressionPoints === undefined
          ? {}
          : { maximumCategoryRegressionPoints: input.maximumCategoryRegressionPoints }),
      });
    },
    async promote(input) {
      return promoteBaseline(input.artifact, input.outputPath, {
        ...(input.overwrite === undefined ? {} : { overwrite: input.overwrite }),
      });
    },
  };
}
