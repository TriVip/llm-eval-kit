# Product Phase 3 — PromptOps Test Strategy & Specifications

> **Project:** LLM Evaluation Framework (`llm-eval-kit`)  
> **AIDLC stage:** 3 — Backlog & Test Design  
> **Status:** APPROVED
> **Date:** 2026-09-21
> **Approved:** 2026-09-21 by project owner

## 1. Quality objective

Prove that PromptOps recommendations and decisions are reproducible, risk-first, and bound to exact evidence. The increment must not rewrite prompt history, mix incompatible runs, turn missing metrics into zero, leak sensitive content, or change existing evaluation semantics.

## 2. Highest quality risks

| Risk | Severity | Primary control |
|---|---|---|
| Published prompt content/history mutates | Critical | Canonical hash, transaction, immutable repository tests |
| Recommendation uses incomplete/stale/tampered evidence | Critical | Plan/artifact/evidence hashes and fail-closed policy |
| Critical regression hidden by average improvement | Critical | Deterministic precedence and critical golden fixtures |
| SQLite replaces or duplicates canonical evaluation truth | Critical | Reference-only schema inspection and artifact reload tests |
| Template executes code or leaks unintended data | Critical | Restricted parser, injection fixtures, inert rendering |
| Human decision or recommendation automatically promotes baseline | Critical | Separate append-only decision and explicit promotion tests |
| Migration corrupts prompt/decision history | Critical | Checksums, rollback, backup, recovery matrix |
| Missing usage/cost appears as zero | High | Availability-aware schemas and coverage tests |
| Resume combines incompatible cells | High | Exact plan/compatibility/artifact verification |
| Repetition math or tie-break is nondeterministic | High | Golden/property tests and stable ordering |
| Experiment multiplies provider cost/concurrency | High | One active experiment, sequential cell tests, hard 40-cell cap |
| Browser/API exposes prompt values, secrets, paths, SQL, or raw evidence | High | Opaque IDs, redaction canaries, safe problem/event tests |
| Existing CLI/Studio/artifacts regress | High | Characterization and semantic parity suite on every PR |
| PromptOps flow blocks keyboard/screen-reader users | High | Component, axe, keyboard, focus, zoom, reduced-motion gates |

## 3. Test layers

| Layer | Scope | Tools/evidence |
|---|---|---|
| Pure unit/property | Canonicalization, parser, renderer, hashes, aggregation, recommendation | Vitest table/property/golden tests |
| Repository contract | Prompt/experiment ports against in-memory fake and SQLite adapter | Shared contract suite with temporary/in-memory DB |
| Migration/fault | Fresh/upgrade/rollback/backup/corrupt/lock scenarios | Temporary files, fault injection, checksum fixtures |
| SDK integration | Prompt lifecycle, planning, cell execution, evidence, decisions | Real packages with mock provider and temp workspace |
| CLI E2E | Prompt and experiment commands/exit codes/exports | Spawned CLI and golden structural output |
| HTTP integration | Fastify contracts, security, lifecycle, SSE, recovery | Injection plus real loopback tests |
| Component | Editor, builder, progress, results, decision, states | React Testing Library, user-event, axe |
| Browser E2E | Portfolio journey, reconnect, cancellation, security behavior | Playwright Chromium/Firefox |
| Compatibility | Existing CLI/SDK/API/Studio/artifact behavior | Normalized semantic comparison |
| Performance | 40-cell plan/result/history/SSE and local startup | Production harness with recorded budgets |
| Manual review | Visual hierarchy, keyboard, zoom, recovery, docs | Signed checklist and screenshots |

## 4. Canonical fixtures

