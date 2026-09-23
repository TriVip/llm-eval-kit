import { createHash, randomUUID } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";

import {
  PromptOpsError,
  canonicalJson,
  hashPromptTemplate,
  validatePromptTemplateDefinition,
  type CreatePromptInput,
  type Page,
  type PageRequest,
  type PromptDetails,
  type PromptDraft,
  type PromptId,
  type PromptRepository,
  type PromptSummary,
  type PromptTemplate,
  type PublishedPromptVersion,
  type SavePromptDraftInput,
} from "@llm-eval-kit/promptops";

import { PROMPTOPS_MIGRATIONS, type PromptOpsMigration } from "./migrations.js";
import { assertPromptOpsRuntime } from "./runtime.js";

export const DEFAULT_PROMPTOPS_DATABASE = ".llm-eval-kit/promptops.sqlite";
export const DEFAULT_BACKUP_RETENTION = 3;

type SqliteValue = string | number | bigint | null;
type SqliteRow = Record<string, SqliteValue>;

export type OpenPromptOpsStoreOptions = {
  workspaceRoot: string;
  databasePath?: string;
  backupRetention?: number;
  now?: () => Date;
  createId?: () => string;
};

export type PromptOpsStoreDiagnostics = {
  databasePath: string;
  foreignKeys: boolean;
  journalMode: string;
  synchronous: number;
  busyTimeout: number;
  migrationVersion: number;
};

const promptIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;

function safeDatabaseError(error: unknown): PromptOpsError {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("locked") || message.includes("busy")) {
    return new PromptOpsError("DATABASE_BUSY", "The PromptOps database is busy. Try again.");
  }
  if (message.includes("malformed") || message.includes("not a database")) {
    return new PromptOpsError(
      "DATABASE_CORRUPT",
      "The PromptOps database is corrupt. Restore a verified backup before retrying.",
    );
  }
  return new PromptOpsError(
    "MIGRATION_FAILED",
    "The PromptOps database could not be opened or migrated safely.",
  );
}

function containedDatabasePath(workspaceRoot: string, requested: string): string {
  const root = realpathSync(resolve(workspaceRoot));
  if (isAbsolute(requested)) {
    throw new PromptOpsError(
      "DATABASE_PATH_INVALID",
      "PromptOps database path must be relative to the workspace.",
    );
  }
  const path = resolve(root, requested);
  const relation = relative(root, path);
  if (relation === "" || relation.startsWith("..") || isAbsolute(relation)) {
    throw new PromptOpsError(
      "DATABASE_PATH_INVALID",
      "PromptOps database path must remain inside the workspace.",
    );
  }
  mkdirSync(dirname(path), { recursive: true });
  const parent = realpathSync(dirname(path));
  const parentRelation = relative(root, parent);
  if (parentRelation.startsWith("..") || isAbsolute(parentRelation)) {
    throw new PromptOpsError(
      "DATABASE_PATH_INVALID",
      "PromptOps database path resolves outside the workspace.",
    );
  }
  return path;
}

function backupExistingDatabase(database: DatabaseSync, path: string, retention: number): void {
  if (!existsSync(path) || statSync(path).size === 0) return;
  database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const finalPath = `${path}.backup-${stamp}`;
  const temporaryPath = `${finalPath}.tmp-${randomUUID()}`;
  copyFileSync(path, temporaryPath);
  renameSync(temporaryPath, finalPath);
  const prefix = `${path.split("/").at(-1)}.backup-`;
  const backups = readdirSync(dirname(path))
    .filter((name) => name.startsWith(prefix) && !name.includes(".tmp-"))
    .sort();
  for (const expired of backups.slice(0, Math.max(0, backups.length - retention))) {
    unlinkSync(resolve(dirname(path), expired));
  }
}

function scalarNumber(statement: StatementSync, ...values: SqliteValue[]): number {
  const row = statement.get(...values) as SqliteRow | undefined;
  return Number(row === undefined ? 0 : Object.values(row)[0]);
}

