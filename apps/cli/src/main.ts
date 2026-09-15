import { dirname, join, resolve } from "node:path";

import { Command, CommanderError } from "commander";

import { promoteBaseline, writeHumanReviewQueue, writeRunArtifact } from "@llm-eval-kit/artifacts";
import { loadEvaluationSuite, loadProjectConfig, loadRunArtifact } from "@llm-eval-kit/config";
import {
  compareRunArtifacts,
  ConfigurationError,
  DatasetValidationError,
  FrameworkError,
  filterEvaluationSuite,
  redactRunArtifact,
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
import {
  appendStructuredLog,
  renderTerminalReport,
  writeHtmlReport,
} from "@llm-eval-kit/reporters";

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

type ValidateOptions = { config: string; suite: string };
type CompareOptions = { run: string; baseline: string; maximumCategoryRegressionPoints: string };
type BaselineSaveOptions = { run: string; output: string; overwrite?: boolean };
type ReportOptions = {
  run: string;
  format: "terminal" | "html";
  output?: string;
  baseline?: string;
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
  const outputRoot = resolve(context.cwd, config.output.directory);

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
  const artifact = await runEvaluationSuite(
    {
      config,
      suite,
      provider,
      evaluators: new Map<string, Evaluator<unknown>>(evaluatorEntries),
      scoring: new RiskScoringEngine(),
      filters,
    },
    {
      logEvent: async (event) => {
        await appendStructuredLog(join(outputRoot, event.runId, "logs.ndjson"), {
          timestamp: new Date().toISOString(),
          level: event.status === "failed" ? "error" : "info",
          event: `${event.phase}.${event.status}`,
          runId: event.runId,
          ...(event.caseId === undefined ? {} : { caseId: event.caseId }),
          ...(event.attemptId === undefined ? {} : { attemptId: event.attemptId }),
          ...(event.providerId === undefined ? {} : { providerId: event.providerId }),
          ...(event.evaluatorId === undefined ? {} : { evaluatorId: event.evaluatorId }),
          ...(event.durationMs === undefined ? {} : { durationMs: event.durationMs }),
          ...(event.errorCode === undefined ? {} : { errorCode: event.errorCode }),
          ...(event.usage === undefined ? {} : { data: { usage: event.usage } }),
        }).catch(() => undefined);
      },
    },
  );
  let artifactPath: string;
  const reportPaths: string[] = [];
  try {
    artifactPath = await writeRunArtifact(artifact, outputRoot, {
      retainRawResponses: config.output.retainRawResponses,
    });
    reportPaths.push(artifactPath);
    await writeHumanReviewQueue(artifact, outputRoot);
    const runDirectory = dirname(artifactPath);
    if (config.output.formats.includes("html")) {
      reportPaths.push(
        await writeHtmlReport(
          redactRunArtifact(artifact, config.output.retainRawResponses),
          join(runDirectory, "report.html"),
        ),
      );
    }
    await appendStructuredLog(join(runDirectory, "logs.ndjson"), {
      timestamp: new Date().toISOString(),
      level: "info",
      event: "run.completed",
      runId: artifact.metadata.runId,
      data: { status: artifact.status, metrics: artifact.metrics },
    });
  } catch (error) {
    if (artifact.status !== "PASSED") {
      context.writeErr(
        "The run artifact could not be written; preserving the run failure exit code.\n",
      );
      return statusExitCode(artifact);
    }
    throw error;
  }

  if (config.output.formats.includes("terminal")) {
    context.writeOut(renderTerminalReport(artifact, reportPaths));
  } else {
    context.writeOut(`Artifact: ${artifactPath}\n`);
  }
  return statusExitCode(artifact);
}

async function executeValidate(
  options: ValidateOptions,
  context: Required<CliContext>,
): Promise<number> {
  const config = await loadProjectConfig(resolve(context.cwd, options.config));
  const suite = await loadEvaluationSuite(resolve(context.cwd, options.suite));
  context.writeOut(
    `Validation passed: ${config.project.id}/${suite.id} (${suite.cases.length} cases)\n`,
  );
  return 0;
}

async function executeCompare(
  options: CompareOptions,
  context: Required<CliContext>,
): Promise<number> {
  const maximum = Number(options.maximumCategoryRegressionPoints);
  if (!Number.isFinite(maximum) || maximum < 0 || maximum > 100) {
    throw new ConfigurationError("Maximum category regression points must be between 0 and 100.");
  }
  const candidate = await loadRunArtifact(resolve(context.cwd, options.run));
  const baseline = await loadRunArtifact(resolve(context.cwd, options.baseline));
  const comparison = compareRunArtifacts(candidate, baseline, {
    maximumCategoryRegressionPoints: maximum,
  });
  context.writeOut(`${JSON.stringify(comparison, null, 2)}\n`);
  return comparison.status === "PASSED" ? 0 : 1;
}

async function executeBaselineSave(
  options: BaselineSaveOptions,
  context: Required<CliContext>,
): Promise<number> {
  const artifact = await loadRunArtifact(resolve(context.cwd, options.run));
  const output = await promoteBaseline(
    artifact,
    resolve(context.cwd, options.output),
    options.overwrite === undefined ? {} : { overwrite: options.overwrite },
  );
  context.writeOut(`Baseline promoted: ${output}\n`);
  return 0;
}

async function executeReport(
  options: ReportOptions,
  context: Required<CliContext>,
): Promise<number> {
  const artifact = await loadRunArtifact(resolve(context.cwd, options.run));
  const comparison =
    options.baseline === undefined
      ? undefined
      : compareRunArtifacts(
          artifact,
          await loadRunArtifact(resolve(context.cwd, options.baseline)),
        );
  if (options.format === "terminal") {
    context.writeOut(renderTerminalReport(artifact, [], comparison));
    return 0;
  }
  const output = resolve(context.cwd, options.output ?? join(dirname(options.run), "report.html"));
  await writeHtmlReport(artifact, output, comparison);
  context.writeOut(`Report: ${output}\n`);
  return 0;
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
    .command("validate")
    .description("Validate configuration and suite files without provider calls.")
    .requiredOption("--config <path>", "project configuration file")
    .requiredOption("--suite <path>", "evaluation suite file")
    .action(async (options: ValidateOptions) => {
      commandExitCode = await executeValidate(options, context);
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

  program
    .command("compare")
    .description("Compare a candidate run with a compatible baseline.")
    .requiredOption("--run <path>", "candidate run.json")
    .requiredOption("--baseline <path>", "baseline run.json")
    .option("--maximum-category-regression-points <points>", "allowed category regression", "3")
    .action(async (options: CompareOptions) => {
      commandExitCode = await executeCompare(options, context);
    });

  const baseline = program.command("baseline").description("Manage explicit run baselines.");
  baseline
    .command("save")
    .description("Promote a validated run artifact to a baseline.")
    .requiredOption("--run <path>", "source run.json")
    .requiredOption("--output <path>", "baseline output path")
    .option("--overwrite", "replace an existing baseline explicitly")
    .action(async (options: BaselineSaveOptions) => {
      commandExitCode = await executeBaselineSave(options, context);
    });

  program
    .command("report")
    .description("Render a report from an immutable run artifact.")
    .requiredOption("--run <path>", "run.json")
    .requiredOption("--format <format>", "terminal or html")
    .option("--output <path>", "HTML output path")
    .option("--baseline <path>", "optional compatible baseline")
    .action(async (options: ReportOptions) => {
      if (options.format !== "terminal" && options.format !== "html") {
        throw new ConfigurationError("Report format must be terminal or html.");
      }
      commandExitCode = await executeReport(options, context);
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
