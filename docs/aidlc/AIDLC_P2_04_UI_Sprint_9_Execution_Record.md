# Product Phase 2 — Sprint 9 Execution Record

**Project:** LLM Evaluation Framework (`llm-eval-kit`)

**Execution date:** 2026-09-17

**Status:** COMPLETED locally; pull request pending

**Branch:** `ui-sprint9`

**Scope:** UI-T028–UI-T037

## 1. Sprint outcome

The Local Evaluation Studio now supports the control and regression workflows that were deliberately deferred from the first run slice:

1. cooperative cancellation that stops new scheduling and preserves partial canonical evidence;
2. candidate-versus-baseline comparison through the existing SDK engine;
3. explicit baseline promotion with two-step confirmation and optimistic hash protection;
4. human-review discovery linked to canonical case evidence;
5. allowlisted artifact retrieval without browser-supplied filesystem paths;
6. server-only real-provider readiness; and
7. explicit disconnected, loading, empty, conflict, and recovery states.

No scoring, comparison, or baseline decision is reimplemented in React.

## 2. Completed tasks

| Task | Delivered evidence |
|---|---|
| UI-T028 | Caller-owned `AbortSignal`, provider/evaluator propagation, stopped scheduling, `EVALUATION_CANCELLED`, and optional termination metadata |
| UI-T029 | CSRF-protected cancel endpoint, `CANCELLING`/`CANCELLED` session states, safe progress preservation, idempotent terminal behavior, and Live Run action |
| UI-T030 | ID-only comparison API over registered redacted artifacts using `EvaluationApplication.compare` |
| UI-T031 | Accessible Compare screen with compatibility errors, classification, category deltas, and critical regression evidence |
| UI-T032 | Baseline store with explicit promotion, completeness checks, existing-baseline hash, and stale-hash rejection |
| UI-T033 | Reviewed-run confirmation, separate overwrite confirmation, current-hash display, and conflict recovery UX |
| UI-T034 | Human-review index and Review screen for model-based warning evidence |
| UI-T035 | Allowlisted `run-json`, `human-review`, `html-report`, and `redacted-logs` retrieval with safe content metadata and root containment |
| UI-T036 | Server-only credential readiness and pre-execution rejection for unconfigured real providers |
| UI-T037 | Loading/empty/error states plus explicit SSE disconnect notice, snapshot refresh, and reconnect action |

## 3. Safety and semantic guarantees

- Cancellation remains cooperative: in-flight provider work receives an abort signal, retries stop, and unscheduled cases become explicit cancellation errors.
- A cancelled run is a `CANCELLED` Studio session but its canonical partial artifact remains `OPERATIONAL_FAILED` with termination metadata.
- Cancelled or operationally incomplete artifacts cannot become baselines.
- Baselines never update after a run. Promotion is a separate mutation and overwrite requires the exact current SHA-256 hash observed during confirmation.
- Comparison uses compatible canonical artifacts and the existing core classification/regression rules.
- API requests accept opaque artifact IDs, project IDs, and suite IDs only; the browser never submits filesystem paths.
- Companion files are resolved relative to an already indexed run, canonicalized after symlink resolution, bounded by size, and restricted to reviewed filenames.
- Downloaded `run.json` is the server-redacted artifact; raw provider response text remains omitted.
- Real-provider credentials remain in the Node environment. Browser-visible contracts expose readiness booleans only.

## 4. Verification evidence

| Gate | Result |
|---|---|
| Automated tests | 186/186 PASS across 34 files |
| Statement coverage | 89.57% |
| Branch coverage | 80.44% |
| Function coverage | 90.58% |
| Line coverage | 91.70% |
| ESLint / Prettier | PASS |
| TypeScript build/typecheck | PASS across 12 buildable workspace projects |
| Dependency audit | PASS; no known vulnerabilities |
| Judge calibration | PASS; 30 deterministic samples, 100% agreement, 0 critical false passes |
| Portfolio pass demo | PASS; 64/64 cases and exit 0 |
| Critical regression demo | PASS; `REFUND_001` blocked with exit 1 |
| Provider smoke policy | PASS; paid-provider checks skipped because no live credentials were present |
| Static release verification | PASS for v0.1.0 |

The Vite production bundle is 474.78 kB JavaScript (144.75 kB gzip) and 10.98 kB CSS (3.36 kB gzip). Vite emitted only upstream Zod annotation warnings and completed successfully.

## 5. AIDLC gate assessment

Sprint 9 Definition of Done is satisfied locally for UI-T028–UI-T037. Contract, lifecycle, cancellation, comparison, baseline conflict, review, provider-readiness, download-boundary, accessibility-component, and recovery behaviors have automated evidence.

Protected PR #12 passed its required checks and was squash-merged as `2faf099ffc0faed3514204441fce6bff523fc52b`. Manual current-Chromium/Firefox keyboard and focus journeys, full threat-model reruns, bundle/startup optimization, supported-platform verification, production packaging, documentation refresh, and release-candidate evidence remain Sprint 10 scope.

## 6. Next authorized scope

Sprint 10 is authorized with UI-T038–UI-T045. Product Phase 2 is not complete until that hardening and release sprint passes its final gate.
