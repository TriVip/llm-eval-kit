# Product Phase 3 — PromptOps ADRs & Design Traceability

> **Project:** LLM Evaluation Framework (`llm-eval-kit`)  
> **AIDLC stage:** 2 — System Design  
> **Status:** PROPOSED — OWNER REVIEW REQUIRED  
> **Date:** 2026-09-21

## 1. Architecture Decision Records

### P3-ADR-001 — Dedicated PromptOps domain with ports/adapters

- **Status:** Proposed
- **Decision:** Add pure `packages/promptops` domain/application contracts and isolate persistence in `packages/promptops-sqlite`. CLI and Studio compose the same SDK facade.
- **Why:** Prompt lifecycle and experiment policy are product domain logic, not concerns of `core`, React, Fastify, or SQLite.
- **Trade-off:** Two packages and explicit repository ports add structure before feature code.
- **Preserves:** ADR-002, ADR-003, UI-ADR-001, UI-ADR-007.

### P3-ADR-002 — Built-in SQLite behind an isolated adapter

- **Status:** Proposed
- **Decision:** Use [`node:sqlite`](https://nodejs.org/api/sqlite.html) `DatabaseSync` with prepared statements, strict schema, foreign keys, WAL, checksummed forward migrations, and minimum Node `>=22.13.0`.
- **Why:** The bounded single-user control plane needs transactions and queries without an ORM or external native addon.
- **Trade-off:** `node:sqlite` is experimental in Node 22; isolation is mandatory so the adapter can be replaced.
- **Supersedes:** UI-ADR-012 only for PromptOps workflow metadata. Local-only and no-auth constraints remain accepted.

### P3-ADR-003 — Draft/publish prompt lifecycle and content-addressed versions

- **Status:** Proposed
- **Decision:** Drafts are mutable with optimistic revision; publication atomically creates a monotonic immutable version identified by canonical SHA-256.
- **Why:** Experiments must reference exact prompt content and remain reproducible.
- **Trade-off:** Corrections require a new version and cannot edit history.
- **Traces:** P3-FR-001–006; P3-NFR-001–002.

### P3-ADR-004 — Restricted non-executable template grammar

- **Status:** Proposed
- **Decision:** Support only `input.user`, optional `input.context`, and declared `variables.<id>` placeholders. No expressions, logic, includes, helpers, or evaluation.
- **Why:** Deterministic validation and security are more important than template-language power in this increment.
- **Trade-off:** Advanced prompt composition is deferred.
- **Traces:** P3-FR-004–005, P3-FR-010–013; P3-NFR-003–004.

### P3-ADR-005 — Bounded variant tuple and sequential cell orchestration

- **Status:** Proposed
- **Decision:** A variant is an exact published prompt + registered target tuple. One experiment is active and one matrix cell runs at a time; existing engine concurrency applies within the cell.
- **Why:** Prevent multiplicative provider load/cost and preserve the existing single-active-run guarantee.
- **Trade-off:** Real-provider matrices may take longer.
- **Preserves:** ADR-009, UI-ADR-009, UI-ADR-010.

### P3-ADR-006 — Canonical run artifacts remain the evaluation source of truth

- **Status:** Proposed
- **Decision:** Each repetition writes `run.json`; SQLite stores opaque reference, hash, and safe summary only. Aggregation reloads and verifies artifacts.
- **Why:** Avoid conflicting verdicts and retain portable evidence.
- **Trade-off:** Results require filesystem artifacts and may cost more to reload than database blobs.
- **Preserves:** ADR-007, ADR-010, UI-ADR-007.

### P3-ADR-007 — Versioned deterministic stability aggregation

- **Status:** Proposed
- **Decision:** Compute repetition coverage, pass-rate distribution, verdict agreement, flaky cases, and availability-aware latency/usage/cost using pure versioned algorithms.
- **Why:** One successful run is insufficient evidence for non-deterministic systems.
- **Trade-off:** Metrics describe observed bounded runs, not universal statistical certainty.
- **Traces:** P3-FR-018–020; P3-NFR-001, P3-NFR-009.

### P3-ADR-008 — Deterministic recommendation, separate human decision

- **Status:** Proposed
- **Decision:** A pure policy returns only `PROMOTE_CANDIDATE`, `KEEP_BASELINE`, or `NO_DECISION`. A separate append-only human decision with rationale is required; neither action automatically promotes a baseline.
- **Why:** Risk rules must be inspectable and humans remain accountable.
- **Trade-off:** Promotion requires an additional explicit action.
- **Preserves:** ADR-005, ADR-006, ADR-008, UI-ADR-007.

### P3-ADR-009 — Plan/evidence hashes guard execution, resume, and decisions

- **Status:** Proposed
- **Decision:** Freeze a plan hash before execution and bind recommendation/decision records to a verified evidence-set hash. Resume reuses only exact compatible cells.
- **Why:** Prevent stale plans, mixed datasets, artifact substitution, and approval against changed evidence.
- **Trade-off:** Legitimate input changes require a new plan/experiment.
- **Traces:** P3-FR-011–017, P3-FR-021–022; P3-NFR-001, P3-NFR-005.

### P3-ADR-010 — Extend existing loopback HTTP/SSE security model

- **Status:** Proposed
- **Decision:** Use same-origin `/api/v1`, opaque IDs, Host/Origin/session/CSRF enforcement, safe problems, bounded SSE replay, and snapshot fallback.
- **Why:** The Product Phase 2 controls already match the local single-user threat model.
- **Trade-off:** The design remains intentionally unsuitable for hosted multi-user access.
- **Preserves:** UI-ADR-002, UI-ADR-005, UI-ADR-006, UI-ADR-008.

### P3-ADR-011 — Portable index exports, not duplicated run evidence

- **Status:** Proposed
- **Decision:** JSON is the versioned experiment index; Markdown is its deterministic projection. Exports reference verified run artifacts and omit raw/rendered case content.
- **Why:** Decisions need portable evidence without cloning sensitive run payloads into another format.
- **Trade-off:** A standalone export summary cannot replace the linked artifacts for full investigation.
- **Traces:** P3-FR-024; P3-NFR-004, P3-NFR-008.

### P3-ADR-012 — Backward-compatible prompt integration

- **Status:** Proposed
- **Decision:** Extend the runner through an optional pure request-renderer dependency and populate existing `metadata.promptHash`; preserve default behavior and artifact schema `1.0`.
- **Why:** PromptOps needs exact prompt execution without forcing existing users to migrate artifacts or commands.
- **Trade-off:** Prompt ID/version live in the experiment index rather than `run.json` in the first increment.
- **Preserves:** ADR-001–ADR-004, ADR-007, UI-ADR-001.

## 2. Functional requirement traceability

| Requirement | Primary design mechanism | ADR | Verification direction |
|---|---|---|---|
| P3-FR-001 | Prompt repository and registry APIs | 001–003 | Repository/API list/detail tests |
| P3-FR-002 | Prompt + draft transaction | 002–003 | Creation/constraint tests |
| P3-FR-003 | Revision-guarded draft save | 002–003 | Optimistic conflict tests |
| P3-FR-004 | Parser, suite-aware validation | 003–004 | Grammar/missing-variable tests |
| P3-FR-005 | Canonical hash + publish transaction | 002–004 | Golden hash/immutability tests |
| P3-FR-006 | Draft lineage from version | 003 | Lineage and no-mutation tests |
| P3-FR-007 | Experiment aggregate/repository | 001–002 | Identity/schema tests |
| P3-FR-008 | Variant tuple and hard bounds | 005 | 2/4 boundaries and duplicate tests |
| P3-FR-009 | Plan repetitions and cell expansion | 005 | 1/10 and 40-cell tests |
| P3-FR-010 | Registered project/target/suite resolution | 004–005, 010 | Registry/path negative tests |
| P3-FR-011 | Pure planner and frozen plan hash | 009 | Zero-provider-call/stale-plan tests |
| P3-FR-012 | SDK delegation to existing evaluation app | 001, 005, 012 | SDK parity tests |
| P3-FR-013 | Plan snapshot and compatibility hash | 009, 012 | Golden compatibility tests |
| P3-FR-014 | Artifact repository and cell references | 006, 009 | Artifact parse/hash tests |
| P3-FR-015 | Experiment state machine and SSE | 005, 009–010 | Lifecycle/reconnect tests |
| P3-FR-016 | Cooperative cancel and partial evidence | 005–006, 009 | Cancel/fault tests |
| P3-FR-017 | Exact-hash resume protocol | 006, 009 | Restart/tamper/resume tests |
| P3-FR-018 | Artifact-derived risk comparison | 006–008 | Critical/category golden tests |
| P3-FR-019 | Availability-aware metrics | 006–008 | Full/partial/unknown coverage tests |
| P3-FR-020 | Stability aggregator | 007 | Agreement/flaky/distribution tests |
| P3-FR-021 | Recommendation policy v1 | 007–009 | Precedence/tie/property tests |
| P3-FR-022 | Append-only human decision | 002, 008–009 | Rationale/evidence conflict tests |
| P3-FR-023 | Indexed history and linked evidence | 002, 006, 010 | Pagination/filter/drill-down tests |
| P3-FR-024 | JSON/Markdown exporter | 006, 011 | Schema/golden/redaction tests |

## 3. Non-functional requirement traceability

| Requirement | Design mechanism | Evidence target |
|---|---|---|
| P3-NFR-001 | Canonical prompt/plan/compatibility/artifact/evidence hashes | Golden vectors and drift tests |
| P3-NFR-002 | Publish transaction and append-only versions/recommendations/decisions | Update/delete rejection and history tests |
| P3-NFR-003 | Loopback controls, safe paths, prepared SQL, fixed grammar | Security integration suite |
| P3-NFR-004 | References/summaries only in SQLite and redacted exports | Schema inspection and canary tests |
| P3-NFR-005 | Transactions, atomic artifacts, migration protocol, resume checks | Crash/fault/corruption tests |
| P3-NFR-006 | Bounded pure plan, indexed query, evidence-keyed cache | 40-cell plan/result benchmarks |
| P3-NFR-007 | 4-variant/10-repetition cap and one active cell | Boundary and concurrency tests |
| P3-NFR-008 | Optional renderer, existing artifact schema, additive routes/commands | Full legacy regression suite |
| P3-NFR-009 | Shared SDK and versioned contracts/algorithms | CLI/API/UI parity suite |
| P3-NFR-010 | Existing tokens/primitives plus semantic tables/status | axe, keyboard, reduced-motion E2E |
| P3-NFR-011 | Layered unit/contract/integration/E2E/fault tests | Coverage ≥80% and release gate |
| P3-NFR-012 | Correlation hierarchy and safe bounded events | Log/event schema and canary tests |

## 4. Acceptance-criteria traceability

| AC | Design evidence |
|---:|---|
| 1 | P3-ADR-003 plus publish transaction/hash contract |
| 2 | P3-ADR-001/012 shared application facade |
| 3 | Planner hard bounds and P3-ADR-005 |
| 4 | Pure planning boundary and zero-provider-call tests |
| 5 | Mock variant tuple and sequential orchestration |
| 6 | P3-ADR-006 artifact-per-repetition protocol |
| 7 | Lifecycle, cancellation, partial state, and resume design |
| 8 | Recommendation precedence: compatibility/critical risk before averages |
| 9 | P3-ADR-007 verdict agreement/flaky-case algorithm |
| 10 | Availability-aware metric types and guardrail handling |
| 11 | P3-ADR-008 versioned recommendation result/reasons |
| 12 | Append-only human decision plus separate promotion boundary |
| 13 | P3-ADR-011 single export contract and deterministic Markdown |
| 14 | P3-ADR-012 and backward-compatibility section |

## 5. Existing decision impact

| Existing decision | Product Phase 3 impact |
|---|---|
| ADR-001 CLI-first file-based MVP | CLI remains; SQLite adds control metadata only, never evaluation truth |
| ADR-002 TypeScript monorepo | Two typed packages extend the same workspace |
| ADR-003 provider ports/adapters | Prompt rendering occurs before the unchanged provider port |
| ADR-004 evaluator registry | Experiment aggregation consumes artifacts; evaluators are not duplicated |
| ADR-005 deterministic precedence | Critical/deterministic failures block recommendation before averages |
| ADR-006 score/confidence/verdict/error separation | Aggregates preserve each concept and keep ERROR operational |
| ADR-007 immutable canonical artifact | Preserved by P3-ADR-006 |
| ADR-008 explicit baseline promotion | Remains a separate guarded human action |
| ADR-009 bounded concurrency/retry | Cell scheduling is sequential; engine bounds remain active |
| ADR-010 privacy-safe artifacts | SQLite/export cannot bypass retention/redaction |
| ADR-011 mock CI | Default experiment remains mock, deterministic, and free |
| UI-ADR-001 shared SDK | Extended with one PromptOps facade |
| UI-ADR-002 loopback same-origin | Unchanged |
| UI-ADR-005 ID-based filesystem API | Extended to prompt/experiment/artifact IDs |
| UI-ADR-006 SSE | Reused for experiment progress |
| UI-ADR-007 canonical artifacts | Unchanged |
| UI-ADR-008 server-only credentials | Unchanged |
| UI-ADR-009 one active run | Extended to one active experiment/cell |
| UI-ADR-010 cancellation/partial evidence | Reused at experiment and active-cell levels |
| UI-ADR-011 accessible custom design | Unchanged |
| UI-ADR-012 no database/auth | Database clause narrowly superseded; no-auth clause remains accepted |

## 6. Stage 2 review checklist

- [ ] Package boundaries and dependency rules accepted.
- [ ] `node:sqlite` adapter and Node `>=22.13.0` accepted.
- [ ] SQLite schema, migration, backup, and corruption behavior accepted.
- [ ] Draft/publish/hash semantics accepted.
- [ ] Restricted prompt-template grammar accepted.
- [ ] Variant tuple, 4×10 cap, and sequential scheduler accepted.
- [ ] Compatibility, plan, artifact, and evidence hashes accepted.
- [ ] Stability formulas and unavailable-metric handling accepted.
- [ ] Recommendation precedence/defaults accepted.
- [ ] Human decision and separate promotion boundary accepted.
- [ ] API/CLI/Studio extensions accepted.
- [ ] Security/privacy/threat controls accepted.
- [ ] All 24 FR, 12 NFR, and 14 AC mapped.
- [ ] Backward compatibility and existing ADR impact accepted.

## 7. Stage gate

**Status:** `PENDING OWNER REVIEW`

P3-ADR-001 through P3-ADR-012 remain `Proposed`. No Product Phase 3 implementation begins until the owner approves this design and Stage 3 completes backlog, test design, traceability, and sprint planning.
