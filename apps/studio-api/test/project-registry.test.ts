import { mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { canonicalRoot, containedFile, ProjectRegistry } from "../src/index.js";

describe("ProjectRegistry", () => {
  it("loads reviewed bundled resources without exposing paths or secrets", async () => {
    const root = resolve(".");
    const registry = await ProjectRegistry.create({
      workspaceRoot: root,
      manifestPaths: [resolve("examples/ecommerce-support/studio.project.json")],
      environment: { OPENAI_API_KEY: "canary-secret" },
    });
    const project = registry.get("ecommerce-support");
    expect(project).toMatchObject({
      id: "ecommerce-support",
      suites: [{ id: "main", caseCount: 64 }],
    });
    expect(JSON.stringify(project)).not.toContain(root);
    expect(JSON.stringify(project)).not.toContain("canary-secret");
    expect(project?.targets.find(({ id }) => id === "openai")?.ready).toBe(true);
  });

  it("rejects duplicate project IDs", async () => {
    const manifest = resolve("examples/ecommerce-support/studio.project.json");
    await expect(
      ProjectRegistry.create({ workspaceRoot: resolve("."), manifestPaths: [manifest, manifest] }),
    ).rejects.toThrow("Duplicate Studio project id");
  });

  it("rejects a referenced symlink escaping the workspace root", async () => {
    const root = join(tmpdir(), `studio-root-${crypto.randomUUID()}`);
    const outside = join(tmpdir(), `outside-${crypto.randomUUID()}.json`);
    await mkdir(root, { recursive: true });
    await writeFile(outside, "{}\n");
    await symlink(outside, join(root, "config.json"));
    await writeFile(
      join(root, "studio.project.json"),
      JSON.stringify({
        schemaVersion: "1.0",
        id: "unsafe",
        name: "Unsafe",
        targets: [{ id: "mock", config: "./config.json" }],
        suites: [{ id: "main", file: "./suite.json", fixtureSets: [] }],
        scenarios: [],
      }),
    );
    await writeFile(join(root, "suite.json"), "{}\n");
    await expect(
      ProjectRegistry.create({
        workspaceRoot: root,
        manifestPaths: [join(root, "studio.project.json")],
      }),
    ).rejects.toThrow("outside its configured root");
  });

  it("rejects unavailable roots and disallowed resource extensions", async () => {
    await expect(canonicalRoot(resolve("missing-studio-root"))).rejects.toThrow("unavailable");
    const root = await canonicalRoot(resolve("."));
    await expect(containedFile(root, resolve("README.md"), new Set([".json"]))).rejects.toThrow(
      "type is not allowed",
    );
  });
});
