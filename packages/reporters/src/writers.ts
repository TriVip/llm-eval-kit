import { appendFile, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

import {
  ArtifactError,
  redactValue,
  type BaselineComparison,
  type RunArtifact,
} from "@llm-eval-kit/core";

import { renderHtmlReport } from "./html.js";

async function atomicWrite(path: string, content: string): Promise<void> {
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(temporaryPath, content, { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, path);
  } catch {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw new ArtifactError(`Unable to write report: ${path}`);
  }
}

export async function writeHtmlReport(
  artifact: RunArtifact,
  path: string,
  comparison?: BaselineComparison,
): Promise<string> {
  await atomicWrite(path, renderHtmlReport(artifact, comparison));
  return path;
}

export type StructuredLogEvent = {
  timestamp: string;
  level: "debug" | "info" | "warn" | "error";
  event: string;
  runId?: string;
  caseId?: string;
  attemptId?: string;
  providerId?: string;
  evaluatorId?: string;
  durationMs?: number;
  errorCode?: string;
  data?: unknown;
};

export async function appendStructuredLog(path: string, event: StructuredLogEvent): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(redactValue(event))}\n`, { encoding: "utf8" });
}
