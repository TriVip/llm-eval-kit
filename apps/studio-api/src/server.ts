import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";

import {
  baselinePromotionRequestSchema,
  comparisonRequestSchema,
  promptCreateRequestSchema,
  promptDraftCreateRequestSchema,
  promptDraftSaveRequestSchema,
  promptPublishRequestSchema,
  PROMPTOPS_API_VERSION,
  STUDIO_API_VERSION,
  studioRunRequestSchema,
  type SafeRunEvent,
  type StudioRunRequest,
} from "@llm-eval-kit/api-contracts";
import { buildHumanReviewQueue, writeRunArtifact } from "@llm-eval-kit/artifacts";
import { ConfigurationError } from "@llm-eval-kit/core";
import { PromptOpsError } from "@llm-eval-kit/promptops";
import { openPromptOpsStore } from "@llm-eval-kit/promptops-sqlite";
import { createEvaluationApplication, createPromptApplication } from "@llm-eval-kit/sdk";

import { ArtifactIndex } from "./artifact-index.js";
import { BaselinePromotionError, BaselineStore } from "./baseline-store.js";
import { ProjectRegistry } from "./project-registry.js";
import { RunRegistry } from "./run-registry.js";
import { canonicalRoot, containedFile } from "./safe-path.js";

export type StudioServerOptions = {
  workspaceRoot: string;
  reportRoot: string;
  baselineRoot?: string;
  manifestPaths?: string[];
  origin?: string;
  allowedHosts?: string[];
  environment?: Readonly<Record<string, string | undefined>>;
  productionAssetsRoot?: string;
  promptDatabasePath?: string;
};

const productionAssetExtensions = new Set([".css", ".js", ".map", ".svg", ".png", ".ico"]);

function productionContentType(path: string): string {
  const extension = extname(path);
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".js") return "text/javascript; charset=utf-8";
  if (extension === ".map") return "application/json; charset=utf-8";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".png") return "image/png";
  if (extension === ".ico") return "image/x-icon";
  return "application/octet-stream";
}

function cookieValue(header: string | undefined, name: string): string | undefined {
  return header
    ?.split(";")
    .map((item) => item.trim().split("="))
    .find(([key]) => key === name)?.[1];
}

function problem(
  reply: FastifyReply,
  request: FastifyRequest,
  status: number,
  code: string,
  title: string,
  detail: string,
  fieldErrors?: Array<{ path: string; message: string; code?: string }>,
  currentHash?: string,
) {
  return reply
    .code(status)
    .type("application/problem+json")
    .send({
      apiVersion: STUDIO_API_VERSION,
      type: "about:blank",
      title,
      status,
      code,
      detail,
      correlationId: request.id,
      ...(fieldErrors === undefined ? {} : { fieldErrors }),
      ...(currentHash === undefined ? {} : { currentHash }),
    });
}

function promptProblem(reply: FastifyReply, request: FastifyRequest, error: unknown) {
  if (!(error instanceof PromptOpsError)) {
    return problem(
      reply,
      request,
      500,
      "PROMPT_OPERATION_FAILED",
      "Prompt operation failed",
      "The prompt operation could not be completed.",
    );
  }
  const conflictCodes = new Set([
    "PROMPT_ALREADY_EXISTS",
    "PROMPT_CONTENT_ALREADY_PUBLISHED",
    "DRAFT_REVISION_CONFLICT",
  ]);
  const notFoundCodes = new Set(["PROMPT_NOT_FOUND", "PROMPT_DRAFT_NOT_FOUND"]);
  const unavailableCodes = new Set(["DATABASE_BUSY", "DATABASE_CORRUPT", "MIGRATION_FAILED"]);
  const status = conflictCodes.has(error.code)
    ? 409
    : notFoundCodes.has(error.code)
      ? 404
      : unavailableCodes.has(error.code)
        ? 503
        : 400;
  return problem(
    reply,
    request,
    status,
    error.code,
    status === 409 ? "Prompt conflict" : status === 404 ? "Prompt not found" : "Invalid prompt",
    error.safeMessage,
    error.fieldErrors.map(({ path, code, message }) => ({ path, code, message })),
  );
}

