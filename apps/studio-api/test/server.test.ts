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

  it("accepts a same-origin session before routing an unimplemented mutation", async () => {
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
    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe("NOT_FOUND");
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
