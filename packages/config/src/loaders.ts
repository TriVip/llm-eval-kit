import { readFile } from "node:fs/promises";
import { extname } from "node:path";

import { parse as parseYaml } from "yaml";
import type { ZodError } from "zod";

import {
  ConfigurationError,
  DatasetValidationError,
  type EvaluationSuite,
  type ProjectConfig,
  type RunArtifact,
} from "@llm-eval-kit/core";

import { evaluationSuiteSchema, projectConfigSchema, runArtifactSchema } from "./schemas.js";

type FileKind = "configuration" | "evaluation suite" | "run artifact";

function validationSummary(error: ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
    .join("; ");
}

async function readStructuredFile(filePath: string, kind: FileKind): Promise<unknown> {
  let content: string;

  try {
    content = await readFile(filePath, "utf8");
  } catch {
    throw new ConfigurationError(`Unable to read ${kind} file: ${filePath}`);
  }

  try {
    const extension = extname(filePath).toLowerCase();

    if (extension === ".json") {
      return JSON.parse(content) as unknown;
    }

    if (extension === ".yaml" || extension === ".yml") {
      return parseYaml(content) as unknown;
    }

    throw new ConfigurationError(`Unsupported ${kind} file extension. Use .json, .yaml, or .yml.`);
  } catch (error) {
    if (error instanceof ConfigurationError) {
      throw error;
    }

    throw new ConfigurationError(`Unable to parse ${kind} file: ${filePath}`);
  }
}

export async function loadProjectConfig(filePath: string): Promise<ProjectConfig> {
  const input = await readStructuredFile(filePath, "configuration");
  const result = projectConfigSchema.safeParse(input);

  if (!result.success) {
    throw new ConfigurationError(`Invalid configuration: ${validationSummary(result.error)}`);
  }

  return result.data as ProjectConfig;
}

export async function loadEvaluationSuite(filePath: string): Promise<EvaluationSuite> {
  let input: unknown;

  try {
    input = await readStructuredFile(filePath, "evaluation suite");
  } catch (error) {
    if (error instanceof ConfigurationError) {
      throw new DatasetValidationError(error.safeMessage);
    }

    throw error;
  }

  const result = evaluationSuiteSchema.safeParse(input);

  if (!result.success) {
    throw new DatasetValidationError(
      `Invalid evaluation suite: ${validationSummary(result.error)}`,
    );
  }

  return result.data as EvaluationSuite;
}

export async function loadRunArtifact(filePath: string): Promise<RunArtifact> {
  const input = await readStructuredFile(filePath, "run artifact");
  const result = runArtifactSchema.safeParse(input);
  if (!result.success) {
    throw new ConfigurationError(`Invalid run artifact: ${validationSummary(result.error)}`);
  }
  return result.data as RunArtifact;
}
