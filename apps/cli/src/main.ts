import { dirname, resolve } from "node:path";

import { Command, CommanderError } from "commander";

import { writeHumanReviewQueue, writeRunArtifact } from "@llm-eval-kit/artifacts";
import { loadEvaluationSuite, loadProjectConfig } from "@llm-eval-kit/config";
import {
  ConfigurationError,
  DatasetValidationError,
  FrameworkError,
  filterEvaluationSuite,
  runEvaluationSuite,
  type CaseFilters,
  type Evaluator,
  type RunArtifact,
  type Severity,
  type LlmProvider,
  type ModelTarget,
} from "@llm-eval-kit/core";
import {
  ContainsEvaluator,
  ExactMatchEvaluator,
  ForbiddenEvaluator,
  JsonSchemaEvaluator,
  LlmJudgeEvaluator,
  RegexEvaluator,
} from "@llm-eval-kit/evaluators";
import {
  GeminiProvider,
  loadMockFixtureFile,
  MockProvider,
  OpenAiProvider,
} from "@llm-eval-kit/providers";
import { RiskScoringEngine } from "@llm-eval-kit/scoring";

export type CliContext = {
  cwd?: string;
  writeOut?: (message: string) => void;
  writeErr?: (message: string) => void;
};

type RunOptions = {
  config: string;
  suite: string;
  fixtures?: string;
  judgeFixtures?: string;
  dryRun?: boolean;
  case?: string[];
  category?: string[];
  severity?: string[];
  tag?: string[];
};

const defaultWriteOut = (message: string): void => {
  process.stdout.write(message);
};

const defaultWriteErr = (message: string): void => {
  process.stderr.write(message);
};

function errorExitCode(error: FrameworkError): number {
  if (error.code === "CONFIGURATION_ERROR" || error.code === "DATASET_VALIDATION_ERROR") {
    return 2;
  }

  if (error.code.startsWith("PROVIDER_") || error.code === "MOCK_FIXTURE_NOT_FOUND") {
    return 3;
  }

  return 4;
}

function renderSummary(
  artifactPath: string,
  artifact: Awaited<ReturnType<typeof runEvaluationSuite>>,
): string {
  const { metrics } = artifact;
  return [
    `Run: ${artifact.metadata.runId}`,
    `Status: ${artifact.status}`,
    `Cases: ${metrics.passedCases} passed, ${metrics.failedCases} failed, ${metrics.warningCases} warnings, ${metrics.errorCases} errors`,
    `Pass rate: ${(metrics.passRate * 100).toFixed(2)}%`,
    ...artifact.gateFailures.map(
      (failure) =>
        `Gate failure [${failure.code}]: ${failure.reason} Cases: ${failure.affectedCaseIds.join(", ") || "none"}`,
    ),
    `Artifact: ${artifactPath}`,
    "",
  ].join("\n");
}

function collectOption(value: string, previous: string[] = []): string[] {
  return [
    ...previous,
    ...value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  ];
}

