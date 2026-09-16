import {
  artifactSummarySchema,
  projectDetailSchema,
  studioBootstrapResponseSchema,
  type ArtifactSummary,
  type ProjectDetail,
  type StudioBootstrapResponse,
} from "@llm-eval-kit/api-contracts";
import { z } from "zod";

async function request(path: string): Promise<unknown> {
  const response = await fetch(path, { credentials: "same-origin" });
  if (!response.ok) throw new Error(`Studio request failed (${response.status}).`);
  return response.json() as Promise<unknown>;
}

export async function getBootstrap(): Promise<StudioBootstrapResponse> {
  return studioBootstrapResponseSchema.parse(await request("/api/v1/bootstrap"));
}

export async function getProject(projectId: string): Promise<ProjectDetail> {
  return projectDetailSchema.parse(
    await request(`/api/v1/projects/${encodeURIComponent(projectId)}`),
  );
}

export async function getArtifacts(): Promise<ArtifactSummary[]> {
  return z.array(artifactSummarySchema).parse(await request("/api/v1/artifacts"));
}

export type ArtifactDetail = { summary: ArtifactSummary; artifact: unknown };

export async function getArtifact(artifactId: string): Promise<ArtifactDetail> {
  return z
    .object({ summary: artifactSummarySchema, artifact: z.unknown() })
    .strict()
    .parse(await request(`/api/v1/artifacts/${encodeURIComponent(artifactId)}`));
}