function parseRunRequest(
  input: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
): StudioRunRequest | undefined {
  const parsed = studioRunRequestSchema.safeParse(input);
  if (parsed.success) return parsed.data;
  void problem(
    reply,
    request,
    400,
    "INVALID_RUN_REQUEST",
    "Invalid run request",
    "Review the selected project resources and filters.",
    parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
  );
  return undefined;
}

function encodeSse(event: SafeRunEvent): string {
  return `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export async function buildStudioServer(options: StudioServerOptions): Promise<FastifyInstance> {
  await mkdir(options.reportRoot, { recursive: true });
  const origin = options.origin ?? "http://127.0.0.1:4317";
  const originUrl = new URL(origin);
  const allowedHosts = new Set(
    options.allowedHosts ?? [originUrl.host, `localhost:${originUrl.port || "80"}`],
  );
  const sessionId = randomUUID();
  const csrfToken = randomUUID();
  const registry = await ProjectRegistry.create({
    workspaceRoot: options.workspaceRoot,
    manifestPaths: options.manifestPaths ?? [
      resolve(options.workspaceRoot, "examples/ecommerce-support/studio.project.json"),
    ],
    ...(options.environment === undefined ? {} : { environment: options.environment }),
  });
  const productionAssetsRoot =
    options.productionAssetsRoot === undefined
      ? undefined
      : await canonicalRoot(options.productionAssetsRoot);
  let artifacts = await ArtifactIndex.create(options.reportRoot);
  const baselines = await BaselineStore.create(
    options.baselineRoot ?? resolve(options.reportRoot, "baselines"),
  );
  const runs = new RunRegistry();
  const application = createEvaluationApplication();
  const promptStore = openPromptOpsStore({
    workspaceRoot: options.workspaceRoot,
    ...(options.promptDatabasePath === undefined
      ? {}
      : { databasePath: options.promptDatabasePath }),
  });
  const promptApplication = createPromptApplication(promptStore);
  const server = Fastify({
    bodyLimit: 256 * 1024,
    requestIdHeader: false,
    genReqId: () => `request-${randomUUID()}`,
    logger: false,
  });
  server.addHook("onClose", () => {
    promptStore.close();
  });

  server.addHook("onRequest", async (request, reply) => {
    const host = request.headers.host;
    if (host === undefined || !allowedHosts.has(host)) {
      return problem(
        reply,
        request,
        403,
        "HOST_NOT_ALLOWED",
        "Request rejected",
        "Host is not allowed.",
      );
    }
    const requestOrigin = request.headers.origin;
    if (requestOrigin !== undefined && requestOrigin !== origin) {
      return problem(
        reply,
        request,
        403,
        "ORIGIN_NOT_ALLOWED",
        "Request rejected",
        "Origin is not allowed.",
      );
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      const session = cookieValue(request.headers.cookie, "llmeval_session");
      if (session !== sessionId || request.headers["x-csrf-token"] !== csrfToken) {
        return problem(
          reply,
          request,
          403,
          "CSRF_VALIDATION_FAILED",
          "Request rejected",
          "Session or CSRF validation failed.",
        );
      }
    }
  });

  server.addHook("onSend", async (request, reply, payload) => {
    reply
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "no-referrer")
      .header("X-Frame-Options", "DENY")
      .header("Cross-Origin-Resource-Policy", "same-origin")
      .header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
      .header(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'",
      );
    if (request.url.startsWith("/api/")) reply.header("Cache-Control", "no-store");
    return payload;
  });

  server.setNotFoundHandler(async (request, reply) => {
    if (
      productionAssetsRoot !== undefined &&
      request.method === "GET" &&
      !request.url.startsWith("/api/") &&
      !request.url.startsWith("/assets/") &&
      request.headers.accept?.includes("text/html") === true
    ) {
      const indexPath = await containedFile(
        productionAssetsRoot,
        join(productionAssetsRoot, "index.html"),
        new Set([".html"]),
      );
      return reply.type("text/html; charset=utf-8").send(await readFile(indexPath, "utf8"));
    }
    return problem(
      reply,
      request,
      404,
      "NOT_FOUND",
      "Not found",
      "The requested resource was not found.",
    );
  });
  server.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error, requestId: request.id }, "Studio request failed");
    return problem(
      reply,
      request,
      500,
      "INTERNAL_ERROR",
      "Internal error",
      "The Studio could not complete this request.",
    );
  });

  server.get("/health", async () => ({ status: "ok" }));
  server.get<{ Params: { file: string } }>("/assets/:file", async (request, reply) => {
    if (productionAssetsRoot === undefined || !/^[A-Za-z0-9._-]+$/.test(request.params.file)) {
      return problem(
        reply,
        request,
        404,
        "ASSET_NOT_FOUND",
        "Not found",
        "The requested production asset was not found.",
      );
    }
    try {
      const path = await containedFile(
        productionAssetsRoot,
        join(productionAssetsRoot, "assets", request.params.file),
        productionAssetExtensions,
      );
      return reply.type(productionContentType(path)).send(await readFile(path));
    } catch {
      return problem(
        reply,
        request,
        404,
        "ASSET_NOT_FOUND",
        "Not found",
        "The requested production asset was not found.",
      );
    }
  });
  server.get("/api/v1/bootstrap", async (_request, reply) => {
    reply.header("Set-Cookie", `llmeval_session=${sessionId}; HttpOnly; SameSite=Strict; Path=/`);
    const projects = registry.list();
    return {
      apiVersion: STUDIO_API_VERSION,
      csrfToken,
      capabilities: { readArtifacts: true as const, runEvaluations: true },
      projects: projects.map((project) => ({
        id: project.id,
        name: project.name,
        targets: project.targets.map(({ id }) => ({ id, name: id })),
        suites: project.suites.map(({ id, name }) => ({ id, name })),
        scenarios: project.scenarios.map(({ id, name }) => ({ id, name })),
      })),
      artifacts: artifacts.list(),
    };
  });
  server.get("/api/v1/projects", async () =>
    registry.list().map((project) => ({
      id: project.id,
      name: project.name,
      targets: project.targets.map(({ id }) => ({ id, name: id })),
      suites: project.suites.map(({ id, name }) => ({ id, name })),
      scenarios: project.scenarios.map(({ id, name }) => ({ id, name })),
    })),
  );
  server.get<{ Querystring: { limit?: string; cursor?: string } }>(
    "/api/v1/prompts",
    async (request, reply) => {
      try {
        const limit = request.query.limit === undefined ? 50 : Number(request.query.limit);
        if (!Number.isInteger(limit)) {
          throw new PromptOpsError("PROMPT_TEMPLATE_INVALID", "Page limit is invalid.");
        }
        const page = await promptApplication.list({
          limit,
          ...(request.query.cursor === undefined ? {} : { cursor: request.query.cursor }),
        });
        return { apiVersion: PROMPTOPS_API_VERSION, ...page };
      } catch (error) {
        return promptProblem(reply, request, error);
      }
    },
  );
  server.post<{ Body: unknown }>("/api/v1/prompts", async (request, reply) => {
    const parsed = promptCreateRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return problem(
        reply,
        request,
        400,
        "PROMPT_TEMPLATE_INVALID",
        "Invalid prompt",
        "Review the prompt fields and template.",
        parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          code: "PROMPT_TEMPLATE_INVALID",
          message: issue.message,
        })),
      );
    }
    try {
      const created = await promptApplication.create({
        promptId: parsed.data.promptId,
        displayName: parsed.data.displayName,
        template: {
          schemaVersion: parsed.data.template.schemaVersion,
          user: parsed.data.template.user,
          declaredVariables: parsed.data.template.declaredVariables,
          ...(parsed.data.template.system === undefined
            ? {}
            : { system: parsed.data.template.system }),
        },
        ...(parsed.data.note === undefined ? {} : { note: parsed.data.note }),
      });
      return reply.code(201).send({ apiVersion: PROMPTOPS_API_VERSION, ...created });
    } catch (error) {
      return promptProblem(reply, request, error);
    }
  });
  server.get<{ Params: { promptId: string } }>(
    "/api/v1/prompts/:promptId",
    async (request, reply) => {
      try {
        return {
          apiVersion: PROMPTOPS_API_VERSION,
          ...(await promptApplication.show(request.params.promptId)),
        };
      } catch (error) {
        return promptProblem(reply, request, error);
      }
    },
  );
  server.post<{ Params: { promptId: string }; Body: unknown }>(
    "/api/v1/prompts/:promptId/drafts",
    async (request, reply) => {
      const parsed = promptDraftCreateRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return problem(
          reply,
          request,
          400,
          "PROMPT_TEMPLATE_INVALID",
          "Invalid prompt draft",
          "Review the draft request.",
        );
      }
      try {
        return reply.code(201).send({
          apiVersion: PROMPTOPS_API_VERSION,
          ...(await promptApplication.createDraft(
            request.params.promptId,
            parsed.data.parentVersion,
          )),
        });
      } catch (error) {
        return promptProblem(reply, request, error);
      }
    },
  );
  server.put<{ Params: { draftId: string }; Body: unknown }>(
    "/api/v1/prompt-drafts/:draftId",
    async (request, reply) => {
      const parsed = promptDraftSaveRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return problem(
          reply,
          request,
          400,
          "PROMPT_TEMPLATE_INVALID",
          "Invalid prompt draft",
          "Review the draft fields and expected revision.",
        );
      }
      try {
        return {
          apiVersion: PROMPTOPS_API_VERSION,
          ...(await promptApplication.saveDraft({
            draftId: request.params.draftId,
            expectedRevision: parsed.data.expectedRevision,
            template: {
              schemaVersion: parsed.data.template.schemaVersion,
              user: parsed.data.template.user,
              declaredVariables: parsed.data.template.declaredVariables,
              ...(parsed.data.template.system === undefined
                ? {}
                : { system: parsed.data.template.system }),
            },
            ...(parsed.data.note === undefined ? {} : { note: parsed.data.note }),
          })),
        };
      } catch (error) {
        return promptProblem(reply, request, error);
      }
    },
  );
  server.post<{ Params: { draftId: string }; Body: unknown }>(
    "/api/v1/prompt-drafts/:draftId/publish",
    async (request, reply) => {
      const parsed = promptPublishRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return problem(
          reply,
          request,
          400,
          "PROMPT_TEMPLATE_INVALID",
          "Invalid publish request",
          "Expected revision is required.",
        );
      }
      try {
        return reply.code(201).send({
          apiVersion: PROMPTOPS_API_VERSION,
          ...(await promptApplication.publish(
            request.params.draftId,
            parsed.data.expectedRevision,
          )),
        });
      } catch (error) {
        return promptProblem(reply, request, error);
      }
    },
  );
  server.get<{ Params: { projectId: string } }>(
    "/api/v1/projects/:projectId",
    async (request, reply) => {
      const project = registry.get(request.params.projectId);
      return (
        project ??
        problem(reply, request, 404, "PROJECT_NOT_FOUND", "Not found", "Project was not found.")
      );
    },
  );
  server.post<{ Params: { projectId: string }; Body: unknown }>(
    "/api/v1/projects/:projectId/validate",
    async (request, reply) => {
      const input = parseRunRequest(request.body, request, reply);
      if (input === undefined) return reply;
      if (input.projectId !== request.params.projectId) {
        return problem(
          reply,
          request,
          400,
          "PROJECT_ID_MISMATCH",
          "Invalid project",
          "Path and request project IDs must match.",
        );
      }
      try {
        const resolved = registry.resolve(input);
        return {
          apiVersion: STUDIO_API_VERSION,
          valid: true as const,
          ...application.validate(resolved.config, resolved.suite),
        };
      } catch (error) {
        return problem(
          reply,
          request,
          400,
          "RUN_VALIDATION_FAILED",
          "Validation failed",
          error instanceof ConfigurationError ? error.safeMessage : "The run selection is invalid.",
        );
      }
    },
  );
  server.post<{ Body: unknown }>("/api/v1/runs/plan", async (request, reply) => {
    const input = parseRunRequest(request.body, request, reply);
    if (input === undefined) return reply;
    try {
      const resolved = registry.resolve(input);
      return {
        apiVersion: STUDIO_API_VERSION,
        ...application.plan(resolved.config, resolved.suite, resolved.filters),
      };
    } catch (error) {
      return problem(
        reply,
        request,
        400,
        "RUN_PLAN_FAILED",
        "Run plan failed",
        error instanceof ConfigurationError ? error.safeMessage : "The run could not be planned.",
      );
    }
  });
  server.post<{ Body: unknown }>("/api/v1/runs", async (request, reply) => {
    const input = parseRunRequest(request.body, request, reply);
    if (input === undefined) return reply;
    let resolved;
    try {
      resolved = registry.resolve(input);
      application.validate(resolved.config, resolved.suite);
    } catch (error) {
      return problem(
        reply,
        request,
        400,
        "RUN_VALIDATION_FAILED",
        "Validation failed",
        error instanceof ConfigurationError ? error.safeMessage : "The run selection is invalid.",
      );
    }
    const plan = application.plan(resolved.config, resolved.suite, resolved.filters);
    const runId = `studio_${randomUUID()}`;
    try {
      runs.create(runId, input, plan.selectedCases);
    } catch {
      return problem(
        reply,
        request,
        409,
        "RUN_ALREADY_ACTIVE",
        "Run already active",
        "Wait for the active local run to finish.",
      );
    }
    runs.validating(runId);
    runs.validated(runId);
    void application
      .run(
        {
          config: resolved.config,
          suite: resolved.suite,
          schemaRoot: resolved.schemaRoot,
          ...(resolved.filters === undefined ? {} : { filters: resolved.filters }),
          ...(resolved.targetFixtures === undefined
            ? {}
            : { targetFixtures: resolved.targetFixtures }),
        },
        {
          runId,
          signal: runs.signal(runId),
          onEvent: (event) => runs.observe(runId, event),
        },
      )
      .then(async (artifact) => {
        await writeRunArtifact(artifact, options.reportRoot);
        artifacts = await ArtifactIndex.create(options.reportRoot);
        const artifactId = artifacts.list().find(({ runId: id }) => id === runId)?.id;
        if (artifactId === undefined) throw new Error("ARTIFACT_INDEX_FAILED");
        runs.complete(runId, artifact, artifactId);
      })
      .catch(() => runs.fail(runId));
    return reply
      .code(202)
      .send({ apiVersion: STUDIO_API_VERSION, runId, status: "ACCEPTED" as const });
  });
  server.get<{ Params: { runId: string } }>("/api/v1/runs/:runId", async (request, reply) => {
    const snapshot = runs.get(request.params.runId);
    return (
      snapshot ??
      problem(
        reply,
        request,
        404,
        "RUN_NOT_FOUND",
        "Run not found",
        "The run session does not exist.",
      )
    );
  });
  server.post<{ Params: { runId: string } }>(
    "/api/v1/runs/:runId/cancel",
    async (request, reply) => {
      try {
        return runs.cancel(request.params.runId);
      } catch {
        return problem(
          reply,
          request,
          404,
          "RUN_NOT_FOUND",
          "Run not found",
          "The run session does not exist.",
        );
      }
    },
  );
  server.get<{ Params: { runId: string } }>(
    "/api/v1/runs/:runId/events",
    async (request, reply) => {
      const lastHeader = request.headers["last-event-id"];
      const afterId =
        typeof lastHeader === "string" && /^\d+$/.test(lastHeader) ? Number(lastHeader) : 0;
      const replay = runs.replay(request.params.runId, afterId);
      if (replay === undefined) {
        return problem(
          reply,
          request,
          404,
          "RUN_NOT_FOUND",
          "Run not found",
          "The run session does not exist.",
        );
      }
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      if (replay.gap) {
        const snapshot = runs.get(request.params.runId)!;
        const event: SafeRunEvent = {
          apiVersion: STUDIO_API_VERSION,
          id: replay.events[0]?.id ?? afterId + 1,
          runId: request.params.runId,
          timestamp: new Date().toISOString(),
          type: "snapshot.required",
          progress: {
            selected: snapshot.selectedCases,
            running: 0,
            completed: snapshot.completedCases,
            passed: 0,
            failed: 0,
            warning: 0,
            errors: 0,
          },
        };
        reply.raw.write(encodeSse(event));
      } else {
        replay.events.forEach((event) => reply.raw.write(encodeSse(event)));
      }
      if (runs.isTerminal(request.params.runId)) {
        reply.raw.end();
        return reply;
      }
      const unsubscribe = runs.subscribe(request.params.runId, (event) => {
        reply.raw.write(encodeSse(event));
        if (["run.completed", "run.failed"].includes(event.type)) {
          unsubscribe?.();
          reply.raw.end();
        }
      });
      request.raw.once("close", () => unsubscribe?.());
      reply.hijack();
      return reply;
    },
  );
  server.get("/api/v1/artifacts", async () => artifacts.list());
  server.get("/api/v1/review-items", async () => artifacts.reviewItems());
  server.get<{ Params: { artifactId: string } }>(
    "/api/v1/artifacts/:artifactId",
    async (request, reply) => {
      const item = artifacts.get(request.params.artifactId);
      if (item === undefined) {
        return problem(
          reply,
          request,
          404,
          "ARTIFACT_NOT_FOUND",
          "Not found",
          "Artifact was not found.",
        );
      }
      const files = ["run-json", "human-review"];
      if ((await artifacts.file(item.summary.id, "html-report")) !== undefined)
        files.push("html-report");
      if ((await artifacts.file(item.summary.id, "redacted-logs")) !== undefined)
        files.push("redacted-logs");
      return { ...item, files };
    },
  );
  server.get<{ Params: { artifactId: string; kind: string } }>(
    "/api/v1/artifacts/:artifactId/files/:kind",
    async (request, reply) => {
      const item = artifacts.get(request.params.artifactId);
      if (item === undefined) {
        return problem(
          reply,
          request,
          404,
          "ARTIFACT_NOT_FOUND",
          "Not found",
          "Artifact was not found.",
        );
      }
      const kind = request.params.kind;
      if (kind === "html-report" || kind === "redacted-logs") {
        const file = await artifacts.file(item.summary.id, kind);
        if (file === undefined) {
          return problem(
            reply,
            request,
            404,
            "ARTIFACT_FILE_NOT_FOUND",
            "Not found",
            "The requested allowlisted artifact file is unavailable.",
          );
        }
        const html = kind === "html-report";
        return reply
          .type(html ? "text/html; charset=utf-8" : "application/x-ndjson; charset=utf-8")
          .header(
            "Content-Disposition",
            `${html ? "inline" : "attachment"}; filename="${html ? "report.html" : "logs.ndjson"}"`,
          )
          .send(await readFile(file, "utf8"));
      }
      const payload =
        kind === "run-json"
          ? item.artifact
          : kind === "human-review"
            ? buildHumanReviewQueue(item.artifact)
            : undefined;
      if (payload === undefined) {
        return problem(
          reply,
          request,
          404,
          "ARTIFACT_FILE_NOT_FOUND",
          "Not found",
          "The requested allowlisted artifact file is unavailable.",
        );
      }
      const filename = kind === "run-json" ? "run.json" : "human-review.json";
      return reply
        .type("application/json; charset=utf-8")
        .header("Content-Disposition", `attachment; filename="${filename}"`)
        .send(`${JSON.stringify(payload, null, 2)}\n`);
    },
  );
  server.post<{ Body: unknown }>("/api/v1/comparisons", async (request, reply) => {
    const parsed = comparisonRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return problem(
        reply,
        request,
        400,
        "INVALID_COMPARISON_REQUEST",
        "Invalid comparison request",
        "Select a registered candidate and baseline artifact.",
      );
    }
    const candidate = artifacts.get(parsed.data.candidateArtifactId);
    const baseline = artifacts.get(parsed.data.baselineArtifactId);
    if (candidate === undefined || baseline === undefined) {
      return problem(
        reply,
        request,
        404,
        "ARTIFACT_NOT_FOUND",
        "Not found",
        "One or more comparison artifacts were not found.",
      );
    }
    try {
      return {
        apiVersion: STUDIO_API_VERSION,
        comparison: application.compare({
          candidate: candidate.artifact,
          baseline: baseline.artifact,
        }),
      };
    } catch (error) {
      return problem(
        reply,
        request,
        409,
        "ARTIFACTS_INCOMPATIBLE",
        "Artifacts are incompatible",
        error instanceof ConfigurationError
          ? error.safeMessage
          : "The selected artifacts cannot be compared.",
      );
    }
  });
  server.post<{ Body: unknown }>("/api/v1/baselines", async (request, reply) => {
    const parsed = baselinePromotionRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return problem(
        reply,
        request,
        400,
        "INVALID_BASELINE_REQUEST",
        "Invalid baseline request",
        "Select a registered artifact and baseline target.",
      );
    }
    const item = artifacts.get(parsed.data.artifactId);
    const project = registry.get(parsed.data.projectId);
    if (item === undefined || project === undefined) {
      return problem(
        reply,
        request,
        404,
        "BASELINE_TARGET_NOT_FOUND",
        "Not found",
        "The artifact or registered baseline target was not found.",
      );
    }
    try {
      const baselineHash = await baselines.promote({
        artifact: item.artifact,
        projectId: parsed.data.projectId,
        suiteId: parsed.data.suiteId,
        ...(parsed.data.overwrite === undefined ? {} : { overwrite: parsed.data.overwrite }),
        ...(parsed.data.expectedCurrentHash === undefined
          ? {}
          : { expectedCurrentHash: parsed.data.expectedCurrentHash }),
      });
      return {
        apiVersion: STUDIO_API_VERSION,
        projectId: parsed.data.projectId,
        suiteId: parsed.data.suiteId,
        artifactId: parsed.data.artifactId,
        baselineHash,
        status: "PROMOTED" as const,
      };
    } catch (error) {
      if (error instanceof BaselinePromotionError) {
        return problem(
          reply,
          request,
          error.code === "BASELINE_INELIGIBLE" ? 422 : 409,
          error.code,
          "Baseline was not promoted",
          error.message,
          undefined,
          error.currentHash,
        );
      }
      throw error;
    }
  });
  return server;
}

export async function startStudioServer(
  options: StudioServerOptions & { port?: number },
): Promise<{ server: FastifyInstance; url: string }> {
  const server = await buildStudioServer(options);
  const port = options.port ?? 4317;
  await server.listen({ host: "127.0.0.1", port });
  return { server, url: `http://127.0.0.1:${port}` };
}