- valid prompt with system/user templates and declared variables;
- line-ending/key-order variants with the same canonical hash;
- invalid tokens, traversal-like identifiers, expression/loop/code-injection strings;
- valid suite with required/optional context and variables;
- two prompt variants × three deterministic mock repetitions;
- four-variant × ten-repetition maximum plan;
- deliberately flaky per-case verdict fixture;
- new CRITICAL regression with improved aggregate average;
- complete, partial, unavailable, and legitimate-zero usage/cost fixtures;
- tied candidate aggregates;
- cancelled, operationally failed, stale, missing, invalid, and hash-tampered artifacts;
- SQLite v1, future-upgrade, checksum-mismatch, interrupted migration, corrupt, and locked database fixtures;
- XSS/HTML/event-handler, SQL-like, secret-canary, absolute-path, and stack-trace payloads;
- legacy v0.1 and Product Phase 2 run/baseline/Studio fixtures.

All default fixtures are synthetic and free. No paid credential is required.

## 5. Detailed test specifications

### Domain, canonicalization, and templates

| Test | Scenario | Expected result | Type |
|---|---|---|---|
| P3-TS-001 | Package dependency boundary scan | `promptops` imports no SQLite/HTTP/React/filesystem/provider SDK; forbidden edges fail | Architecture |
| P3-TS-002 | Runtime below Node 22.13 | Startup fails with actionable runtime message before DB access | Compatibility |
| P3-TS-003 | Object key order differs | Canonical JSON and SHA-256 remain equal | Golden |
| P3-TS-004 | CRLF versus LF template | Canonical hash remains equal after line-ending normalization | Golden |
| P3-TS-005 | Meaningful template whitespace changes | Hash changes; content is not silently trimmed | Boundary |
| P3-TS-006 | Declared variables duplicate or reorder | Duplicates reject; valid reorder canonicalizes deterministically | Contract |
| P3-TS-007 | Allowed placeholders render | System/user/context/variables resolve exactly as specified | Unit |
| P3-TS-008 | Unknown/expression/loop/include placeholder | Publication/plan validation rejects it; no evaluation call occurs | Security |
| P3-TS-009 | Required variable missing in one case | Suite-aware validation identifies case and variable; zero provider calls | Negative |
| P3-TS-010 | Optional context not referenced | Prompt remains valid for case without context | Boundary |
| P3-TS-011 | JavaScript/HTML/SQL-like template text | Treated as inert text; no execution or parser escape | Security |
| P3-TS-012 | Prompt/metadata/rationale exceeds bound | Precise field error; no partial persistence | Boundary |
| P3-TS-013 | Existing run without renderer | Generation request, verdict, artifact, and exit behavior remain compatible | Regression |
| P3-TS-014 | Run with published prompt renderer | Existing `metadata.promptHash` equals published content hash | Integration |

### SQLite, migrations, and prompt lifecycle

| Test | Scenario | Expected result | Type |
|---|---|---|---|
| P3-TS-015 | Default/custom database path | Only server-owned contained path opens; browser cannot select path | Security |
| P3-TS-016 | Database startup pragmas | Foreign keys, WAL, FULL sync, timeout, and disabled extensions are active | Contract |
| P3-TS-017 | SQL metacharacters in all text fields | Bound parameters persist text safely; schema/query is unchanged | Security |
| P3-TS-018 | Fresh empty database | All migrations apply once and integrity checks pass | Migration |
| P3-TS-019 | Supported previous schema | Forward migration preserves prompts/experiments/decisions | Migration |
| P3-TS-020 | Applied migration checksum differs | Startup fails closed with `MIGRATION_FAILED`; no write occurs | Security/Recovery |
| P3-TS-021 | Failure midway through migration | Transaction rolls back and database remains at previous valid version | Fault |
| P3-TS-022 | Existing DB requires first migration | Atomic backup is created and retention rule is enforced | Recovery |
| P3-TS-023 | Corrupt database file | Safe error and recovery guidance; file is not overwritten | Recovery |
| P3-TS-024 | Database remains locked past timeout | `DATABASE_BUSY`; no infinite wait or partial write | Reliability |
| P3-TS-025 | Direct schema constraint violations | Foreign keys/unique/check constraints reject invalid state | Contract |
| P3-TS-026 | Create prompt and initial draft | Stable ID, revision, bounds, and timestamps persist atomically | Repository |
| P3-TS-027 | Two saves use same expected revision | First succeeds; second receives `DRAFT_REVISION_CONFLICT` | Concurrency |
| P3-TS-028 | Draft validation fails | Previous revision remains intact; no invalid content persists | Transaction |
| P3-TS-029 | Concurrent publish attempts | Exactly one monotonic immutable version is created | Concurrency |
| P3-TS-030 | Update/delete published version or republish same content | Mutation rejects; duplicate content hash rejects; history stays intact | Immutability |

