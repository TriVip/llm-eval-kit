import { createHash } from "node:crypto";
import { lstat, readdir, realpath, stat } from "node:fs/promises";
import { basename, join, relative } from "node:path";

import type { ArtifactSummary } from "@llm-eval-kit/api-contracts";
import { loadRunArtifact } from "@llm-eval-kit/config";
import { redactRunArtifact, type RunArtifact } from "@llm-eval-kit/core";

import { canonicalRoot, isContained } from "./safe-path.js";

const maximumArtifactBytes = 10 * 1024 * 1024;

type IndexedArtifact = { summary: ArtifactSummary; artifact: RunArtifact };

async function discover(directory: string, root: string, results: string[]): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const requested = join(directory, entry.name);
    const canonical = await realpath(requested).catch(() => undefined);
    if (canonical === undefined || !isContained(root, canonical)) continue;
    const metadata = await lstat(requested);
    if (metadata.isSymbolicLink()) {
      const resolved = await stat(canonical);
      if (resolved.isDirectory()) await discover(canonical, root, results);
      else if (resolved.isFile() && basename(canonical) === "run.json") results.push(canonical);
    } else if (entry.isDirectory()) await discover(canonical, root, results);
    else if (entry.isFile() && entry.name === "run.json") results.push(canonical);
  }
}

function opaqueId(root: string, path: string, runId: string): string {
  return `artifact-${createHash("sha256")
    .update(`${relative(root, path)}\0${runId}`)
    .digest("hex")
    .slice(0, 20)}`;
}

export class ArtifactIndex {
  private constructor(
    private readonly artifacts: ReadonlyMap<string, IndexedArtifact>,
    public readonly reportRoot: string,
  ) {}

  static async create(reportRoot: string): Promise<ArtifactIndex> {
    const root = await canonicalRoot(reportRoot);
    const paths: string[] = [];
    await discover(root, root, paths);
    const artifacts = new Map<string, IndexedArtifact>();
    for (const path of paths.sort()) {
      if ((await stat(path)).size > maximumArtifactBytes) continue;
      const artifact = await loadRunArtifact(path).catch(() => undefined);
      if (artifact === undefined) continue;
      const id = opaqueId(root, path, artifact.metadata.runId);
      artifacts.set(id, {
        artifact: redactRunArtifact(artifact, false),
        summary: {
          id,
          runId: artifact.metadata.runId,
          ...(artifact.metadata.suiteId === undefined
            ? {}
            : { suiteId: artifact.metadata.suiteId }),
          status: artifact.status,
          startedAt: artifact.metadata.startedAt,
          ...(artifact.metadata.completedAt === undefined
            ? {}
            : { completedAt: artifact.metadata.completedAt }),
          selectedCases: artifact.metrics.selectedCases,
          passRate: artifact.metrics.passRate,
          errorRate: artifact.metrics.errorRate,
        },
      });
    }
    return new ArtifactIndex(artifacts, root);
  }

  list(): ArtifactSummary[] {
    return [...this.artifacts.values()]
      .map(({ summary }) => summary)
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  }

  get(id: string): IndexedArtifact | undefined {
    return this.artifacts.get(id);
  }
}
