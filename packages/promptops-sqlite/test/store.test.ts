import { createHash } from "node:crypto";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import { PromptOpsError, type PromptTemplate } from "@llm-eval-kit/promptops";

import {
  createInMemoryPromptOpsStore,
  openPromptOpsStore,
  PROMPTOPS_MIGRATIONS,
  type PromptOpsSqliteStore,
} from "../src/index.js";
import { openPromptOpsStoreWithMigrations } from "../src/store.js";

const stores: PromptOpsSqliteStore[] = [];
const template: PromptTemplate = {
  schemaVersion: "1.0",
  system: "Answer for {{variables.locale}}.",
  user: "{{input.user}}",
  declaredVariables: ["locale"],
};

function memoryStore(): PromptOpsSqliteStore {
  let sequence = 0;
  const store = createInMemoryPromptOpsStore({
    now: () => new Date("2026-09-23T00:00:00.000Z"),
    createId: () => `id-${++sequence}`,
  });
  stores.push(store);
  return store;
}

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
});

describe("PromptOps SQLite composition and migrations", () => {
  it("opens only contained paths with required pragmas and a migrated in-memory factory", async () => {
    const workspaceRoot = join(tmpdir(), `promptops-${crypto.randomUUID()}`);
    await mkdir(workspaceRoot, { recursive: true });
    const store = openPromptOpsStore({ workspaceRoot });
    stores.push(store);
    expect(store.diagnostics()).toMatchObject({
      foreignKeys: true,
      journalMode: "wal",
      synchronous: 2,
      busyTimeout: 5000,
      migrationVersion: 1,
    });
    expect(store.databasePath.startsWith(workspaceRoot)).toBe(true);
    const inMemory = memoryStore();
    expect(inMemory.diagnostics()).toMatchObject({
      databasePath: ":memory:",
      foreignKeys: true,
      migrationVersion: 1,
    });
    expect(() => openPromptOpsStore({ workspaceRoot, databasePath: "../escape.sqlite" })).toThrow(
      expect.objectContaining({ code: "DATABASE_PATH_INVALID" }),
    );
    expect(() =>
      openPromptOpsStore({ workspaceRoot, databasePath: join(tmpdir(), "x.sqlite") }),
    ).toThrow(expect.objectContaining({ code: "DATABASE_PATH_INVALID" }));
  });

  it("fails closed on checksum mismatch and corrupt input without overwriting either file", async () => {
    const workspaceRoot = join(tmpdir(), `promptops-integrity-${crypto.randomUUID()}`);
    await mkdir(workspaceRoot, { recursive: true });
    const mismatchPath = join(workspaceRoot, "mismatch.sqlite");
    const database = new DatabaseSync(mismatchPath);
    database.exec(`CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT`);
    database
      .prepare("INSERT INTO schema_migrations VALUES (?, ?, ?, ?)")
      .run(1, PROMPTOPS_MIGRATIONS[0]!.name, "0".repeat(64), "2026-09-23T00:00:00.000Z");
    database.close();
    expect(() => openPromptOpsStore({ workspaceRoot, databasePath: "mismatch.sqlite" })).toThrow(
      expect.objectContaining({ code: "MIGRATION_FAILED" }),
    );
    const verify = new DatabaseSync(mismatchPath);
    expect(
      verify.prepare("SELECT checksum FROM schema_migrations WHERE version = 1").get(),
    ).toMatchObject({ checksum: "0".repeat(64) });
    verify.close();

    const corruptPath = join(workspaceRoot, "corrupt.sqlite");
    await writeFile(corruptPath, "not-a-sqlite-database");
    expect(() => openPromptOpsStore({ workspaceRoot, databasePath: "corrupt.sqlite" })).toThrow(
      expect.objectContaining({ code: "DATABASE_CORRUPT" }),
    );
    await expect(
      import("node:fs/promises").then(({ readFile }) => readFile(corruptPath, "utf8")),
    ).resolves.toBe("not-a-sqlite-database");
  });

  it("creates an atomic pre-migration backup and enforces retention", async () => {
    const workspaceRoot = join(tmpdir(), `promptops-backup-${crypto.randomUUID()}`);
    await mkdir(workspaceRoot, { recursive: true });
    const path = join(workspaceRoot, "control.sqlite");
    const legacy = new DatabaseSync(path);
    legacy.exec("CREATE TABLE legacy_marker(value TEXT)");
    legacy.close();
    await writeFile(`${path}.backup-2026-01-01`, "old-1");
    await writeFile(`${path}.backup-2026-01-02`, "old-2");
    const store = openPromptOpsStore({
      workspaceRoot,
      databasePath: "control.sqlite",
      backupRetention: 2,
    });
    stores.push(store);
    const backups = (await readdir(workspaceRoot)).filter((name) => name.includes(".backup-"));
    expect(backups).toHaveLength(2);
    expect(backups).not.toContain("control.sqlite.backup-2026-01-01");
    expect(store.diagnostics().migrationVersion).toBe(1);
  });

  it("rolls back a migration that fails midway and preserves the previous valid schema", async () => {
    const workspaceRoot = join(tmpdir(), `promptops-rollback-${crypto.randomUUID()}`);
    await mkdir(workspaceRoot, { recursive: true });
    const path = join(workspaceRoot, "rollback.sqlite");
    const previous = new DatabaseSync(path);
    previous.exec("CREATE TABLE preserved(value TEXT NOT NULL)");
    previous.prepare("INSERT INTO preserved VALUES (?)").run("still-valid");
    previous.close();
    const sql = "CREATE TABLE partial(value TEXT); INSERT INTO missing_table VALUES (1);";
    expect(() =>
      openPromptOpsStoreWithMigrations({ workspaceRoot, databasePath: "rollback.sqlite" }, [
        {
          version: 1,
          name: "deliberate_failure",
          sql,
          checksum: createHash("sha256").update(sql).digest("hex"),
        },
      ]),
    ).toThrow(expect.objectContaining({ code: "MIGRATION_FAILED" }));
    const verify = new DatabaseSync(path);
    expect(verify.prepare("SELECT value FROM preserved").get()).toMatchObject({
      value: "still-valid",
    });
    expect(
      verify.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'partial'").get(),
    ).toBeUndefined();
    verify.close();
  });
});