### Experiment planning, execution, cancellation, and resume

| Test | Scenario | Expected result | Type |
|---|---|---|---|
| P3-TS-031 | Create draft from published version | Parent lineage is correct and parent content/hash remain unchanged | Repository |
| P3-TS-032 | Create valid experiment draft | Identity, note, project, suite, and policy validate/persist | Integration |
| P3-TS-033 | 1, 2, 4, or 5 variants | 2–4 accepted; below/above bounds rejected | Boundary |
| P3-TS-034 | 0, 1, 10, or 11 repetitions | 1–10 accepted; outside bounds rejected | Boundary |
| P3-TS-035 | Duplicate prompt/target tuple | Plan rejects duplicate variant with actionable error | Validation |
| P3-TS-036 | Dry plan for valid matrix | Exact cells/bounds/hashes return with zero provider calls | Integration |
| P3-TS-037 | Compatibility hash golden vector | Required shared inputs produce stable hash across adapters/platforms | Golden |
| P3-TS-038 | Suite/fixture/evaluator/judge/filter changes after plan | Start rejects `PLAN_STALE`; no silent rebuild | Compatibility |
| P3-TS-039 | Variants use different prompt/model targets | Allowed while shared compatibility inputs remain equal | Contract |
| P3-TS-040 | Cell expansion/order | Baseline first, stable variant order, then repetition index | Determinism |
| P3-TS-041 | Second experiment starts while one active | Rejected with `EXPERIMENT_ALREADY_ACTIVE` | Concurrency |
| P3-TS-042 | Matrix execution concurrency | One cell active; existing per-run case concurrency remains bounded | Concurrency |
| P3-TS-043 | Bundled 2×3 mock experiment | Six parse-valid canonical artifacts with exact prompt hashes and USD 0 | CLI/SDK E2E |
| P3-TS-044 | Provider/cell failure after completed cells | Completed artifacts persist; experiment becomes explicit partial state | Fault |
| P3-TS-045 | Cancel during active cell | New cells stop; active signal aborts; completed/partial evidence persists | Cancellation |
| P3-TS-046 | Resume unchanged partial experiment | Verified completed cells are reused exactly once; remaining cells run | Recovery |
| P3-TS-047 | Missing/invalid/hash-tampered completed artifact | Resume blocks and requires new plan; no silent rerun into old evidence | Security/Recovery |

### Aggregation, recommendation, decision, and export

