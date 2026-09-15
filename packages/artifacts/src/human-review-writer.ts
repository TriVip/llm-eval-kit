import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { ArtifactError, type HumanReviewQueue, type RunArtifact } from "@llm-eval-kit/core";

export function buildHumanReviewQueue(
  artifact: RunArtifact,
  createdAt = new Date().toISOString(),
): HumanReviewQueue {
  return {
    schemaVersion: "1.0",
    runId: artifact.metadata.runId,
    createdAt,
    items: artifact.cases
      .filter(
        (result) =>
          result.verdict === "WARNING" &&
          result.evaluations.some((evaluation) => evaluation.kind === "MODEL_BASED"),
      )
      .map((result) => ({
        caseId: result.caseId,
        category: result.category,
        severity: result.severity,
        verdict: result.verdict,
        ...(result.score === undefined ? {} : { score: result.score }),
        ...(result.confidence === undefined ? {} : { confidence: result.confidence }),
        reasons: result.evaluations
          .filter((evaluation) => evaluation.kind === "MODEL_BASED")
          .map(({ reason }) => reason),
      })),
  };
}

export async function writeHumanReviewQueue(
  artifact: RunArtifact,
  outputRoot: string,
): Promise<string> {
  const runDirectory = join(outputRoot, artifact.metadata.runId);
  const outputPath = join(runDirectory, "human-review.json");
  const temporaryPath = join(runDirectory, `.human-review.json.${randomUUID()}.tmp`);
  const queue = buildHumanReviewQueue(artifact);

  try {
    await mkdir(runDirectory, { recursive: true });
    await writeFile(temporaryPath, `${JSON.stringify(queue, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    await rename(temporaryPath, outputPath);
    return outputPath;
  } catch {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw new ArtifactError(`Unable to write human-review queue for: ${artifact.metadata.runId}`);
  }
}
