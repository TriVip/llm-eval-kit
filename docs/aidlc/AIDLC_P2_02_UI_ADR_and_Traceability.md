# Product Phase 2 — UI ADRs and Traceability

> **Project:** LLM Evaluation Framework (`llm-eval-kit`)  
> **AIDLC stage:** 2 — System Design  
> **Status:** PROPOSED  
> **Date:** 2026-09-16

## 1. Architecture Decision Records

### UI-ADR-001 — Shared application SDK

- **Status:** Proposed
- **Decision:** Extract application use cases into `packages/sdk`; CLI and Studio API invoke the same facade.
- **Why:** Prevent scoring/execution drift and make future PromptOps integration possible.
- **Trade-off:** CLI composition must be refactored behind characterization tests.

### UI-ADR-002 — Loopback-only same-origin Studio

- **Status:** Proposed
- **Decision:** Fastify binds to loopback and serves API plus compiled React assets from one origin; Vite proxies API in development.
- **Why:** Reduces deployment/auth scope and enables strict browser security controls.
- **Trade-off:** The increment is not a hosted collaboration product.

### UI-ADR-003 — React/Vite feature architecture

- **Status:** Proposed
- **Decision:** React + TypeScript + Vite, feature folders, React Router, TanStack Query, and feature-scoped live-run state.
- **Why:** Typed, testable UI with a small amount of global state and clear future integration path.
- **Trade-off:** Adds a browser build and frontend dependency surface to the monorepo.

### UI-ADR-004 — Explicit Studio project manifest

- **Status:** Proposed
- **Decision:** A versioned manifest relates config, suites, fixtures, and guided scenarios.
- **Why:** Safe discovery is more reproducible than guessing files or accepting arbitrary browser paths.
- **Trade-off:** Example/custom projects add one small metadata file.

### UI-ADR-005 — ID-based filesystem API

- **Status:** Proposed
- **Decision:** Browser sends opaque registry IDs. Server resolves canonical paths inside startup allowlisted roots.
- **Why:** Avoids arbitrary file read/write and path disclosure.
- **Trade-off:** Files outside registered roots require a server restart with an explicit workspace option.

### UI-ADR-006 — SSE for progress

- **Status:** Proposed
- **Decision:** Use Server-Sent Events with monotonic IDs, bounded replay, snapshot fallback, and safe payloads.
- **Why:** Progress is server-to-client only; SSE is simpler and more inspectable than WebSockets.
- **Trade-off:** Client commands still use HTTP and multi-directional streaming is not supported.

### UI-ADR-007 — Canonical artifacts remain authoritative

- **Status:** Proposed
- **Decision:** UI never recalculates final verdicts, metrics, or gates; it renders SDK artifacts.
- **Why:** Preserves evidence consistency across CLI, HTML, JSON, CI, and Studio.
- **Trade-off:** UI improvements sometimes require backward-compatible artifact additions.

### UI-ADR-008 — Server-only provider credentials

- **Status:** Proposed
- **Decision:** API keys are resolved from environment variables in the Node process. Browser receives readiness only.
- **Why:** Browser storage and network payloads are inappropriate secret boundaries.
- **Trade-off:** Users restart/reconfigure the local process to change credentials.

### UI-ADR-009 — One active Studio run by default

- **Status:** Proposed
- **Decision:** The local Studio registry allows one active run and rejects concurrent starts with `409`.
- **Why:** Predictable resource usage, provider cost, progress, and demo behavior.
- **Trade-off:** Advanced parallel experiments remain CLI/Phase 2 benchmarking scope.

### UI-ADR-010 — Cooperative cancellation with partial evidence

- **Status:** Proposed
- **Decision:** Abort stops new scheduling, cancels supported in-flight calls, preserves completed evidence, and marks artifact operationally incomplete with optional termination metadata.
- **Why:** Cancellation must not fabricate a quality result or discard completed work.
- **Trade-off:** Artifact/session status remains intentionally more nuanced than one enum.

### UI-ADR-011 — Custom design tokens and accessible primitives

- **Status:** Proposed
- **Decision:** CSS Modules/design tokens create the visual identity; accessible unstyled primitives are used only for complex controls.
- **Why:** Avoids a generic dashboard appearance without rebuilding dialog/focus behavior badly.
- **Trade-off:** More deliberate styling work than adopting a complete component theme.

### UI-ADR-012 — No database or authentication

- **Status:** Proposed
- **Decision:** Run history is rebuilt from filesystem artifacts; local Studio has no accounts or RBAC.
- **Why:** Preserves the approved local-only scope and avoids premature SaaS architecture.
- **Trade-off:** No multi-user collaboration, remote access, or database queries.

## 2. Functional requirement traceability