| Test | Scenario | Expected result | Type |
|---|---|---|---|
| P3-TS-048 | Evidence artifact order differs | Canonical ordered evidence hash remains deterministic | Golden |
| P3-TS-049 | Evidence artifact is missing or hash differs | Aggregate/recommendation fails closed with no decision | Security |
| P3-TS-050 | Valid versus planned repetition coverage | Coverage reflects only verified compatible artifacts | Unit |
| P3-TS-051 | Pass-rate sample set | Mean/min/max/population standard deviation match golden values | Unit |
| P3-TS-052 | Per-case repeated verdicts | Agreement uses maximum verdict count / valid repetitions | Unit |
| P3-TS-053 | More than one verdict for a case | Case is flaky and variant flaky-case rate is correct | Golden |
| P3-TS-054 | Even/odd/single latency samples | Deterministic nearest-rank p50/p95 match specification | Boundary |
| P3-TS-055 | Complete, partial, or absent usage/cost | Availability/coverage is explicit; partial values do not satisfy blocking gate | Unit |
| P3-TS-056 | Complete known zero cost versus unavailable price | Known zero and `UNAVAILABLE` remain distinct | Regression |
| P3-TS-057 | Candidate average improves but new critical case fails | Critical reason precedes averages; result is `KEEP_BASELINE` | Risk gate |
| P3-TS-058 | Fewer than policy minimum valid repetitions | `NO_DECISION` with minimum-evidence reason | Policy |
| P3-TS-059 | Operational error/incompatible/stale evidence | `NO_DECISION`, never quality fail or promotion | Policy |
| P3-TS-060 | Enabled cost/latency gate lacks required coverage | `NO_DECISION` with missing-coverage reason | Policy |
| P3-TS-061 | Candidate exceeds pass-rate/quality regression guard | `KEEP_BASELINE` with ordered reason codes | Policy |
| P3-TS-062 | Candidate violates agreement/flaky guard | `KEEP_BASELINE` with stability reason | Policy |
| P3-TS-063 | Candidate passes all blocking guardrails | `PROMOTE_CANDIDATE` with exact selected variant | Policy |
| P3-TS-064 | Multiple eligible candidates and exact tie | Rank axes apply deterministically; unresolved exact tie returns `NO_DECISION` | Policy |
| P3-TS-065 | Accept recommendation with rationale | Append-only decision binds recommendation and evidence hash | Integration |
| P3-TS-066 | Override recommendation/variant | Non-empty rationale and valid selected variant required; history preserved | Integration |
| P3-TS-067 | Decision submitted after evidence changes | Rejected with `EVIDENCE_HASH_CONFLICT` | Concurrency |
| P3-TS-068 | Promotion-capable decision saved | No baseline or prompt pointer changes automatically | Safety |
| P3-TS-069 | JSON experiment export | Schema-valid plan, cells, aggregates, recommendation, decisions, hashes/references match source | Contract |
| P3-TS-070 | Markdown export of same evidence | Deterministic projection matches JSON semantics and escapes untrusted text | Golden/Security |

### CLI, API, security, progress, and recovery

| Test | Scenario | Expected result | Type |
|---|---|---|---|
| P3-TS-071 | Prompt CLI versus SDK operations | Values/errors/hashes match after approved presentation normalization | Parity |
| P3-TS-072 | Experiment CLI recommendation outcomes | Exit 0/1/2/3/4 map to documented meanings | CLI E2E |
| P3-TS-073 | API body has unknown/path/key/endpoint/SQL field | Strict schema rejects it before domain/database work | Security |
| P3-TS-074 | Invalid Host or cross-origin request | Rejected by existing same-origin controls | Security |
| P3-TS-075 | Mutation lacks valid session/CSRF | Rejected without state change | Security |
| P3-TS-076 | Secret/path/SQL/stack/prompt canaries configured | Absent from problems, SSE, browser data, logs, exports, screenshots | Security |
| P3-TS-077 | Encoded traversal/symlink artifact or database locator | No read/write/disclosure outside configured roots | Security |
| P3-TS-078 | Oversized body/history page/prompt/rationale | Rejected or capped without instability | Boundary |
| P3-TS-079 | SSE normal experiment stream | Monotonic IDs; progress never decreases; terminal snapshot agrees with store | Stream |
| P3-TS-080 | SSE reconnect and replay gap | Buffered events replay once or authoritative snapshot refetches | Stream |
| P3-TS-081 | SSE payload inspection | No template, rendered prompt, case context, response, evidence, secret, SQL, or path | Security |
| P3-TS-082 | Process restarts during RUNNING cell | Startup reconciliation yields explicit recoverable partial state | Recovery |
| P3-TS-083 | History pagination/filter/order | Stable bounded cursor/order and safe summaries across restart | API |
| P3-TS-084 | JSON/Markdown export endpoint | Correct allowlisted format, content type, disposition, redaction | API |
| P3-TS-085 | Prompt draft/API optimistic conflict | `409` with safe code and current revision; no lost update | API |
| P3-TS-086 | Recommendation/decision API stale evidence | `409` with refresh guidance; no append/promotion | API |

### Studio, accessibility, performance, and release

