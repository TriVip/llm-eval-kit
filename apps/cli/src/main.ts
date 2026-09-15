import { dirname, resolve } from "node:path";

import { Command, CommanderError } from "commander";

import { writeRunArtifact } from "@llm-eval-kit/artifacts";
import { loadEvaluationSuite, loadProjectConfig } from "@llm-eval-kit/config";
import {
  ConfigurationError,
  DatasetValidationError,
  FrameworkError,
  runEvaluationSuite,
  type CaseFilters,
  type Evaluator,
  type RunArtifact,
  type Severity,
} from "@llm-eval-kit/core";
import {
  ContainsEvaluator,
  ExactMatchEvaluator,
  ForbiddenEvaluator,
  JsonSchemaEvaluator,
  RegexEvaluator,
} from "@llm-eval-kit/evaluators";
import { loadMockFixtureFile, MockProvider } from "@llm-eval-kit/providers";
import { RiskScoringEngine } from "@llm-eval-kit/scoring";

export type CliContext = {
  cwd?: string;
  writeOut?: (message: string) => void;
  writeErr?: (message: string) => void;
};

type RunOptions = {
  config: string;
  suite: string;
  fixtures: string;
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

function statusExitCode(artifact: RunArtifact): number {
  if (artifact.status === "PASSED") return 0;
  return artifact.status === "QUALITY_FAILED" ? 1 : 3;
}

async function executeRun(options: RunOptions, context: Required<CliContext>): Promise<number> {
  const config = await loadProjectConfig(resolve(context.cwd, options.config));
  const suitePath = resolve(context.cwd, options.suite);
  const suite = await loadEvaluationSuite(suitePath);

  if (config.target.provider !== "mock") {
    throw new ConfigurationError("Sprint 2 supports only the mock provider.");
  }

  const fixtureFile = await loadMockFixtureFile(resolve(context.cwd, options.fixtures));
  const provider = new MockProvider(fixtureFile.fixtures);
  const artifact = await runEvaluationSuite({
    config,
    suite,
    provider,
    evaluators: new Map<string, Evaluator<unknown>>([
      ["exact_match", new ExactMatchEvaluator()],
      ["contains", new ContainsEvaluator()],
      ["forbidden", new ForbiddenEvaluator()],
      ["regex", new RegexEvaluator()],
      ["json_schema", new JsonSchemaEvaluator({ schemaRoot: dirname(suitePath) })],
    ]),
    scoring: new RiskScoringEngine(),
    filters: caseFilters(options),
  });
  let artifactPath: string;
  try {
    artifactPath = await writeRunArtifact(artifact, resolve(context.cwd, config.output.directory));
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
    .requiredOption("--fixtures <path>", "mock provider fixture file")
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