function migrate(
  database: DatabaseSync,
  path: string,
  existed: boolean,
  retention: number,
  migrations: readonly PromptOpsMigration[] = PROMPTOPS_MIGRATIONS,
): void {
  const hasMigrationTable =
    database
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")
      .get() !== undefined;
  const preflightApplied = hasMigrationTable
    ? (database
        .prepare("SELECT version, name, checksum FROM schema_migrations ORDER BY version")
        .all() as SqliteRow[])
    : [];
  for (const row of preflightApplied) {
    const expected = migrations.find(({ version }) => version === Number(row.version));
    if (
      expected === undefined ||
      expected.name !== row.name ||
      expected.checksum !== row.checksum
    ) {
      throw new PromptOpsError(
        "MIGRATION_FAILED",
        "PromptOps migration history does not match this application version.",
      );
    }
  }
  const preflightVersions = new Set(preflightApplied.map(({ version }) => Number(version)));
  if (existed && migrations.some(({ version }) => !preflightVersions.has(version))) {
    backupExistingDatabase(database, path, retention);
  }
  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY CHECK(version > 0),
        name TEXT NOT NULL UNIQUE,
        checksum TEXT NOT NULL CHECK(length(checksum) = 64),
        applied_at TEXT NOT NULL
      ) STRICT
    `);
    const applied = database
      .prepare("SELECT version, name, checksum FROM schema_migrations ORDER BY version")
      .all() as SqliteRow[];
    for (const row of applied) {
      const expected = migrations.find(({ version }) => version === Number(row.version));
      if (
        expected === undefined ||
        expected.name !== row.name ||
        expected.checksum !== row.checksum
      ) {
        throw new PromptOpsError(
          "MIGRATION_FAILED",
          "PromptOps migration history does not match this application version.",
        );
      }
    }
    const appliedVersions = new Set(applied.map(({ version }) => Number(version)));
    const pending = migrations.filter(({ version }) => !appliedVersions.has(version));
    const insert = database.prepare(
      "INSERT INTO schema_migrations(version, name, checksum, applied_at) VALUES (?, ?, ?, ?)",
    );
    for (const item of pending) {
      database.exec(item.sql);
      insert.run(item.version, item.name, item.checksum, new Date().toISOString());
    }
    const foreignKeyFailures = database.prepare("PRAGMA foreign_key_check").all();
    if (foreignKeyFailures.length > 0) {
      throw new PromptOpsError(
        "MIGRATION_FAILED",
        "PromptOps database integrity verification failed.",
      );
    }
    const integrity = database.prepare("PRAGMA integrity_check").get() as SqliteRow | undefined;
    if (integrity === undefined || Object.values(integrity)[0] !== "ok") {
      throw new PromptOpsError(
        "DATABASE_CORRUPT",
        "The PromptOps database is corrupt. Restore a verified backup before retrying.",
      );
    }
    database.exec("COMMIT");
  } catch (error) {
    try {
      database.exec("ROLLBACK");
    } catch {
      // Preserve the original safe failure.
    }
    throw error instanceof PromptOpsError ? error : safeDatabaseError(error);
  }
}

function parseTemplate(value: SqliteValue): PromptTemplate {
  try {
    return JSON.parse(String(value)) as PromptTemplate;
  } catch {
    throw new PromptOpsError(
      "DATABASE_CORRUPT",
      "The PromptOps database contains invalid prompt data.",
    );
  }
}

function requiredValue(row: SqliteRow, key: string): SqliteValue {
  const value = row[key];
  if (value === undefined) {
    throw new PromptOpsError(
      "DATABASE_CORRUPT",
      "The PromptOps database contains incomplete prompt data.",
    );
  }
  return value;
}

function draftFromRow(row: SqliteRow): PromptDraft {
  return {
    draftId: String(row.draft_id),
    promptId: String(row.prompt_id),
    revision: Number(row.revision),
    ...(row.parent_version === null ? {} : { parentVersion: Number(row.parent_version) }),
    template: parseTemplate(requiredValue(row, "template_json")),
    ...(row.note === null ? {} : { note: String(row.note) }),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function versionFromRow(row: SqliteRow): PublishedPromptVersion {
  return {
    promptId: String(row.prompt_id),
    version: Number(row.version),
    ...(row.parent_version === null ? {} : { parentVersion: Number(row.parent_version) }),
    template: parseTemplate(requiredValue(row, "template_json")),
    contentHash: String(row.content_hash),
    publishedAt: String(row.published_at),
  };
}

function validatePage(page: PageRequest): void {
  if (!Number.isInteger(page.limit) || page.limit < 1 || page.limit > 100) {
    throw new PromptOpsError("PROMPT_TEMPLATE_INVALID", "Page limit must be between 1 and 100.");
  }
  if (page.cursor !== undefined && !promptIdPattern.test(page.cursor)) {
    throw new PromptOpsError("PROMPT_TEMPLATE_INVALID", "Page cursor is invalid.");
  }
}

function validatePromptInput(input: CreatePromptInput): void {
  if (!promptIdPattern.test(input.promptId)) {
    throw new PromptOpsError("PROMPT_TEMPLATE_INVALID", "Prompt ID is invalid.");
  }
  if (input.displayName.length < 1 || input.displayName.length > 256) {
    throw new PromptOpsError("PROMPT_TEMPLATE_INVALID", "Prompt display name is invalid.");
  }
  if (input.note !== undefined && new TextEncoder().encode(input.note).byteLength > 8 * 1024) {
    throw new PromptOpsError("PROMPT_TEMPLATE_INVALID", "Prompt note exceeds 8 KiB.");
  }
  validateTemplate(input.template);
}

function validateTemplate(template: PromptTemplate): void {
  const validation = validatePromptTemplateDefinition(template);
  if (!validation.valid) {
    throw new PromptOpsError(
      validation.errors[0]?.code ?? "PROMPT_TEMPLATE_INVALID",
      validation.errors[0]?.message ?? "Prompt template is invalid.",
      validation.errors,
    );
  }
}

export class PromptOpsSqliteStore implements PromptRepository {
  public constructor(
    private readonly database: DatabaseSync,
    public readonly databasePath: string,
    private readonly now: () => Date = () => new Date(),
    private readonly createId: () => string = randomUUID,
  ) {}

  public close(): void {
    this.database.close();
  }

  public diagnostics(): PromptOpsStoreDiagnostics {
    return {
      databasePath: this.databasePath,
      foreignKeys: scalarNumber(this.database.prepare("PRAGMA foreign_keys")) === 1,
      journalMode: String(
        Object.values(this.database.prepare("PRAGMA journal_mode").get() as SqliteRow)[0],
      ),
      synchronous: scalarNumber(this.database.prepare("PRAGMA synchronous")),
      busyTimeout: scalarNumber(this.database.prepare("PRAGMA busy_timeout")),
      migrationVersion: scalarNumber(
        this.database.prepare("SELECT COALESCE(MAX(version), 0) FROM schema_migrations"),
      ),
    };
  }

  private transaction<T>(operation: () => T): T {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        this.database.exec("ROLLBACK");
      } catch {
        // Preserve the domain or SQLite failure.
      }
      if (error instanceof PromptOpsError) throw error;
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (message.includes("unique") && message.includes("prompts.prompt_id")) {
        throw new PromptOpsError("PROMPT_ALREADY_EXISTS", "Prompt ID already exists.");
      }
      throw safeDatabaseError(error);
    }
  }

  public async createPrompt(input: CreatePromptInput): Promise<PromptDetails> {
    validatePromptInput(input);
    return this.transaction(() => {
      const timestamp = this.now().toISOString();
      const draftId = `draft_${this.createId()}`;
      this.database
        .prepare(
          "INSERT INTO prompts(prompt_id, display_name, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        )
        .run(input.promptId, input.displayName, input.note ?? null, timestamp, timestamp);
      this.database
        .prepare(
          "INSERT INTO prompt_drafts(draft_id, prompt_id, revision, parent_version, template_json, note, created_at, updated_at) VALUES (?, ?, 0, NULL, ?, ?, ?, ?)",
        )
        .run(
          draftId,
          input.promptId,
          canonicalJson(input.template),
          input.note ?? null,
          timestamp,
          timestamp,
        );
      return {
        promptId: input.promptId,
        displayName: input.displayName,
        ...(input.note === undefined ? {} : { note: input.note }),
        createdAt: timestamp,
        updatedAt: timestamp,
        draft: {
          draftId,
          promptId: input.promptId,
          revision: 0,
          template: input.template,
          ...(input.note === undefined ? {} : { note: input.note }),
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        versions: [],
      };
    });
  }

  public async saveDraft(input: SavePromptDraftInput): Promise<PromptDraft> {
    validateTemplate(input.template);
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) {
      throw new PromptOpsError("PROMPT_TEMPLATE_INVALID", "Expected revision is invalid.");
    }
    return this.transaction(() => {
      const timestamp = this.now().toISOString();
      const result = this.database
        .prepare(
          "UPDATE prompt_drafts SET revision = revision + 1, template_json = ?, note = ?, updated_at = ? WHERE draft_id = ? AND revision = ?",
        )
        .run(
          canonicalJson(input.template),
          input.note ?? null,
          timestamp,
          input.draftId,
          input.expectedRevision,
        );
      if (Number(result.changes) !== 1) {
        const exists = this.database
          .prepare("SELECT 1 FROM prompt_drafts WHERE draft_id = ?")
          .get(input.draftId);
        throw new PromptOpsError(
          exists === undefined ? "PROMPT_DRAFT_NOT_FOUND" : "DRAFT_REVISION_CONFLICT",
          exists === undefined ? "Prompt draft was not found." : "Prompt draft revision is stale.",
        );
      }
      const row = this.database
        .prepare("SELECT * FROM prompt_drafts WHERE draft_id = ?")
        .get(input.draftId) as SqliteRow;
      return draftFromRow(row);
    });
  }

  public async createDraft(promptId: PromptId, parentVersion?: number): Promise<PromptDraft> {
    return this.transaction(() => {
      const prompt = this.database
        .prepare("SELECT 1 FROM prompts WHERE prompt_id = ?")
        .get(promptId);
      if (prompt === undefined) {
        throw new PromptOpsError("PROMPT_NOT_FOUND", "Prompt was not found.");
      }
      const existing = this.database
        .prepare("SELECT * FROM prompt_drafts WHERE prompt_id = ?")
        .get(promptId) as SqliteRow | undefined;
      if (existing !== undefined) return draftFromRow(existing);
      const parent =
        parentVersion === undefined
          ? (this.database
              .prepare(
                "SELECT * FROM prompt_versions WHERE prompt_id = ? ORDER BY version DESC LIMIT 1",
              )
              .get(promptId) as SqliteRow | undefined)
          : (this.database
              .prepare("SELECT * FROM prompt_versions WHERE prompt_id = ? AND version = ?")
              .get(promptId, parentVersion) as SqliteRow | undefined);
      if (parent === undefined) {
        throw new PromptOpsError("PROMPT_NOT_FOUND", "Published prompt version was not found.");
      }
      const timestamp = this.now().toISOString();
      const draftId = `draft_${this.createId()}`;
      this.database
        .prepare(
          "INSERT INTO prompt_drafts(draft_id, prompt_id, revision, parent_version, template_json, note, created_at, updated_at) VALUES (?, ?, 0, ?, ?, NULL, ?, ?)",
        )
        .run(
          draftId,
          promptId,
          Number(requiredValue(parent, "version")),
          requiredValue(parent, "template_json"),
          timestamp,
          timestamp,
        );
      return draftFromRow(
        this.database
          .prepare("SELECT * FROM prompt_drafts WHERE draft_id = ?")
          .get(draftId) as SqliteRow,
      );
    });
  }

  public async publishDraft(
    draftId: string,
    expectedRevision: number,
  ): Promise<PublishedPromptVersion> {
    return this.transaction(() => {
      const row = this.database
        .prepare("SELECT * FROM prompt_drafts WHERE draft_id = ?")
        .get(draftId) as SqliteRow | undefined;
      if (row === undefined) {
        throw new PromptOpsError("PROMPT_DRAFT_NOT_FOUND", "Prompt draft was not found.");
      }
      if (Number(row.revision) !== expectedRevision) {
        throw new PromptOpsError("DRAFT_REVISION_CONFLICT", "Prompt draft revision is stale.");
      }
      const template = parseTemplate(requiredValue(row, "template_json"));
      validateTemplate(template);
      const contentHash = hashPromptTemplate(template);
      const duplicate = this.database
        .prepare("SELECT 1 FROM prompt_versions WHERE prompt_id = ? AND content_hash = ?")
        .get(requiredValue(row, "prompt_id"), contentHash);
      if (duplicate !== undefined) {
        throw new PromptOpsError(
          "PROMPT_CONTENT_ALREADY_PUBLISHED",
          "This prompt content has already been published.",
        );
      }
      const version =
        scalarNumber(
          this.database.prepare(
            "SELECT COALESCE(MAX(version), 0) FROM prompt_versions WHERE prompt_id = ?",
          ),
          requiredValue(row, "prompt_id"),
        ) + 1;
      const publishedAt = this.now().toISOString();
      this.database
        .prepare(
          "INSERT INTO prompt_versions(prompt_id, version, parent_version, template_json, content_hash, published_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(
          requiredValue(row, "prompt_id"),
          version,
          requiredValue(row, "parent_version"),
          canonicalJson(template),
          contentHash,
          publishedAt,
        );
      this.database.prepare("DELETE FROM prompt_drafts WHERE draft_id = ?").run(draftId);
      this.database
        .prepare("UPDATE prompts SET updated_at = ? WHERE prompt_id = ?")
        .run(publishedAt, requiredValue(row, "prompt_id"));
      return {
        promptId: String(row.prompt_id),
        version,
        ...(row.parent_version === null ? {} : { parentVersion: Number(row.parent_version) }),
        template,
        contentHash,
        publishedAt,
      };
    });
  }

  public async getDraft(draftId: string): Promise<PromptDraft | undefined> {
    const row = this.database
      .prepare("SELECT * FROM prompt_drafts WHERE draft_id = ?")
      .get(draftId) as SqliteRow | undefined;
    return row === undefined ? undefined : draftFromRow(row);
  }

  public async getPrompt(promptId: PromptId): Promise<PromptDetails | undefined> {
    const prompt = this.database
      .prepare("SELECT * FROM prompts WHERE prompt_id = ?")
      .get(promptId) as SqliteRow | undefined;
    if (prompt === undefined) return undefined;
    const draft = this.database
      .prepare("SELECT * FROM prompt_drafts WHERE prompt_id = ?")
      .get(promptId) as SqliteRow | undefined;
    const versions = this.database
      .prepare("SELECT * FROM prompt_versions WHERE prompt_id = ? ORDER BY version DESC")
      .all(promptId) as SqliteRow[];
    return {
      promptId: String(prompt.prompt_id),
      displayName: String(prompt.display_name),
      ...(prompt.note === null ? {} : { note: String(prompt.note) }),
      createdAt: String(prompt.created_at),
      updatedAt: String(prompt.updated_at),
      ...(draft === undefined ? {} : { draft: draftFromRow(draft) }),
      versions: versions.map(versionFromRow),
    };
  }

  public async getPublished(
    promptId: PromptId,
    version: number,
  ): Promise<PublishedPromptVersion | undefined> {
    const row = this.database
      .prepare("SELECT * FROM prompt_versions WHERE prompt_id = ? AND version = ?")
      .get(promptId, version) as SqliteRow | undefined;
    return row === undefined ? undefined : versionFromRow(row);
  }

  public async listPrompts(page: PageRequest): Promise<Page<PromptSummary>> {
    validatePage(page);
    const rows = this.database
      .prepare(
        `
        SELECT p.*,
          d.revision AS draft_revision,
          (SELECT MAX(v.version) FROM prompt_versions v WHERE v.prompt_id = p.prompt_id) AS latest_version
        FROM prompts p
        LEFT JOIN prompt_drafts d ON d.prompt_id = p.prompt_id
        WHERE p.prompt_id > ?
        ORDER BY p.prompt_id
        LIMIT ?
      `,
      )
      .all(page.cursor ?? "", page.limit + 1) as SqliteRow[];
    const hasMore = rows.length > page.limit;
    const selected = rows.slice(0, page.limit);
    const items = selected.map((row) => ({
      promptId: String(row.prompt_id),
      displayName: String(row.display_name),
      ...(row.note === null ? {} : { note: String(row.note) }),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      ...(row.draft_revision === null ? {} : { draftRevision: Number(row.draft_revision) }),
      ...(row.latest_version === null ? {} : { latestVersion: Number(row.latest_version) }),
    }));
    return {
      items,
      ...(hasMore && items.at(-1) !== undefined ? { nextCursor: items.at(-1)!.promptId } : {}),
    };
  }

  public async listPublished(
    promptId: PromptId,
    page: PageRequest,
  ): Promise<Page<PublishedPromptVersion>> {
    validatePage(page);
    const cursor = page.cursor === undefined ? Number.MAX_SAFE_INTEGER : Number(page.cursor);
    if (!Number.isSafeInteger(cursor) || cursor < 1) {
      throw new PromptOpsError("PROMPT_TEMPLATE_INVALID", "Version cursor is invalid.");
    }
    const rows = this.database
      .prepare(
        "SELECT * FROM prompt_versions WHERE prompt_id = ? AND version < ? ORDER BY version DESC LIMIT ?",
      )
      .all(promptId, cursor, page.limit + 1) as SqliteRow[];
    const hasMore = rows.length > page.limit;
    const items = rows.slice(0, page.limit).map(versionFromRow);
    return {
      items,
      ...(hasMore && items.at(-1) !== undefined
        ? { nextCursor: String(items.at(-1)!.version) }
        : {}),
    };
  }
}

function configureDatabase(database: DatabaseSync, inMemory: boolean): void {
  database.exec("PRAGMA foreign_keys = ON");
  if (!inMemory) database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA synchronous = FULL");
  database.exec("PRAGMA busy_timeout = 5000");
}

export function openPromptOpsStore(options: OpenPromptOpsStoreOptions): PromptOpsSqliteStore {
  return openPromptOpsStoreWithMigrations(options, PROMPTOPS_MIGRATIONS);
}

/** @internal Exposed for deterministic migration fault tests. */
export function openPromptOpsStoreWithMigrations(
  options: OpenPromptOpsStoreOptions,
  migrations: readonly PromptOpsMigration[],
): PromptOpsSqliteStore {
  assertPromptOpsRuntime();
  const path = containedDatabasePath(
    options.workspaceRoot,
    options.databasePath ?? DEFAULT_PROMPTOPS_DATABASE,
  );
  const existed = existsSync(path) && statSync(path).size > 0;
  let database: DatabaseSync | undefined;
  try {
    database = new DatabaseSync(path, { allowExtension: false });
    configureDatabase(database, false);
    migrate(
      database,
      path,
      existed,
      options.backupRetention ?? DEFAULT_BACKUP_RETENTION,
      migrations,
    );
    return new PromptOpsSqliteStore(database, path, options.now, options.createId);
  } catch (error) {
    try {
      database?.close();
    } catch {
      // Preserve the opening failure.
    }
    throw error instanceof PromptOpsError ? error : safeDatabaseError(error);
  }
}

export function createInMemoryPromptOpsStore(
  options: Pick<OpenPromptOpsStoreOptions, "now" | "createId"> = {},
): PromptOpsSqliteStore {
  assertPromptOpsRuntime();
  const database = new DatabaseSync(":memory:", { allowExtension: false });
  configureDatabase(database, true);
  migrate(database, ":memory:", false, 0);
  return new PromptOpsSqliteStore(database, ":memory:", options.now, options.createId);
}

export function migrationFingerprint(): string {
  return createHash("sha256")
    .update(PROMPTOPS_MIGRATIONS.map(({ checksum }) => checksum).join(":"), "utf8")
    .digest("hex");
}
