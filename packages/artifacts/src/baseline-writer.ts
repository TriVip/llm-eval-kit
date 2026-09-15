import { constants } from "node:fs";
import { access, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

import { ArtifactError, type RunArtifact } from "@llm-eval-kit/core";

export type PromoteBaselineOptions = {
  overwrite?: boolean;
};

export async function promoteBaseline(
  artifact: RunArtifact,
  outputPath: string,
  options: PromoteBaselineOptions = {},
): Promise<string> {
  if (options.overwrite !== true) {
    try {
      await access(outputPath, constants.F_OK);
      throw new ArtifactError(
        `Baseline already exists: ${outputPath}. Use --overwrite explicitly.`,
      );
    } catch (error) {
      if (error instanceof ArtifactError) throw error;
    }
  }

  const temporaryPath = `${outputPath}.${randomUUID()}.tmp`;
  try {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(temporaryPath, `${JSON.stringify(artifact, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    await rename(temporaryPath, outputPath);
    return outputPath;
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    if (error instanceof ArtifactError) throw error;
    throw new ArtifactError(`Unable to promote baseline to: ${outputPath}`);
  }
}
