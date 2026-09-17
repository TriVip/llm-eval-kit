import {
  artifactSummarySchema,
  projectDetailSchema,
  runAcceptedResponseSchema,
  runPlanResponseSchema,
  runSessionSnapshotSchema,
  safeRunEventSchema,
  studioBootstrapResponseSchema,
  validationResponseSchema,
  type ArtifactSummary,
  type ProjectDetail,
  type RunAcceptedResponse,
  type RunPlanResponse,
  type RunSessionSnapshot,
  type SafeRunEvent,
  type StudioBootstrapResponse,
  type StudioRunRequest,
  type ValidationResponse,
} from "@llm-eval-kit/api-contracts";
import { z } from "zod";

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, { credentials: "same-origin", ...init });
  if (!response.ok) throw new Error(`Studio request failed (${response.status}).`);
  return response.json() as Promise<unknown>;
}

async function mutate(path: string, input: StudioRunRequest, csrfToken: string): Promise<unknown> {
  return request(path, {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
    body: JSON.stringify(input),
  });
}

export async function getBootstrap(): Promise<StudioBootstrapResponse> {
  return studioBootstrapResponseSchema.parse(await request("/api/v1/bootstrap"));
}

export async function getProject(projectId: string): Promise<ProjectDetail> {
  return projectDetailSchema.parse(
    await request(`/api/v1/projects/${encodeURIComponent(projectId)}`),
  );
}

export async function validateRun(
  input: StudioRunRequest,
  csrfToken: string,
): Promise<ValidationResponse> {
  return validationResponseSchema.parse(
    await mutate(
      `/api/v1/projects/${encodeURIComponent(input.projectId)}/validate`,
      input,
      csrfToken,
    ),
  );
}

export async function planRun(
  input: StudioRunRequest,
  csrfToken: string,
): Promise<RunPlanResponse> {
  return runPlanResponseSchema.parse(await mutate("/api/v1/runs/plan", input, csrfToken));
}

export async function startRun(
  input: StudioRunRequest,
  csrfToken: string,
): Promise<RunAcceptedResponse> {
  return runAcceptedResponseSchema.parse(await mutate("/api/v1/runs", input, csrfToken));
}

export async function getRun(runId: string): Promise<RunSessionSnapshot> {
  return runSessionSnapshotSchema.parse(await request(`/api/v1/runs/${encodeURIComponent(runId)}`));
}

export function subscribeToRun(runId: string, onEvent: (event: SafeRunEvent) => void): () => void {
  const source = new EventSource(`/api/v1/runs/${encodeURIComponent(runId)}/events`);
  const eventTypes: SafeRunEvent["type"][] = [
    "run.created",
    "run.validated",
    "run.started",
    "case.started",
    "case.completed",
    "artifact.written",
    "run.completed",
    "run.failed",
    "snapshot.required",
  ];
  for (const type of eventTypes) {
    source.addEventListener(type, (event) => {
      onEvent(safeRunEventSchema.parse(JSON.parse((event as MessageEvent<string>).data)));
    });
  }
  return () => source.close();
}

export async function getArtifacts(): Promise<ArtifactSummary[]> {
  return z.array(artifactSummarySchema).parse(await request("/api/v1/artifacts"));
}

const evaluationSchema = z
  .object({
    evaluatorId: z.string(),
    verdict: z.enum(["PASS", "FAIL", "WARNING", "ERROR"]),
    score: z.number().optional(),
    confidence: z.number().optional(),
    reason: z.string(),
    evidence: z.unknown().optional(),
  })
  .passthrough();

const caseSchema = z
  .object({
    caseId: z.string(),
    category: z.string(),
    severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
    tags: z.array(z.string()).optional(),
    verdict: z.enum(["PASS", "FAIL", "WARNING", "ERROR"]),
    score: z.number().optional(),
    confidence: z.number().optional(),
    generation: z.object({ text: z.string() }).passthrough().optional(),
    evaluations: z.array(evaluationSchema),
    errorCode: z.string().optional(),
  })
  .passthrough();

const artifactDetailSchema = z
  .object({
    summary: artifactSummarySchema,
    artifact: z
      .object({
        status: z.enum(["PASSED", "QUALITY_FAILED", "OPERATIONAL_FAILED"]),
        metrics: z
          .object({
            selectedCases: z.number(),
            passedCases: z.number(),
            failedCases: z.number(),
            warningCases: z.number(),
            errorCases: z.number(),
            passRate: z.number(),
            errorRate: z.number(),
          })
          .passthrough(),
        gateFailures: z.array(
          z
            .object({ code: z.string(), reason: z.string(), affectedCaseIds: z.array(z.string()) })
            .passthrough(),
        ),
        cases: z.array(caseSchema),
      })
      .passthrough(),
  })
  .strict();

export type ArtifactDetail = z.infer<typeof artifactDetailSchema>;
export type ArtifactCase = ArtifactDetail["artifact"]["cases"][number];

export async function getArtifact(artifactId: string): Promise<ArtifactDetail> {
  return artifactDetailSchema.parse(
    await request(`/api/v1/artifacts/${encodeURIComponent(artifactId)}`),
  );
}
