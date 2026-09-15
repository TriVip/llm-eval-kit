import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { ArtifactError, redactRunArtifact, type RunArtifact } from "@llm-eval-kit/core";

export type RunArtifactWriteOptions = { retainRawResponses?: boolean };

export async function writeRunArtifact(
  artifact: RunArtifact,
  outputRoot: string,
  options: RunArtifactWriteOptions = {},
): Promise<string> {
  const runDirectory = join(outputRoot, artifact.metadata.runId);
  const artifactPath = join(runDirectory, "run.json");
  const temporaryPath = join(runDirectory, `.run.json.${randomUUID()}.tmp`);

  try {
    await mkdir(runDirectory, { recursive: true });
    const persistent = redactRunArtifact(artifact, options.retainRawResponses === true);
    await writeFile(temporaryPath, `${JSON.stringify(persistent, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    await rename(temporaryPath, artifactPath);
    return artifactPath;
  } catch {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw new ArtifactError(`Unable to write run artifact for: ${artifact.metadata.runId}`);
  }
}