describe("PromptOps SQLite prompt repository", () => {
  it("creates, saves, publishes, persists, and follows immutable lineage", async () => {
    const store = memoryStore();
    const created = await store.createPrompt({
      promptId: "support.refund",
      displayName: "Refund assistant",
      note: "owner's prompt; DROP TABLE prompts; --",
      template,
    });
    expect(created.draft).toMatchObject({ revision: 0, template });
    const saved = await store.saveDraft({
      draftId: created.draft!.draftId,
      expectedRevision: 0,
      template: { ...template, user: "Question: {{input.user}}" },
      note: "ready",
    });
    expect(saved.revision).toBe(1);
    const first = await store.publishDraft(saved.draftId, 1);
    expect(first).toMatchObject({ promptId: "support.refund", version: 1 });
    expect(first.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect((await store.getPrompt("support.refund"))?.draft).toBeUndefined();

    const nextDraft = await store.createDraft("support.refund", 1);
    expect(nextDraft.parentVersion).toBe(1);
    const changed = await store.saveDraft({
      draftId: nextDraft.draftId,
      expectedRevision: 0,
      template: { ...template, user: "Updated: {{input.user}}" },
    });
    const second = await store.publishDraft(changed.draftId, 1);
    expect(second).toMatchObject({ version: 2, parentVersion: 1 });
    expect(
      (await store.getPrompt("support.refund"))?.versions.map(({ version }) => version),
    ).toEqual([2, 1]);
  });

  it("rejects lost updates, invalid drafts, duplicate hashes, and direct immutable mutations", async () => {
    const store = memoryStore();
    const created = await store.createPrompt({
      promptId: "immutable",
      displayName: "Immutable",
      template,
    });
    const draftId = created.draft!.draftId;
    await store.saveDraft({ draftId, expectedRevision: 0, template: { ...template, user: "v1" } });
    await expect(
      store.saveDraft({ draftId, expectedRevision: 0, template: { ...template, user: "stale" } }),
    ).rejects.toMatchObject({ code: "DRAFT_REVISION_CONFLICT" });
    await expect(
      store.saveDraft({
        draftId,
        expectedRevision: 1,
        template: { ...template, user: "{{variables.missing}}" },
      }),
    ).rejects.toMatchObject({ code: "PROMPT_VARIABLE_UNDECLARED" });
    expect((await store.getDraft(draftId))?.revision).toBe(1);
    const published = await store.publishDraft(draftId, 1);
    const duplicate = await store.createDraft("immutable", published.version);
    await expect(store.publishDraft(duplicate.draftId, 0)).rejects.toMatchObject({
      code: "PROMPT_CONTENT_ALREADY_PUBLISHED",
    });
  });

  it("returns safe errors for missing identities and validates repository boundaries", async () => {
    const store = memoryStore();
    await expect(
      store.createPrompt({ promptId: "bad id", displayName: "Bad", template }),
    ).rejects.toMatchObject({ code: "PROMPT_TEMPLATE_INVALID" });
    await expect(
      store.createPrompt({ promptId: "empty-name", displayName: "", template }),
    ).rejects.toMatchObject({ code: "PROMPT_TEMPLATE_INVALID" });
    await expect(
      store.createPrompt({
        promptId: "large-note",
        displayName: "Large note",
        note: "x".repeat(8 * 1024 + 1),
        template,
      }),
    ).rejects.toMatchObject({ code: "PROMPT_TEMPLATE_INVALID" });
    await expect(
      store.saveDraft({ draftId: "missing", expectedRevision: 0, template }),
    ).rejects.toMatchObject({ code: "PROMPT_DRAFT_NOT_FOUND" });
    await expect(store.publishDraft("missing", 0)).rejects.toMatchObject({
      code: "PROMPT_DRAFT_NOT_FOUND",
    });
    await expect(store.createDraft("missing")).rejects.toMatchObject({ code: "PROMPT_NOT_FOUND" });
    const created = await store.createPrompt({
      promptId: "known",
      displayName: "Known",
      template,
    });
    await expect(
      store.createPrompt({ promptId: "known", displayName: "Duplicate", template }),
    ).rejects.toMatchObject({ code: "PROMPT_ALREADY_EXISTS" });
    await store.publishDraft(created.draft!.draftId, 0);
    await expect(store.createDraft("known", 99)).rejects.toMatchObject({
      code: "PROMPT_NOT_FOUND",
    });
    await expect(store.listPrompts({ limit: 1, cursor: "bad cursor" })).rejects.toMatchObject({
      code: "PROMPT_TEMPLATE_INVALID",
    });
    await expect(store.listPublished("known", { limit: 1, cursor: "zero" })).rejects.toMatchObject({
      code: "PROMPT_TEMPLATE_INVALID",
    });
    expect(await store.getDraft("missing")).toBeUndefined();
    expect(await store.getPrompt("missing")).toBeUndefined();
    expect(await store.getPublished("known", 99)).toBeUndefined();
  });

  it("paginates immutable versions newest first", async () => {
    const store = memoryStore();
    const created = await store.createPrompt({
      promptId: "versions",
      displayName: "Versions",
      template: { ...template, user: "v1" },
    });
    await store.publishDraft(created.draft!.draftId, 0);
    const next = await store.createDraft("versions");
    await store.saveDraft({
      draftId: next.draftId,
      expectedRevision: 0,
      template: { ...template, user: "v2" },
    });
    await store.publishDraft(next.draftId, 1);
    const firstPage = await store.listPublished("versions", { limit: 1 });
    expect(firstPage.items[0]?.version).toBe(2);
    expect(
      (await store.listPublished("versions", { limit: 1, cursor: firstPage.nextCursor })).items[0]
        ?.version,
    ).toBe(1);
  });

  it("enforces bounded stable pagination and survives a file-backed restart", async () => {
    const workspaceRoot = join(tmpdir(), `promptops-restart-${crypto.randomUUID()}`);
    await mkdir(workspaceRoot, { recursive: true });
    const first = openPromptOpsStore({ workspaceRoot });
    await first.createPrompt({ promptId: "alpha", displayName: "Alpha", template });
    await first.createPrompt({ promptId: "beta", displayName: "Beta", template });
    const page = await first.listPrompts({ limit: 1 });
    expect(page.items.map(({ promptId }) => promptId)).toEqual(["alpha"]);
    expect(
      (await first.listPrompts({ limit: 1, cursor: page.nextCursor })).items[0]?.promptId,
    ).toBe("beta");
    first.close();
    const reopened = openPromptOpsStore({ workspaceRoot });
    stores.push(reopened);
    expect((await reopened.getPrompt("alpha"))?.displayName).toBe("Alpha");
    await expect(reopened.listPrompts({ limit: 101 })).rejects.toBeInstanceOf(PromptOpsError);
  });

  it.each(["memory", "file"])(
    "keeps the prompt application contract on the %s adapter",
    async (kind) => {
      const workspaceRoot = join(tmpdir(), `promptops-parity-${crypto.randomUUID()}`);
      await mkdir(workspaceRoot, { recursive: true });
      const store = kind === "memory" ? memoryStore() : openPromptOpsStore({ workspaceRoot });
      if (kind === "file") stores.push(store);
      const created = await store.createPrompt({
        promptId: "parity",
        displayName: "Parity",
        template,
      });
      const published = await store.publishDraft(created.draft!.draftId, 0);
      expect(await store.getPublished("parity", 1)).toEqual(published);
      expect(await store.listPrompts({ limit: 10 })).toMatchObject({
        items: [expect.objectContaining({ promptId: "parity", latestVersion: 1 })],
      });
      if (kind === "file") {
        const raw = new DatabaseSync(store.databasePath);
        const schema = raw
          .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' ORDER BY name")
          .all()
          .map((row) => String(row.sql))
          .join("\n");
        expect(schema).not.toMatch(/raw_response|generation_text|case_context|evaluator_evidence/i);
        expect(() =>
          raw.exec("UPDATE prompt_versions SET template_json = '{}' WHERE prompt_id = 'parity'"),
        ).toThrow(/immutable/);
        expect(() => raw.exec("DELETE FROM prompt_versions WHERE prompt_id = 'parity'")).toThrow(
          /immutable/,
        );
        raw.close();
      }
    },
  );
});
