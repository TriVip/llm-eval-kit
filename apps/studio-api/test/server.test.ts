import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { studioBootstrapResponseSchema } from "@llm-eval-kit/api-contracts";

import { buildStudioServer } from "../src/index.js";

const servers: Awaited<ReturnType<typeof buildStudioServer>>[] = [];

async function server(
  environment: Readonly<Record<string, string | undefined>> = {},
  requestedReportRoot?: string,
) {
  const reportRoot = requestedReportRoot ?? join(tmpdir(), `studio-api-${crypto.randomUUID()}`);
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
  it("serves bounded production assets and SPA routes from one loopback origin", async () => {
    const reportRoot = join(tmpdir(), `studio-api-production-${crypto.randomUUID()}`);
    const assetsRoot = join(tmpdir(), `studio-assets-${crypto.randomUUID()}`);
    await mkdir(join(assetsRoot, "assets"), { recursive: true });
    await mkdir(reportRoot, { recursive: true });
    await writeFile(
      join(assetsRoot, "index.html"),
      "<!doctype html><main>Studio production</main>",
    );
    await writeFile(join(assetsRoot, "assets", "index-safe.js"), "globalThis.__studio=true;\n");
    await writeFile(join(assetsRoot, "assets", "index-safe.css"), "body{color:CanvasText}\n");
    const instance = await buildStudioServer({
      workspaceRoot: resolve("."),
      reportRoot,
      productionAssetsRoot: assetsRoot,
      origin: "http://127.0.0.1:4317",
      allowedHosts: ["127.0.0.1:4317"],
    });
    servers.push(instance);
    const headers = { host: "127.0.0.1:4317", accept: "text/html" };
    const index = await instance.inject({ method: "GET", url: "/", headers });
    const route = await instance.inject({ method: "GET", url: "/compare", headers });
    const asset = await instance.inject({
      method: "GET",
      url: "/assets/index-safe.js",
      headers: { host: "127.0.0.1:4317" },
    });
    const stylesheet = await instance.inject({
      method: "GET",
      url: "/assets/index-safe.css",
      headers: { host: "127.0.0.1:4317" },
    });
    const missingAsset = await instance.inject({
      method: "GET",
      url: "/assets/missing.js",
      headers: { host: "127.0.0.1:4317" },
    });
    const missingApi = await instance.inject({
      method: "GET",
      url: "/api/v1/missing",
      headers,
    });
    const nonHtmlRoute = await instance.inject({
      method: "GET",
      url: "/compare",
      headers: { host: "127.0.0.1:4317", accept: "application/json" },
    });
    const invalidAssetName = await instance.inject({
      method: "GET",
      url: "/assets/unsafe%24name.js",
      headers: { host: "127.0.0.1:4317" },
    });
    expect(index.body).toContain("Studio production");
    expect(route.body).toBe(index.body);
    expect(index.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(index.headers["permissions-policy"]).toContain("camera=()");
    expect(index.headers["cross-origin-resource-policy"]).toBe("same-origin");
    expect(asset.headers["content-type"]).toContain("text/javascript");
    expect(asset.body).toContain("__studio");
    expect(stylesheet.headers["content-type"]).toContain("text/css");
    expect(missingAsset.json().code).toBe("ASSET_NOT_FOUND");
    expect(invalidAssetName.json().code).toBe("ASSET_NOT_FOUND");
    expect(missingApi.json().code).toBe("NOT_FOUND");
    expect(nonHtmlRoute.json().code).toBe("NOT_FOUND");
  });

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
    const missingAssets = await instance.inject({
      method: "GET",
      url: "/assets/index.js",
      headers: { host: "127.0.0.1:4317" },
    });
    expect(missingAssets.json().code).toBe("ASSET_NOT_FOUND");
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
    expect(response.headers["cache-control"]).toBe("no-store");
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

  it("compares registered artifacts, guards baseline overwrite, and serves allowlisted evidence", async () => {
    const reportRoot = join(tmpdir(), `studio-api-files-${crypto.randomUUID()}`);
    const instance = await server({}, reportRoot);
    const bootstrap = await instance.inject({
      method: "GET",
      url: "/api/v1/bootstrap",
      headers: { host: "127.0.0.1:4317" },
    });
    const mutationHeaders = {
      host: "127.0.0.1:4317",
      origin: "http://127.0.0.1:4317",
      cookie: bootstrap.headers["set-cookie"]?.split(";")[0] ?? "",
      "x-csrf-token": bootstrap.json().csrfToken as string,
    };
    const start = async (fixtureSetId: string) => {
      const accepted = await instance.inject({
        method: "POST",
        url: "/api/v1/runs",
        headers: mutationHeaders,
        payload: {
          projectId: "ecommerce-support",
          targetId: "mock",
          suiteId: "main",
          fixtureSetId,
          filters: { caseIds: ["REFUND_001"] },
        },
      });
      const runId = accepted.json().runId as string;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const snapshot = (
          await instance.inject({
            method: "GET",
            url: `/api/v1/runs/${runId}`,
            headers: { host: "127.0.0.1:4317" },
          })
        ).json();
        if (["COMPLETED", "QUALITY_FAILED", "OPERATIONAL_FAILED"].includes(snapshot.state)) return;
        await new Promise((resolve) => setTimeout(resolve, 2));
      }
      throw new Error("Studio run did not complete in time.");
    };
    await start("passing");
    await start("critical-regression");
    const indexed = (
      await instance.inject({
        method: "GET",
        url: "/api/v1/artifacts",
        headers: { host: "127.0.0.1:4317" },
      })
    ).json() as Array<{ id: string; runId: string; status: string; suiteId: string }>;
    const baseline = indexed.find(({ status }) => status === "PASSED")!;
    const candidate = indexed.find(({ status }) => status === "QUALITY_FAILED")!;

    const comparison = await instance.inject({
      method: "POST",
      url: "/api/v1/comparisons",
      headers: mutationHeaders,
      payload: { candidateArtifactId: candidate.id, baselineArtifactId: baseline.id },
    });
    expect(comparison.statusCode).toBe(200);
    expect(comparison.json().comparison).toMatchObject({
      status: "QUALITY_FAILED",
      criticalRegressionCaseIds: ["REFUND_001"],
    });
    const invalidComparison = await instance.inject({
      method: "POST",
      url: "/api/v1/comparisons",
      headers: mutationHeaders,
      payload: {},
    });
    expect(invalidComparison.json().code).toBe("INVALID_COMPARISON_REQUEST");
    const missingComparison = await instance.inject({
      method: "POST",
      url: "/api/v1/comparisons",
      headers: mutationHeaders,
      payload: { candidateArtifactId: "artifact-missing", baselineArtifactId: baseline.id },
    });
    expect(missingComparison.json().code).toBe("ARTIFACT_NOT_FOUND");

    const promotion = {
      artifactId: baseline.id,
      projectId: "ecommerce-support",
      suiteId: baseline.suiteId,
    };
    const invalidPromotion = await instance.inject({
      method: "POST",
      url: "/api/v1/baselines",
      headers: mutationHeaders,
      payload: {},
    });
    expect(invalidPromotion.json().code).toBe("INVALID_BASELINE_REQUEST");
    const missingPromotion = await instance.inject({
      method: "POST",
      url: "/api/v1/baselines",
      headers: mutationHeaders,
      payload: { ...promotion, artifactId: "artifact-missing" },
    });
    expect(missingPromotion.json().code).toBe("BASELINE_TARGET_NOT_FOUND");
    const promoted = await instance.inject({
      method: "POST",
      url: "/api/v1/baselines",
      headers: mutationHeaders,
      payload: promotion,
    });
    expect(promoted.json()).toMatchObject({ status: "PROMOTED", ...promotion });
    const conflict = await instance.inject({
      method: "POST",
      url: "/api/v1/baselines",
      headers: mutationHeaders,
      payload: promotion,
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({ code: "BASELINE_EXISTS" });
    const stale = await instance.inject({
      method: "POST",
      url: "/api/v1/baselines",
      headers: mutationHeaders,
      payload: {
        ...promotion,
        overwrite: true,
        expectedCurrentHash: "0".repeat(64),
      },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ code: "BASELINE_CHANGED" });
    const replaced = await instance.inject({
      method: "POST",
      url: "/api/v1/baselines",
      headers: mutationHeaders,
      payload: {
        ...promotion,
        overwrite: true,
        expectedCurrentHash: conflict.json().currentHash,
      },
    });
    expect(replaced.statusCode).toBe(200);
    expect(replaced.json().baselineHash).toMatch(/^[a-f0-9]{64}$/);

    const download = await instance.inject({
      method: "GET",
      url: `/api/v1/artifacts/${baseline.id}/files/run-json`,
      headers: { host: "127.0.0.1:4317" },
    });
    expect(download.headers["content-type"]).toContain("application/json");
    expect(download.headers["content-disposition"]).toContain("run.json");
    expect(download.body).toContain("[RAW_RESPONSE_NOT_RETAINED]");
    expect(download.body).not.toContain("canary-do-not-leak");
    await writeFile(join(reportRoot, baseline.runId, "report.html"), "<p>Safe report</p>");
    await writeFile(join(reportRoot, baseline.runId, "logs.ndjson"), '{"event":"safe"}\n');
    const html = await instance.inject({
      method: "GET",
      url: `/api/v1/artifacts/${baseline.id}/files/html-report`,
      headers: { host: "127.0.0.1:4317" },
    });
    expect(html.headers["content-type"]).toContain("text/html");
    expect(html.headers["content-disposition"]).toContain("inline");
    const logs = await instance.inject({
      method: "GET",
      url: `/api/v1/artifacts/${baseline.id}/files/redacted-logs`,
      headers: { host: "127.0.0.1:4317" },
    });
    expect(logs.headers["content-type"]).toContain("application/x-ndjson");
    expect(logs.headers["content-disposition"]).toContain("attachment");
    const detail = await instance.inject({
      method: "GET",
      url: `/api/v1/artifacts/${baseline.id}`,
      headers: { host: "127.0.0.1:4317" },
    });
    expect(detail.json().files).toEqual([
      "run-json",
      "human-review",
      "html-report",
      "redacted-logs",
    ]);
    const reviewDownload = await instance.inject({
      method: "GET",
      url: `/api/v1/artifacts/${baseline.id}/files/human-review`,
      headers: { host: "127.0.0.1:4317" },
    });
    expect(reviewDownload.headers["content-disposition"]).toContain("human-review.json");
    expect(reviewDownload.json()).toMatchObject({ items: [] });
    const reviewIndex = await instance.inject({
      method: "GET",
      url: "/api/v1/review-items",
      headers: { host: "127.0.0.1:4317" },
    });
    expect(reviewIndex.json()).toEqual([]);
    const missingDownload = await instance.inject({
      method: "GET",
      url: "/api/v1/artifacts/artifact-missing/files/run-json",
      headers: { host: "127.0.0.1:4317" },
    });
    expect(missingDownload.json().code).toBe("ARTIFACT_NOT_FOUND");
    const denied = await instance.inject({
      method: "GET",
      url: `/api/v1/artifacts/${baseline.id}/files/package-json`,
      headers: { host: "127.0.0.1:4317" },
    });
    expect(denied.statusCode).toBe(404);
    expect(denied.json().code).toBe("ARTIFACT_FILE_NOT_FOUND");
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

  it("returns a safe not-found problem when cancelling an unknown run", async () => {
    const instance = await server();
    const bootstrap = await instance.inject({
      method: "GET",
      url: "/api/v1/bootstrap",
      headers: { host: "127.0.0.1:4317" },
    });
    const response = await instance.inject({
      method: "POST",
      url: "/api/v1/runs/missing/cancel",
      headers: {
        host: "127.0.0.1:4317",
        origin: "http://127.0.0.1:4317",
        cookie: bootstrap.headers["set-cookie"]?.split(";")[0] ?? "",
        "x-csrf-token": bootstrap.json().csrfToken as string,
      },
      payload: {},
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "RUN_NOT_FOUND", status: 404 });
  });
});
