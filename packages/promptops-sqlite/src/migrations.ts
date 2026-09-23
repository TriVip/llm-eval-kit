import { createHash } from "node:crypto";

export type PromptOpsMigration = {
  version: number;
  name: string;
  sql: string;
  checksum: string;
};

function migration(version: number, name: string, sql: string): PromptOpsMigration {
  return {
    version,
    name,
    sql,
    checksum: createHash("sha256").update(sql, "utf8").digest("hex"),
  };
}

const PROMPT_SCHEMA_V1 = `
CREATE TABLE prompts (
  prompt_id TEXT PRIMARY KEY CHECK(length(prompt_id) BETWEEN 1 AND 120),
  display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 1 AND 256),
  note TEXT CHECK(note IS NULL OR length(CAST(note AS BLOB)) <= 8192),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE prompt_drafts (
  draft_id TEXT PRIMARY KEY CHECK(length(draft_id) BETWEEN 1 AND 120),
  prompt_id TEXT NOT NULL UNIQUE REFERENCES prompts(prompt_id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL CHECK(revision >= 0),
  parent_version INTEGER CHECK(parent_version IS NULL OR parent_version > 0),
  template_json TEXT NOT NULL CHECK(json_valid(template_json)),
  note TEXT CHECK(note IS NULL OR length(CAST(note AS BLOB)) <= 8192),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE prompt_versions (
  prompt_id TEXT NOT NULL REFERENCES prompts(prompt_id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK(version > 0),
  parent_version INTEGER CHECK(parent_version IS NULL OR parent_version > 0),
  template_json TEXT NOT NULL CHECK(json_valid(template_json)),
  content_hash TEXT NOT NULL CHECK(length(content_hash) = 64),
  published_at TEXT NOT NULL,
  PRIMARY KEY(prompt_id, version),
  UNIQUE(prompt_id, content_hash),
  CHECK(parent_version IS NULL OR parent_version < version)
) STRICT;

CREATE INDEX prompt_versions_published_at_idx
  ON prompt_versions(prompt_id, published_at DESC, version DESC);

CREATE TRIGGER prompt_versions_no_update
BEFORE UPDATE ON prompt_versions
BEGIN
  SELECT RAISE(ABORT, 'published prompt versions are immutable');
END;

CREATE TRIGGER prompt_versions_no_delete
BEFORE DELETE ON prompt_versions
BEGIN
  SELECT RAISE(ABORT, 'published prompt versions are immutable');
END;
`;

export const PROMPTOPS_MIGRATIONS: readonly PromptOpsMigration[] = [
  migration(1, "prompt_lifecycle_v1", PROMPT_SCHEMA_V1),
];