| Requirement | Primary design component | Verification direction |
|---|---|---|
| UI-FR-001 | Studio API composition and startup scripts | Fresh-clone startup E2E |
| UI-FR-002 | Project manifest and registry | Manifest unit/integration tests |
| UI-FR-003 | SDK validation and API endpoint | Zero-provider-call negative test |
| UI-FR-004 | New Run form, contracts, SDK run plan | Component + API boundary tests |
| UI-FR-005 | SDK, run registry, guided pass scenario | 64-case Playwright E2E |
| UI-FR-006 | Bootstrap capabilities and credential resolver | Canary/readiness API tests |
| UI-FR-007 | Safe SDK events, SSE, live reducer | Event contract/reconnect/E2E tests |
| UI-FR-008 | AbortSignal and run lifecycle | Cancellation/fault-injection E2E |
| UI-FR-009 | Canonical artifact view | Golden artifact rendering tests |
| UI-FR-010 | Case explorer presentation state | 500-case search/filter tests |
| UI-FR-011 | Linkable case detail | Redaction/XSS/component tests |
| UI-FR-012 | SDK comparison and Compare screen | Compatibility/regression E2E |
| UI-FR-013 | SDK promotion and optimistic overwrite guard | Conflict/confirmation E2E |
| UI-FR-014 | Artifact index and browser | Root/path/schema negative tests |
| UI-FR-015 | Allowlisted artifact download endpoint | Content-type/path/security tests |
| UI-FR-016 | Review artifact projection | Warning/low-confidence E2E |
| UI-FR-017 | Shared SDK | CLI/API parity suite |
| UI-FR-018 | Problem contract and run lifecycle | Error taxonomy/partial result tests |
| UI-FR-019 | Manifest scenarios and Overview | Pass/regression usability E2E |
| UI-FR-020 | Shared async states and error boundary | Component/a11y/E2E tests |

## 3. Non-functional requirement traceability

| Requirement | Design mechanism | Evidence target |
|---|---|---|
| UI-NFR-001 | Loopback, origin/host/CSRF, ID registry, escaping | Security integration suite |
| UI-NFR-002 | Shared SDK and canonical artifact rendering | Dependency rule + parity tests |
| UI-NFR-003 | Route splitting, indexed summaries, memoized table | Production build timing |
| UI-NFR-004 | SSE batching and bounded UI state | 500-case progress performance |
| UI-NFR-005 | Server-owned sessions and persisted artifacts | Refresh/recovery E2E |
| UI-NFR-006 | Semantic HTML, tokens, primitives, a11y rules | axe + keyboard/manual checklist |
| UI-NFR-007 | Layered Vitest/RTL/Playwright strategy | CI coverage ≥80% |
| UI-NFR-008 | Node 22, Vite build, browser support | Linux CI + documented macOS check |
| UI-NFR-009 | Versioned Zod API contracts and feature boundaries | Typecheck + contract tests |
| UI-NFR-010 | Existing retention/redaction plus safe endpoints | Canary/browser-network test |
| UI-NFR-011 | Correlation IDs and structured safe errors/logs | Log/problem schema tests |
| UI-NFR-012 | Guided manifest scenario and one-command start | Fresh-clone timed usability check |

## 4. Existing decision impact

| Existing ADR | Phase 2 interpretation |
|---|---|
| ADR-001 CLI-first, file-based MVP | CLI remains supported; Studio becomes a second adapter while filesystem remains authoritative |
| ADR-002 TypeScript monorepo | React/API/SDK packages extend the same workspace |
| ADR-003 Provider ports/adapters | Provider logic stays server-side behind SDK |
| ADR-004 Evaluator registry | Studio displays configured evaluators; it does not implement them |
| ADR-005 Deterministic precedence | UI visually preserves rule precedence and failure evidence |
| ADR-006 Score/confidence/verdict/error separation | UI uses separate tokens and labels for each concept |
| ADR-007 Immutable canonical artifact | Studio result rendering consumes the artifact directly |
| ADR-008 Explicit baseline promotion | UI implements guarded explicit promotion only |
| ADR-009 Bounded concurrency/retry | Form overrides are schema bounded by server policy |
| ADR-010 Privacy-safe artifacts | Retention/redaction controls apply to every API response and screen |
| ADR-011 Mock CI | Default Studio E2E remains deterministic and free |

## 5. Dependency rules

Allowed direction:

```text
studio-web → api-contracts
studio-api → api-contracts + sdk
cli        → sdk
sdk        → core/config/providers/evaluators/scoring/artifacts/reporters
```

Forbidden direction:

- `studio-web` → SDK/provider/evaluator/scoring/filesystem packages;
- SDK → Studio API or React;
- existing domain packages → Studio applications;
- reporters → frontend components; and
- browser contracts containing secrets or unrestricted absolute paths.

## 6. Stage 2 review checklist

- [ ] Shared SDK boundary accepted.
- [ ] Studio project manifest accepted.
- [ ] Loopback/same-origin HTTP security accepted.
- [ ] API endpoints and error contract accepted.
- [ ] SSE event contract and lifecycle accepted.
- [ ] Cancellation/partial artifact semantics accepted.
- [ ] Filesystem roots and ID registry accepted.
- [ ] React state, routing, visual, and accessibility choices accepted.
- [ ] All 20 UI-FR and 12 UI-NFR mapped.
- [ ] No UI requirement requires auth, database, or hosted deployment.

## 7. Stage gate

**Status:** `AWAITING APPROVAL`

When approved, UI-ADR-001 through UI-ADR-012 become `Accepted`. Stage 3 may create epics, stories, implementation tasks, detailed test specifications, Definition of Ready/Done, and sprint sequencing. No implementation begins until Stage 3 also passes.
