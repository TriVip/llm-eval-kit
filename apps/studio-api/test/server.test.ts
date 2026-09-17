import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { studioBootstrapResponseSchema } from "@llm-eval-kit/api-contracts";

import { buildStudioServer } from "../src/index.js";

const servers: Awaited<ReturnType<typeof buildStudioServer>>[] = [];

async function server(environment: Readonly<Record<string, string | undefined>> = {}) {
  const reportRoot = join(tmpdir(), `studio-api-${crypto.randomUUID()}`);
  await mkdir(reportRoot, { recursive: true });
  const instance = await buildStudioServer({
    workspaceRoot: resolve("."),
    reportRoot,
    origin: "http://127.0.0.1:4317",
    allowedHosts: ["127.0.0.1:4317"],
    environment,
  });
  servers.push(instance);
  return instance;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((instance) => instance.close()));
});

describe("Studio API security and read endpoints", () => {
  it("uses secure loopback defaults and accepts both default loopback hosts", async () => {
    const reportRoot = join(tmpdir(), `studio-api-defaults-${crypto.randomUUID()}`);
    await mkdir(reportRoot, { recursive: true });
    const instance = await buildStudioServer({
      workspaceRoot: resolve("."),
      reportRoot,
    });
    servers.push(instance);

    const primary = await instance.inject({
      method: "GET",
      url: "/api/v1/projects",
      headers: { host: "127.0.0.1:4317" },
    });
    const localhost = await instance.inject({
      method: "HEAD",
      url: "/health",
      headers: { host: "localhost:4317" },
    });
    const missingHost = await instance.inject({ method: "GET", url: "/health" });

    expect(primary.statusCode).toBe(200);
    expect(primary.json()[0]?.id).toBe("ecommerce-support");
    expect(localhost.statusCode).toBe(200);
    expect(missingHost.statusCode).toBe(403);
    expect(missingHost.json().code).toBe("HOST_NOT_ALLOWED");
  });

  it("returns safe contract-valid bootstrap and project data", async () => {
    const instance = await server({ OPENAI_API_KEY: "canary-do-not-leak" });
    const response = await instance.inject({
      method: "GET",
      url: "/api/v1/bootstrap",
      headers: { host: "127.0.0.1:4317" },
    });
    expect(response.statusCode).toBe(200);
    expect(studioBootstrapResponseSchema.parse(response.json()).projects[0]?.id).toBe(
      "ecommerce-support",
    );
    expect(response.body).not.toContain("canary-do-not-leak");
    expect(response.body).not.toContain(resolve("."));
    expect(response.headers["set-cookie"]).toContain("HttpOnly");
    const project = await instance.inject({
      method: "GET",
      url: "/api/v1/projects/ecommerce-support",
      headers: { host: "127.0.0.1:4317" },
    });
    expect(project.statusCode).toBe(200);
    expect(project.json().suites[0].caseCount).toBe(64);
  });

  it.each([
    [{ host: "evil.example" }, "HOST_NOT_ALLOWED"],
    [{ host: "127.0.0.1:4317", origin: "https://evil.example" }, "ORIGIN_NOT_ALLOWED"],
  ])("rejects untrusted host/origin", async (headers, code) => {
    const response = await (await server()).inject({ method: "GET", url: "/health", headers });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe(code);
  });

  it("requires session and CSRF validation before any mutation route", async () => {
    const response = await (
      await server()
    ).inject({
      method: "POST",
      url: "/api/v1/runs",
      headers: { host: "127.0.0.1:4317", origin: "http://127.0.0.1:4317" },
      payload: {},
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe("CSRF_VALIDATION_FAILED");
  });

  it("validates mutation payloads only after a same-origin session", async () => {
    const instance = await server();
    const bootstrap = await instance.inject({
      method: "GET",
      url: "/api/v1/bootstrap",
      headers: { host: "127.0.0.1:4317" },
    });
    const cookie = bootstrap.headers["set-cookie"]?.split(";")[0];
    const response = await instance.inject({
      method: "POST",
      url: "/api/v1/runs",
      headers: {
        host: "127.0.0.1:4317",
        origin: "http://127.0.0.1:4317",
        cookie: cookie ?? "",
        "x-csrf-token": bootstrap.json().csrfToken,
      },
      payload: {},
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("INVALID_RUN_REQUEST");
  });

  it("returns typed validation, planning, and missing-run problems", async () => {
    const instance = await server();
    const bootstrap = await instance.inject({
      method: "GET",
      url: "/api/v1/bootstrap",
      headers: { host: "127.0.0.1:4317" },
    });
    const headers = {
      host: "127.0.0.1:4317",
      origin: "http://127.0.0.1:4317",
      cookie: bootstrap.headers["set-cookie"]?.split(";")[0] ?? "",
      "x-csrf-token": bootstrap.json().csrfToken as string,
    };
    const unknown = { projectId: "missing", targetId: "mock", suiteId: "main" };
    const mismatch = await instance.inject({
      method: "POST",
      url: "/api/v1/projects/ecommerce-support/validate",
      headers,
      payload: unknown,
    });
    const validation = await instance.inject({
      method: "POST",
      url: "/api/v1/projects/missing/validate",
      headers,
      payload: unknown,
    });
    const plan = await instance.inject({
      method: "POST",
      url: "/api/v1/runs/plan",
      headers,
      payload: unknown,
    });
    const run = await instance.inject({
      method: "GET",
      url: "/api/v1/runs/missing",
      headers: { host: "127.0.0.1:4317" },
    });
    const stream = await instance.inject({
      method: "GET",
      url: "/api/v1/runs/missing/events",
      headers: { host: "127.0.0.1:4317", "last-event-id": "invalid" },
    });
    expect(mismatch.json().code).toBe("PROJECT_ID_MISMATCH");
    expect(validation.json().code).toBe("RUN_VALIDATION_FAILED");
    expect(plan.json().code).toBe("RUN_PLAN_FAILED");
    expect(run.json().code).toBe("RUN_NOT_FOUND");
    expect(stream.json().code).toBe("RUN_NOT_FOUND");
  });

  it("completes the 64-case pass scenario and blocks a concurrent start", async () => {
    const instance = await server();
    const bootstrap = await instance.inject({
      method: "GET",
      url: "/api/v1/bootstrap",
      headers: { host: "127.0.0.1:4317" },
    });
    const headers = {
      host: "127.0.0.1:4317",
      origin: "http://127.0.0.1:4317",
      cookie: bootstrap.headers["set-cookie"]?.split(";")[0] ?? "",
      "x-csrf-token": bootstrap.json().csrfToken as string,
    };
    const payload = {
      projectId: "ecommerce-support",
      targetId: "mock",
      suiteId: "main",
      fixtureSetId: "passing",
    };
    const accepted = await instance.inject({
      method: "POST",
      url: "/api/v1/runs",
      headers,
      payload,
    });
    const conflict = await instance.inject({
      method: "POST",
      url: "/api/v1/runs",
      headers,
      payload,
    });
    expect(accepted.statusCode).toBe(202);
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().code).toBe("RUN_ALREADY_ACTIVE");
    const runId = accepted.json().runId as string;
    let snapshot: Record<string, unknown> = {};
    for (let attempt = 0; attempt < 100; attempt += 1) {
      snapshot = (
        await instance.inject({
          method: "GET",
          url: `/api/v1/runs/${runId}`,
          headers: { host: "127.0.0.1:4317" },
        })
      ).json();
      if (snapshot.state === "COMPLETED") break;
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    expect(snapshot).toMatchObject({ state: "COMPLETED", selectedCases: 64, completedCases: 64 });
  });

  it("validates, plans, runs, streams, and indexes the canonical mock scenario", async () => {
    const instance = await server();
    const bootstrap = await instance.inject({
      method: "GET",
      url: "/api/v1/bootstrap",
      headers: { host: "127.0.0.1:4317" },
    });
    const headers = {
      host: "127.0.0.1:4317",
      origin: "http://127.0.0.1:4317",
      cookie: bootstrap.headers["set-cookie"]?.split(";")[0] ?? "",
      "x-csrf-token": bootstrap.json().csrfToken as string,
    };
    const payload = {
      projectId: "ecommerce-support",
      targetId: "mock",
      suiteId: "main",
      fixtureSetId: "critical-regression",
      filters: { caseIds: ["REFUND_001"] },
    };

    const validation = await instance.inject({
      method: "POST",
      url: "/api/v1/projects/ecommerce-support/validate",
      headers,
      payload,
    });
    const plan = await instance.inject({
      method: "POST",
      url: "/api/v1/runs/plan",
      headers,
      payload,
    });
    const accepted = await instance.inject({
      method: "POST",
      url: "/api/v1/runs",
      headers,
      payload,
    });

    expect(validation.json()).toMatchObject({ valid: true, caseCount: 64 });
    expect(plan.json()).toMatchObject({ selectedCases: 1, maximumCalls: 1 });
    expect(accepted.statusCode).toBe(202);
    const runId = accepted.json().runId as string;
    let snapshot: Record<string, unknown> = {};
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const response = await instance.inject({
        method: "GET",
        url: `/api/v1/runs/${runId}`,
        headers: { host: "127.0.0.1:4317" },
      });
      snapshot = response.json();
      if (
        ["COMPLETED", "QUALITY_FAILED", "OPERATIONAL_FAILED", "INTERNAL_FAILED"].includes(
          String(snapshot.state),
        )
      )
        break;
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    expect(snapshot).toMatchObject({
      state: "QUALITY_FAILED",
      selectedCases: 1,
      completedCases: 1,
    });
    const eventStream = await instance.inject({
      method: "GET",
      url: `/api/v1/runs/${runId}/events`,
      headers: { host: "127.0.0.1:4317" },
    });
    expect(eventStream.headers["content-type"]).toContain("text/event-stream");
    expect(eventStream.body).toContain("event: run.completed");
    expect(eventStream.body).not.toContain("30 days");
    const artifact = await instance.inject({
      method: "GET",
      url: `/api/v1/artifacts/${String(snapshot.artifactId)}`,
      headers: { host: "127.0.0.1:4317" },
    });
    expect(artifact.json().artifact.status).toBe("QUALITY_FAILED");
    expect(artifact.json().artifact.cases[0].generation.text).toBe("[RAW_RESPONSE_NOT_RETAINED]");
    expect(artifact.body).toContain("forbidden-return-window");
  });

  it("serves health, artifact index, and missing-project states", async () => {
    const instance = await server();
    const headers = { host: "127.0.0.1:4317" };
    expect((await instance.inject({ method: "GET", url: "/health", headers })).json()).toEqual({
      status: "ok",
    });
    expect(
      (await instance.inject({ method: "GET", url: "/api/v1/artifacts", headers })).json(),
    ).toEqual([]);
    const missing = await instance.inject({
      method: "GET",
      url: "/api/v1/projects/missing",
      headers,
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().code).toBe("PROJECT_NOT_FOUND");
  });

  it("returns safe recoverable not-found problems", async () => {
    const response = await (
      await server()
    ).inject({
      method: "GET",
      url: "/api/v1/artifacts/missing",
      headers: { host: "127.0.0.1:4317" },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "ARTIFACT_NOT_FOUND", status: 404 });
  });
});
