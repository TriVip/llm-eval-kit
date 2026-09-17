# Product Phase 2 — Post-Sprint 7 Safety Hotfix Record

**Project:** LLM Evaluation Framework (`llm-eval-kit`)  
**Execution date:** 2026-09-16  
**Status:** COMPLETED; protected merge passed
**Branch:** `fix/post-sprint7-safety`  
**Remote implementation commit:** `e4693791ce62c4ea523a31720c91e6faa947d1de`  
**Pull request:** [#10 — Redact reports and close concurrency race](https://github.com/TriVip/llm-eval-kit/pull/10)
**Merge commit:** `c01f0c0890969ca0be516d5b865b8840f240f342`

## 1. Trigger

Two user-supplied patches identified three post-Sprint 7 risks:

1. `llmeval report` could render raw model response content loaded from an existing artifact.
2. `ConcurrencyLimiter` released a slot before a queued waiter resumed, allowing a fresh caller to enter the handoff window.
3. The merged branch used TypeScript 7.0.2 while `typescript-eslint` 8.70 declares TypeScript support below 6.1.

The patches were treated as review input rather than applied blindly because they overlapped and one included a generated lockfile.

## 2. Implemented corrections

- `executeReport` now applies central artifact redaction before both terminal and HTML rendering.
- `ConcurrencyLimiter` keeps the active slot reserved and transfers ownership directly to the next queued waiter.
- TypeScript is pinned to 6.0.3 and the pnpm lockfile is regenerated from the workspace manifest.
- The supplied randomized concurrency test was replaced with deterministic microtask scheduling plus a sustained 200-task overlap test.
- CLI regression coverage proves ordinary raw response text and structured provider payloads do not appear in terminal or HTML output.

## 3. Verification evidence

| Gate | Result |
|---|---|
| Full release verification | PASS |
| Automated tests | 160/160 PASS across 32 files |
| Statement coverage | 90.41% |
| Branch coverage | 80.17% |
| Function coverage | 91.53% |
| Line coverage | 92.12% |
| ESLint / Prettier | PASS |
| TypeScript build/typecheck | PASS across 12 buildable workspace projects |
| Dependency audit | PASS; no known vulnerabilities |
| Portfolio pass/regression demos | PASS; 64/64 and critical `REFUND_001` evidence unchanged |

## 4. Scope decision

This was a corrective hotfix, not Sprint 8 scope. It changed no public CLI command, artifact schema, Studio API contract, scoring rule, or baseline behavior. PR #10 passed protected CI and merged before Sprint 8 began.
