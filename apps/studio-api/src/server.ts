import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";

import { STUDIO_API_VERSION } from "@llm-eval-kit/api-contracts";

import { ArtifactIndex } from "./artifact-index.js";
import { ProjectRegistry } from "./project-registry.js";

export type StudioServerOptions = {
  workspaceRoot: string;
  reportRoot: string;
  manifestPaths?: string[];
  origin?: string;
  allowedHosts?: string[];
  environment?: Readonly<Record<string, string | undefined>>;
};

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
) {
  return reply.code(status).type("application/problem+json").send({
    apiVersion: STUDIO_API_VERSION,
    type: "about:blank",
    title,
    status,
    code,
    detail,
    correlationId: request.id,
  });
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
  const artifacts = await ArtifactIndex.create(options.reportRoot);
  const server = Fastify({
    bodyLimit: 256 * 1024,
    requestIdHeader: false,
    genReqId: () => `request-${randomUUID()}`,
    logger: false,
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

  server.addHook("onSend", async (_request, reply, payload) => {
    reply
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "no-referrer")
      .header("X-Frame-Options", "DENY")
      .header(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'",
      );
    return payload;
  });

  server.setNotFoundHandler((request, reply) =>
    problem(reply, request, 404, "NOT_FOUND", "Not found", "The requested resource was not found."),
  );
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
  server.get("/api/v1/bootstrap", async (_request, reply) => {
    reply.header("Set-Cookie", `llmeval_session=${sessionId}; HttpOnly; SameSite=Strict; Path=/`);
    const projects = registry.list();
    return {
      apiVersion: STUDIO_API_VERSION,
      csrfToken,
      capabilities: { readArtifacts: true as const, runEvaluations: false },
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
  server.get("/api/v1/artifacts", async () => artifacts.list());
  server.get<{ Params: { artifactId: string } }>(
    "/api/v1/artifacts/:artifactId",
    async (request, reply) => {
      const item = artifacts.get(request.params.artifactId);
      return (
        item ??
        problem(reply, request, 404, "ARTIFACT_NOT_FOUND", "Not found", "Artifact was not found.")
      );
    },
  );
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