| Test | Scenario | Expected result | Type |
|---|---|---|---|
| P3-TS-087 | Prompt registry/detail keyboard-only | Search, open, edit, and version navigation are fully operable | Accessibility |
| P3-TS-088 | Draft validation/revision conflict | Focus reaches summary/field/conflict action; errors are linked and announced | Accessibility |
| P3-TS-089 | Published prompt detail | Content/hash/lineage are visible and edit controls are absent | Component |
| P3-TS-090 | Experiment builder boundaries | 2–4 variants and 1–10 repetitions enforce accessible inline errors | Component |
| P3-TS-091 | Dry plan with unavailable cost | Exact cells/upper bounds/warnings display; unavailable is not zero | Component |
| P3-TS-092 | Live matrix and SSE reconnect | Active cell/counts/recovered snapshot remain accurate and bounded | Component/E2E |
| P3-TS-093 | Cancel, refresh, and process restart | UI shows partial evidence and eligible recovery action | E2E |
| P3-TS-094 | Critical regression with better average | Critical block/reason appears before aggregate trade-off visualization | E2E |
| P3-TS-095 | Deliberately flaky case | Agreement/flaky evidence and linked repetitions are understandable | E2E |
| P3-TS-096 | Partial/unavailable latency/token/cost | Honest labels and table values; no fabricated zero or misleading chart | Component |
| P3-TS-097 | Variant/repetition link to existing run/case | Canonical view opens; missing artifact produces recoverable state | E2E |
| P3-TS-098 | Accept/override/defer decision | Rationale, selected variant, evidence hash, and conflict UX are correct | E2E |
| P3-TS-099 | JSON and Markdown download | UI downloads same evidence semantics and safe filenames | E2E |
| P3-TS-100 | Empty/loading/error/history pagination states | Semantic, recoverable, keyboard accessible, and bounded | Component |
| P3-TS-101 | XSS/event-handler payload in prompt/note/rationale/export | Display/download remains inert under CSP | Security/E2E |
| P3-TS-102 | Automated accessibility on new routes | Zero critical/serious axe violations | Accessibility |
| P3-TS-103 | Full keyboard journey | Publish → plan → live → result → variant → decision → export without pointer | Manual/E2E |
| P3-TS-104 | 200% zoom, tablet reflow, reduced motion | Content remains usable and state meaning is preserved | Accessibility |
| P3-TS-105 | Maximum 40-cell plan/result/history/SSE | Targets met without unbounded DB transaction, memory, or DOM growth | Performance |
| P3-TS-106 | Full release verification | All legacy/PromptOps gates, docs, audits, portability, fixtures, and evidence pass | Release |

## 6. Canonical parity rules

Parity normalizes only approved nondeterministic presentation fields such as timestamps, generated IDs, duration, absolute temp paths, and database row IDs. It requires semantic equality for:

- prompt canonical content and hash;
- plan, compatibility, policy, artifact, and evidence hashes;
- variant/cell order and lifecycle states;
- run/case/evaluator verdict semantics and gate failures;
- aggregate values, coverage, rounding, quantiles, and flaky case IDs;
- recommendation state, selected variant, and ordered reason codes;
- decision outcome, evidence binding, and rationale requirement;
- availability versus legitimate zero values;
- export schema/projection; and
- redaction/privacy behavior.

Any intentional difference requires an approved ADR and migration/compatibility test.

## 7. Recommendation policy gate

Every branch that produces `NO_DECISION`, `KEEP_BASELINE`, or `PROMOTE_CANDIDATE` requires a named test. Release blocks if:

- a new critical regression can promote;
- operational ERROR becomes quality FAIL;
- missing/partial required metrics pass a blocking gate;
- insufficient repetitions produce a decision;
- a tie selects by row/label order;
- stale/tampered evidence can be accepted; or
- a recommendation/decision mutates a baseline automatically.

## 8. Persistence and recovery gate

Release blocks on:

- migration checksum mismatch not detected;
- interrupted migration leaving partial schema/data;
- missing backup before first upgrade of existing database;
- published prompt mutation/deletion;
- lost-update draft save;
- SQLite containing generation text, evaluator evidence, case context, or raw responses;
- silent artifact rerun/reuse after hash mismatch; or
- corrupt/locked database causing overwrite or indefinite wait.

