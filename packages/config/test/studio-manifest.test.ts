import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { loadStudioProjectManifest, studioProjectManifestSchema } from "../src/index.js";

const valid = {
  schemaVersion: "1.0",
  id: "project",
  name: "Project",
  targets: [{ id: "mock", config: "./config.json" }],
  suites: [
    {
      id: "main",
      file: "./suite.yaml",
      fixtureSets: [{ id: "passing", file: "./fixtures.json" }],
    },
  ],
  scenarios: [{ id: "pass", targetId: "mock", suiteId: "main", fixtureSetId: "passing" }],
};

describe("Studio project manifest", () => {
  it("loads the bundled manifest with resolvable IDs", async () => {
    const manifest = await loadStudioProjectManifest(
      resolve("examples/ecommerce-support/studio.project.json"),
    );
    expect(manifest.scenarios).toHaveLength(2);
    expect(manifest.targets.map(({ id }) => id)).toContain("mock");
  });

  it("rejects duplicate and missing references with field paths", () => {
    const parsed = studioProjectManifestSchema.safeParse({
      ...valid,
      targets: [...valid.targets, ...valid.targets],
      scenarios: [{ id: "bad", targetId: "missing", suiteId: "unknown" }],
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.map(({ path }) => path.join("."))).toEqual(
        expect.arrayContaining(["targets.1.id", "scenarios.0.targetId", "scenarios.0.suiteId"]),
      );
    }
  });

  it.each(["../secret.json", "/etc/passwd", "C:\\secret.json"])(
    "rejects unsafe manifest path %s",
    (file) => {
      expect(
        studioProjectManifestSchema.safeParse({
          ...valid,
          targets: [{ id: "mock", config: file }],
        }).success,
      ).toBe(false);
    },
  );

  it("rejects unsupported schema versions", () => {
    expect(studioProjectManifestSchema.safeParse({ ...valid, schemaVersion: "2.0" }).success).toBe(
      false,
    );
  });

  it("rejects a fixture reference outside the selected suite", () => {
    const parsed = studioProjectManifestSchema.safeParse({
      ...valid,
      scenarios: [{ id: "bad", targetId: "mock", suiteId: "main", fixtureSetId: "missing" }],
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.path.join(".")).toBe("scenarios.0.fixtureSetId");
    }
  });

  it("reports unreadable manifests as safe configuration errors", async () => {
    await expect(loadStudioProjectManifest(resolve("does-not-exist.json"))).rejects.toMatchObject({
      code: "CONFIGURATION_ERROR",
    });
  });
});
