# Product Phase 3 — Sprint 12 Execution Record

> **Project:** LLM Evaluation Framework (`llm-eval-kit`)  
> **Product increment:** Prompt Experimentation & Decision Support  
> **AIDLC stage:** 4 — Implementation  
> **Sprint:** 12 — SQLite and immutable prompt lifecycle  
> **Status:** IMPLEMENTED — HUMAN MIGRATION REVIEW REQUIRED  
> **Date:** 2026-09-23  
> **Baseline:** Product Phase 3 Sprint 11 merge `f7cc22941629f4d319c25129546dadc402b3a882`

## 1. Scope

Sprint 12 implements approved tasks P3-T009–P3-T016 only. Experiment planning, execution, aggregation, recommendation, decision workflow, and PromptOps Studio screens remain deferred to Sprints 13–16.

## 2. Delivered evidence

| Task | Delivered evidence |
|---|---|
| P3-T009 | Workspace-contained file composition, `node:sqlite` lifecycle, disabled extensions, foreign keys, WAL, FULL synchronous mode, 5-second busy timeout, diagnostics, and isolated in-memory factory |
| P3-T010 | Embedded SHA-256 checksummed forward migration, immediate transaction, integrity/foreign-key checks, rollback on partial failure, corrupt/checksum fail-closed behavior, atomic pre-migration backup, and latest-three retention |
| P3-T011 | Strict `prompts`, `prompt_drafts`, and `prompt_versions` tables; foreign-key, unique, check, JSON, and immutable update/delete trigger controls; typed row/domain mappings and bounded cursor pagination |
| P3-T012 | Atomic prompt/initial-draft creation and optimistic draft revision save with safe lost-update conflict behavior; invalid content never replaces the previous revision |
| P3-T013 | Atomic monotonic publish, canonical SHA-256 content identity, duplicate-hash rejection, immutable history, and explicit parent-version lineage |
| P3-T014 | Shared SDK prompt facade over the repository port with identical in-memory/file-backed contract behavior and safe not-found normalization |
| P3-T015 | `prompt list`, `prompt create`, `prompt draft create`, `prompt draft save`, `prompt publish`, and `prompt show` CLI flows over a persistent workspace database with stable exit codes |
| P3-T016 | Same-origin prompt list/create/detail/draft/save/publish API endpoints using existing Host, Origin, session, CSRF, CSP, no-store, strict body, safe problem, revision-conflict, and JSON-escaping controls |

## 3. Requirement and test traceability

| Evidence group | Covered specifications |
|---|---|
| Contained composition and pragmas | P3-TS-015–017 |
| Migration, backup, rollback, checksum, corruption | P3-TS-018–023 |
| Busy/error normalization and schema constraints | P3-TS-024–025 |
| Create/save/publish lifecycle and concurrency | P3-TS-026–030 |
| CLI/API lifecycle, strict requests, CSRF, XSS-safe JSON, and persistence | Sprint 12 portions of P3-TS-064–066 and P3-TS-073–076 |

The implementation covers P3-US-003–010, P3-US-026, and P3-US-028 only to the extent assigned by P3-T009–P3-T016. It does not claim experiment or Studio workflow acceptance criteria.

## 4. Local verification evidence

| Gate | Result |
|---|---|
| Automated tests | 242/242 PASS across 46 files |
| Statement coverage | 90.39% |
| Branch coverage | 81.11% |
| Function coverage | 91.67% |
| Line coverage | 92.10% |
| ESLint / Prettier / TypeScript / workspace build | PASS |
| SQLite contract | Fresh open, file restart, in-memory parity, contained paths, required pragmas, constraints, pagination, and immutable triggers PASS |
| Migration/recovery | Checksum mismatch, corrupt file, interrupted migration rollback, atomic backup, and retention PASS |
| CLI/API integration | Persistent lifecycle, stale revision, strict body, Host/Origin/CSRF, safe problem, and no-secret checks PASS |

## 5. Persistence, privacy, and recovery assessment

- SQLite stores prompt templates and control metadata only. Its schema has no raw response, rendered case prompt, case context, evaluator evidence, or generation-text column.
- All values use prepared statements; SQL-like prompt names/notes remain data.
- Published versions have database triggers blocking update and delete in addition to repository-level immutability.
- Browser requests cannot select a database path. CLI/server configuration accepts only workspace-relative contained paths.
- Applied migration version/name/checksum mismatches stop startup without changing the recorded value.
- A migration failure rolls back all schema/data changes and preserves the previous valid database.
- Existing databases receive an atomic local backup before their first pending migration. The newest three backups are retained by default.
- Recovery is deliberately manual: stop all writers, preserve the failed database, select and verify a retained backup, copy it to a temporary sibling path, then atomically rename it to `.llm-eval-kit/promptops.sqlite` before restarting. The application never auto-restores or overwrites corrupt evidence.

## 6. Human review gate

P3-T009–P3-T016 are implemented and pass local Definition-of-Done gates. Because Sprint 12 changes the SQLite schema and migration/recovery path, the approved delivery rules require explicit human review before merge. Sprint 13 has not started.