## 9. Security and privacy gate

Release blocks on:

- SQL injection or arbitrary database/file path access;
- executable prompt/evidence content;
- missing Host/Origin/session/CSRF validation on mutation;
- secret, rendered case prompt, raw response, absolute path, SQL, or stack disclosure;
- unsafe export content/disposition;
- public network binding by default; or
- high/critical dependency vulnerability without approved mitigation.

## 10. Accessibility gate

Automated axe checks cover Prompt Registry, Prompt Detail, Experiment Builder, Live Experiment, Result, Variant Detail, Decision Review, and History. Release also requires evidence for:

- keyboard order, skip/navigation, and visible focus;
- editor validation and conflict focus recovery;
- status/SSE announcements without flooding;
- table equivalents for every chart;
- non-color-only risk/stability meaning;
- 200% zoom and tablet reflow; and
- reduced-motion behavior.

Critical/serious findings block release. Moderate findings need owner/rationale/deferral.

## 11. Performance budgets

| Workload | Target |
|---|---:|
| Plan maximum 4×10 matrix, excluding first file discovery | ≤1 second |
| Query/render 100 history summaries | ≤200 ms on reference hardware |
| Recompute 40-artifact aggregate after artifacts are loaded | ≤500 ms |
| Browser filter/sort 40 repetitions and flaky-case table | ≤200 ms |
| Live progress retained server-side | Existing bounded event policy; no unbounded growth |
| Initial PromptOps route after Studio readiness | ≤2 seconds |

Performance evidence records hardware/runtime and is a regression budget, not a universal benchmark claim.

## 12. Coverage and execution policy

- Global statements, branches, functions, and lines remain at least 80%.
- Parser, canonical hashing, migrations, state transitions, resume validation, recommendation reasons, decision conflicts, SQL/path security, and redaction require targeted branch evidence regardless of global percentage.
- Every PR runs format, lint, typecheck, build, unit/contract/repository/integration tests, existing regressions, dependency audit, and tracked-secret scan.
- Critical mock CLI/API/UI flows run on required CI according to runtime budget.
- Full Firefox, Node/runtime/OS, performance, migration-fault, and manual accessibility matrices may run on merge/release but are mandatory before release.
- Real-provider smoke remains manual/optional with explicit key/model/budget; missing credentials produce an explicit skip.

## 13. Defect severity

| Severity | Definition | Release rule |
|---|---|---|
| Critical | Wrong promotion decision, evidence/history corruption, secret/path/SQL exposure, template code execution | Immediate block |
| High | Core workflow unavailable, unsafe resume, migration/recovery failure, lost evidence, critical accessibility barrier, legacy regression | Block |
| Medium | Recoverable workflow, performance, responsive, or noncritical accessibility defect | Fix or explicit approved deferral |
| Low | Cosmetic/content issue without evidence or decision impact | May defer with owner |

## 14. Entry and exit criteria

### Sprint entry

- Task meets the approved Definition of Ready.
- Required fixtures and P3-TS IDs exist.
- Dependency evidence is merged and green.
- No unresolved architecture, schema, migration, policy, or security decision affects implementation.

### Sprint exit

- Planned vertical outcome is demonstrable.
- Relevant P3-TS specs pass with actual recorded evidence.
- Existing CLI/Studio/artifact/baseline behavior remains green.
- No open Critical/High defect.
- Traceability and execution documentation are current.

### Release exit

- P3-TS-001–106 pass or have an allowed documented noncritical deferral.
- All 14 Product Phase 3 acceptance criteria have evidence.
- Recommendation, persistence/recovery, security/privacy, accessibility, performance, and compatibility gates pass.
- Fresh-clone portfolio experiment meets the approved time/cost target.
- Default provider cost remains USD 0.

## 15. Stage gate

**Status:** `PASSED — OWNER APPROVED`

This strategy became binding with Product Phase 3 Stage 3 approval on 2026-09-21. Test IDs may be split for execution detail, but their risk coverage cannot be silently weakened or removed.