function caseFilters(options: RunOptions): CaseFilters {
  const allowedSeverities = new Set<Severity>(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
  const severities = options.severity?.map((value) => value.toUpperCase());
  if (severities?.some((value) => !allowedSeverities.has(value as Severity))) {
    throw new DatasetValidationError("Severity filter must be LOW, MEDIUM, HIGH, or CRITICAL.");
  }
  return {
    ...(options.case === undefined ? {} : { caseIds: options.case }),
    ...(options.category === undefined ? {} : { categories: options.category }),
    ...(severities === undefined ? {} : { severities: severities as Severity[] }),
    ...(options.tag === undefined ? {} : { tags: options.tag }),
  };
}

async function createProvider(
  target: ModelTarget,
  fixturePath: string | undefined,
  cwd: string,
): Promise<LlmProvider> {
  if (target.provider === "mock") {
    if (fixturePath === undefined) {
      throw new ConfigurationError("The mock provider requires --fixtures <path>.");
    }
    const fixtureFile = await loadMockFixtureFile(resolve(cwd, fixturePath));
    return new MockProvider(fixtureFile.fixtures);
  }
  if (target.provider === "openai") return new OpenAiProvider();
  if (target.provider === "gemini") return new GeminiProvider();
  throw new ConfigurationError(`Unsupported provider: ${target.provider}`);
}

function usesJudge(suite: Awaited<ReturnType<typeof loadEvaluationSuite>>): boolean {
  return suite.cases.some((testCase) =>
    testCase.evaluators.some((evaluator) => evaluator.type === "llm_judge"),
  );
}

function statusExitCode(artifact: RunArtifact): number {
  if (artifact.status === "PASSED") return 0;
  return artifact.status === "QUALITY_FAILED" ? 1 : 3;
}

async function executeRun(options: RunOptions, context: Required<CliContext>): Promise<number> {
  const config = await loadProjectConfig(resolve(context.cwd, options.config));
  const suitePath = resolve(context.cwd, options.suite);
  const suite = await loadEvaluationSuite(suitePath);
  const filters = caseFilters(options);
  const selectedSuite = filterEvaluationSuite(suite, filters);

  if (options.dryRun === true) {
    context.writeOut(
      [
        "Dry run: validation passed; no provider calls were made.",
        `Provider: ${config.target.provider}`,
        `Model: ${config.target.model}`,
        `Selected cases: ${selectedSuite.cases.length}`,
        `Maximum calls before retries/judging: ${selectedSuite.cases.length}`,
        config.target.pricing === undefined
          ? "Preflight cost: unavailable without observed token usage."
          : "Preflight cost: pricing configured; exact cost requires observed token usage.",
        "",
      ].join("\n"),
    );
    return 0;
  }

  const provider = await createProvider(config.target, options.fixtures, context.cwd);
  if (usesJudge(selectedSuite) && config.judge === undefined) {
    throw new ConfigurationError("Suite uses llm_judge but project config has no judge target.");
  }
  const evaluatorEntries: Array<[string, Evaluator<unknown>]> = [
    ["exact_match", new ExactMatchEvaluator()],
    ["contains", new ContainsEvaluator()],
    ["forbidden", new ForbiddenEvaluator()],
    ["regex", new RegexEvaluator()],
    ["json_schema", new JsonSchemaEvaluator({ schemaRoot: dirname(suitePath) })],
  ];
  if (config.judge !== undefined) {
    const judgeProvider = await createProvider(
      config.judge,
      options.judgeFixtures ?? options.fixtures,
      context.cwd,
    );
    evaluatorEntries.push([
      "llm_judge",
      new LlmJudgeEvaluator({
        provider: judgeProvider,
        target: config.judge,
        execution: config.execution,
      }) as Evaluator<unknown>,
    ]);
  }
  const artifact = await runEvaluationSuite({
    config,
    suite,
    provider,
    evaluators: new Map<string, Evaluator<unknown>>(evaluatorEntries),
    scoring: new RiskScoringEngine(),
    filters,
  });
  let artifactPath: string;
  try {
    artifactPath = await writeRunArtifact(artifact, resolve(context.cwd, config.output.directory));
    await writeHumanReviewQueue(artifact, resolve(context.cwd, config.output.directory));
  } catch (error) {
    if (artifact.status !== "PASSED") {
      context.writeErr(
        "The run artifact could not be written; preserving the run failure exit code.\n",
      );
      return statusExitCode(artifact);
    }
    throw error;
  }

  context.writeOut(renderSummary(artifactPath, artifact));
  return statusExitCode(artifact);
}

export async function runCli(argv: string[], providedContext: CliContext = {}): Promise<number> {
  const context: Required<CliContext> = {
    cwd: providedContext.cwd ?? process.cwd(),
    writeOut: providedContext.writeOut ?? defaultWriteOut,
    writeErr: providedContext.writeErr ?? defaultWriteErr,
  };
  const program = new Command();
  let commandExitCode = 0;

  program
    .name("llmeval")
    .description("Test and regression-check LLM-powered applications.")
    .version("0.0.0")
    .exitOverride()
    .configureOutput({
      writeOut: context.writeOut,
      writeErr: context.writeErr,
    });

  program
    .command("run")
    .description("Run an evaluation suite.")
    .requiredOption("--config <path>", "project configuration file")
    .requiredOption("--suite <path>", "evaluation suite file")
    .option("--fixtures <path>", "mock provider fixture file")
    .option("--judge-fixtures <path>", "separate mock fixture file for LLM-as-a-Judge")
    .option("--dry-run", "validate and estimate calls without invoking providers")
    .option("--case <id>", "case ID filter (repeatable or comma-separated)", collectOption)
    .option("--category <name>", "category filter (repeatable or comma-separated)", collectOption)
    .option("--severity <level>", "severity filter (repeatable or comma-separated)", collectOption)
    .option("--tag <name>", "tag filter (repeatable or comma-separated)", collectOption)
    .action(async (options: RunOptions) => {
      commandExitCode = await executeRun(options, context);
    });

  try {
    await program.parseAsync(["node", "llmeval", ...argv]);
    return commandExitCode;
  } catch (error) {
    if (error instanceof CommanderError) {
      return error.code === "commander.helpDisplayed" ? 0 : 2;
    }

    if (error instanceof FrameworkError) {
      context.writeErr(`${error.safeMessage}\n`);
      return errorExitCode(error);
    }

    context.writeErr("An internal framework error occurred.\n");
    return 4;
  }
}
