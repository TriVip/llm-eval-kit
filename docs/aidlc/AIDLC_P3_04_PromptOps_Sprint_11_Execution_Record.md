# Product Phase 3 — Sprint 11 Execution Record

> **Project:** LLM Evaluation Framework (`llm-eval-kit`)  
> **Product increment:** Prompt Experimentation & Decision Support  
> **AIDLC stage:** 4 — Implementation  
> **Sprint:** 11 — Prompt domain and compatibility foundation  
> **Status:** IMPLEMENTED — PROTECTED PR VALIDATION PENDING  
> **Date:** 2026-09-22  
> **Baseline:** Product Phase 3 Stage 3 merge `29b5bc22db8c44dbbfce4688a1e4f61f187e4cf9`

## 1. Scope

Sprint 11 implements only approved tasks P3-T001–P3-T008. SQLite persistence, prompt lifecycle commands/endpoints, experiment orchestration, aggregation, recommendation, decision, and Studio screens remain deferred to their approved later sprints.

## 2. Delivered evidence

| Task | Delivered evidence |
|---|---|
| P3-T001 | Root and adapter runtime contract raised to Node `>=22.13.0`; `promptops` and `promptops-sqlite` workspace packages build independently; runtime guard rejects older Node versions before any database access; dependency-boundary scan protects the pure domain package |
| P3-T002 | Typed prompt/draft/version, experiment/plan/variant, recommendation, human-decision, repository-port, artifact-reader, clock, lifecycle enum, and safe error contracts |
| P3-T003 | Recursive canonical JSON, UTF-8 line-ending normalization, deterministic object ordering, finite-value/cycle rejection, declared-variable normalization, and SHA-256 prompt identity with golden vectors |
| P3-T004 | Fixed non-executable tokenizer/parser for `input.user`, `input.context`, and `variables.<id>`; malformed, expression, traversal, loop, include, duplicate-variable, and 32 KiB boundary controls |
| P3-T005 | Pure suite-aware validation reports exact case/variable failures before execution; renderer performs one inert substitution pass and preserves request variables/context |
| P3-T006 | Core accepts an optional `GenerationRequestRenderer`; legacy runs omit `promptHash` and retain their existing request, while rendered runs write the exact published hash into artifact schema `1.0` |
| P3-T007 | Strict versioned Zod contracts for prompt create/save/publish, bounded plans, recommendation policy/results, human decisions, safe events/problems, and JSON export evidence |
| P3-T008 | Golden prompt/plan plus deliberate flaky-run, tampered-evidence, and secret-canary fixtures; public-schema, hash, tamper, and safe-projection tests |

## 3. Requirement and test traceability

| Evidence group | Covered specifications |
|---|---|
| Architecture/runtime | P3-TS-001–002 |
| Canonical identity | P3-TS-003–006 |
| Safe parser, validation, rendering, and bounds | P3-TS-007–012 |
| Legacy compatibility and rendered canonical run | P3-TS-013–014 |

The implementation covers Sprint 11 stories P3-US-001, P3-US-002, P3-US-005, P3-US-006, P3-US-011–024 contract foundations, P3-US-028, P3-US-032, P3-US-034, and P3-US-035 exactly to the extent assigned by P3-T001–P3-T008. It does not claim later workflow acceptance criteria.

## 4. Local verification evidence

| Gate | Result |
|---|---|
| Automated tests | 226/226 PASS across 43 files |
| Statement coverage | 89.96% |
| Branch coverage | 80.53% |
| Function coverage | 91.53% |
| Line coverage | 91.90% |
| ESLint / Prettier / TypeScript / workspace build | PASS |
| Judge calibration | PASS; 30 deterministic samples, 100% agreement, zero critical false passes |
| Portfolio compatibility | PASS; 64/64 positive run and `REFUND_001` critical regression block |
| Provider policy | PASS; no paid credentials, mock CI remains authoritative |
| Static release verification | PASS for v0.1.0 |

The production web bundle remains 478.80 kB JavaScript / 145.94 kB gzip and 10.98 kB CSS / 3.36 kB gzip. Sprint 11 adds contracts but no PromptOps UI route or browser payload execution.

## 5. Security and compatibility assessment

- Prompt text is parsed by a fixed grammar and never evaluated as JavaScript, an expression, a helper, an include, or a control structure.
- HTML, JavaScript, SQL-like text, and replacement values containing placeholder syntax remain inert text; replacement content is not recursively parsed.
- Prompt validation fails before provider execution when variables or required context are absent.
- API/event contracts reject unknown fields and exclude database paths, raw responses, keys, and provider evidence.
- Canonical hashing rejects unsupported values, cycles, and non-finite numbers instead of silently changing identity.
- `packages/core` has no PromptOps dependency. Without an injected renderer, legacy generation requests and artifacts remain compatible.
- `packages/promptops-sqlite` contains only the runtime boundary in Sprint 11; it does not open or mutate a database.

## 6. Gate status

P3-T001–P3-T008 are implemented and locally verified. Sprint 11 becomes `COMPLETED` only after the protected pull request passes CI and is merged. Sprint 12 is not authorized to start by this execution record alone.
