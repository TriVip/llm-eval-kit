# Product Phase 2 — Sprint 7 Execution Record

**Project:** LLM Evaluation Framework (`llm-eval-kit`)  
**Increment:** Local Evaluation Studio  
**Sprint:** 7 — Secure read-only Studio  
**Execution date:** 2026-09-16  
**Status:** COMPLETED; protected merge pending  
**Implementation commit:** `52b4f7d39e9328584723505066c65217a0528714`  
**Pull request:** [#9 — Secure read-only Local Evaluation Studio](https://github.com/TriVip/llm-eval-kit/pull/9)

## 1. Sprint goal

Deliver the first visual vertical slice without creating a second evaluation engine or exposing filesystem and provider boundaries to the browser. The Studio must start locally, discover only reviewed resources, and render existing canonical evidence in an accessible read-only experience.

## 2. Completed backlog

| Task | Result | Evidence |
|---|---|---|
| UI-T009 | Added Fastify Studio API and loopback composition root | Build, injection tests, runtime startup smoke |
| UI-T010 | Added Host, Origin, session, CSRF, body-limit, CSP and security headers | Negative and authorized-request integration tests |
| UI-T011 | Added canonical project registry | Duplicate, traversal, symlink escape, extension and secret tests |
| UI-T012 | Added schema-valid artifact index with stable opaque IDs | Restart stability, invalid-artifact and raw-response-redaction tests |
| UI-T013 | Added bootstrap, project and artifact read endpoints | Contract, not-found, canary-secret and absolute-path tests |
| UI-T014 | Added React/Vite app, typed Zod client, TanStack Query and router | Production build and component tests |
| UI-T015 | Added application shell, navigation and recoverable states | Landmark, skip-link, empty/error/not-found tests |
| UI-T016 | Added custom accessible design tokens and primitives | axe checks, textual verdicts, visible focus and reduced-motion tests |
| UI-T017 | Added Overview, provider readiness, guided scenarios and artifact entry/detail views | Component tests and real Vite-proxy runtime smoke |

## 3. Security result

- API binds to `127.0.0.1`; no public listener is used.
- Host and Origin are allowlisted. Unknown values return a safe `403` problem.
- Every mutation passes session-cookie and CSRF checks before routing.
- Browser requests contain project/artifact IDs only, never arbitrary paths, endpoints, model overrides, or keys.
- Manifest references and discovered artifacts are canonicalized after symlink resolution and must remain inside their configured roots.
- Only allowlisted extensions and schema-valid run artifacts enter registries.
- Provider secrets and absolute paths are excluded from bootstrap/project/artifact responses.
- Raw provider responses are redacted before artifact detail reaches the browser.

## 4. User experience result

The light technical-minimalist console includes:

- responsive persistent/compact navigation;
- clear read-only and local-only status;
- project, target readiness, suite and guided-scenario panels;
- recent and full artifact indexes;
- canonical run status, selected cases, pass rate and error rate;
- dedicated empty, loading, error and not-found states;
- text plus color verdict semantics;
- visible focus, skip navigation and reduced-motion behavior; and
- no misleading Run button before Sprint 8 lifecycle controls exist.

## 5. Verification evidence

| Gate | Result |
|---|---|
| Full release verification | PASS |
| Automated tests | 156/156 PASS across 32 files |
| Statement coverage | 90.55% |
| Branch coverage | 80.12% |
| Function coverage | 90.69% |
| Line coverage | 92.30% |
| ESLint / Prettier | PASS |
| TypeScript build/typecheck | PASS across 12 buildable workspace projects |
| Dependency audit | PASS; no known high vulnerabilities |
| React production build | PASS; 447.15 kB JS / 138.19 kB gzip before Sprint 10 optimization |
| API + Vite proxy runtime smoke | PASS; bundled project loaded and execution capability disabled |
| CLI portfolio pass/regression | PASS; 64/64 and critical `REFUND_001` evidence unchanged |

## 6. Visual verification limitation

The available cloud browser rejected the workspace loopback URL with `ERR_BLOCKED_BY_CLIENT`, so no screenshot or manual visual-browser pass is claimed. Component DOM, axe, responsive CSS, production build, and live proxy/API smoke all passed. Manual desktop/mobile visual review remains a human gate and must be completed before the final Studio release; it is not silently converted into passing evidence.

## 7. Scope boundary and next step

Sprint 7 is deliberately read-only. It does not start evaluations, stream progress, cancel runs, compare artifacts, or promote baselines. Sprint 8 may begin only after PR #9 passes protected CI and merges. Sprint 8 will connect validate/plan/run, controlled lifecycle state, safe SSE progress, canonical Result/Case views, and the prepared pass/regression demo through UI-T018–UI-T027.
