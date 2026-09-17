import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { promoteBaseline } from "@llm-eval-kit/artifacts";
import type { RunArtifact } from "@llm-eval-kit/core";

import { canonicalRoot } from "./safe-path.js";

export class BaselinePromotionError extends Error {
  public constructor(
    public readonly code: "BASELINE_EXISTS" | "BASELINE_CHANGED" | "BASELINE_INELIGIBLE",
    message: string,
    public readonly currentHash?: string,
  ) {
    super(message);
  }
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export class BaselineStore {
  private constructor(public readonly root: string) {}

  static async create(requestedRoot: string): Promise<BaselineStore> {
    await mkdir(requestedRoot, { recursive: true });
    return new BaselineStore(await canonicalRoot(requestedRoot));
  }

  private path(projectId: string, suiteId: string): string {
    return join(this.root, projectId, `${suiteId}.json`);
  }

  async promote(input: {
    artifact: RunArtifact;
    projectId: string;
    suiteId: string;
    overwrite?: boolean;
    expectedCurrentHash?: string;
  }): Promise<string> {
    if (
      input.artifact.status === "OPERATIONAL_FAILED" ||
      input.artifact.termination !== undefined ||
      input.artifact.metadata.completedAt === undefined
    ) {
      throw new BaselinePromotionError(
        "BASELINE_INELIGIBLE",
        "Only complete, non-cancelled artifacts can be promoted.",
      );
    }
    if (input.artifact.metadata.suiteId !== input.suiteId) {
      throw new BaselinePromotionError(
        "BASELINE_INELIGIBLE",
        "The artifact suite does not match the baseline target.",
      );
    }

    const outputPath = this.path(input.projectId, input.suiteId);
    const current = await readFile(outputPath, "utf8").catch(() => undefined);
    const currentHash = current === undefined ? undefined : hash(current);
    if (current !== undefined && input.overwrite !== true) {
      throw new BaselinePromotionError(
        "BASELINE_EXISTS",
        "A baseline already exists for this project and suite.",
        currentHash,
      );
    }
    if (
      current !== undefined &&
      (input.expectedCurrentHash === undefined || input.expectedCurrentHash !== currentHash)
    ) {
      throw new BaselinePromotionError(
        "BASELINE_CHANGED",
        "The baseline changed after confirmation. Refresh before retrying.",
        currentHash,
      );
    }

    await promoteBaseline(input.artifact, outputPath, { overwrite: current !== undefined });
    return hash(await readFile(outputPath, "utf8"));
  }
}
