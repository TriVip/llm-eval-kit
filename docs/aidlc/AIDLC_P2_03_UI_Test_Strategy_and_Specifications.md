# Product Phase 2 — UI Test Strategy and Specifications

> **Project:** LLM Evaluation Framework (`llm-eval-kit`)  
> **AIDLC stage:** 3 — Backlog & Test Design  
> **Status:** REVIEW  
> **Date:** 2026-09-16

## 1. Quality objective

Prove that the Studio is a trustworthy visual adapter over the existing engine: it produces the same canonical decisions as CLI, preserves security and privacy boundaries, remains usable with 500 cases, and makes critical regression evidence accessible without hiding operational uncertainty.

## 2. Highest quality risks

| Risk | Severity | Primary control |
|---|---|---|
| CLI and Studio disagree | Critical | Shared SDK plus parity E2E |
| Browser receives secrets or unrestricted paths | Critical | Server-only credentials, ID registry, canary tests |
| Local API permits arbitrary file read/write | Critical | Canonical roots, symlink/path tests, allowlisted files |
| XSS from model/dataset/artifact content | Critical | Escaped rendering, CSP, malicious-content E2E |
| UI shows incomplete run as quality decision | Critical | Separate session/artifact states and cancellation tests |
| Baseline overwritten accidentally or concurrently | High | Explicit confirmation and expected hash |
| Critical failure hidden by average/chart | High | Risk-first rendering and visual E2E |
| Progress stream loses/duplicates state | High | Ordered events, replay, snapshot fallback |
| 500-case UI freezes | High | Performance gates and bounded rendering |
| Keyboard/screen-reader flow is blocked | High | Component accessibility and manual keyboard review |
| Existing CLI/artifacts break | High | v0.1 compatibility suite on every PR |

## 3. Test layers

| Layer | Scope | Tools/evidence |
|---|---|---|
| Schema/unit | Contracts, reducers, path rules, formatters, SDK pure logic | Vitest, table/property tests |
| Package integration | SDK composition, registries, artifacts, cancellation | Vitest with temp workspace and mock provider |
| HTTP integration | Fastify endpoints/security/lifecycle | Fastify injection and real loopback tests |
| Component | Forms, tables, states, dialogs, accessibility | React Testing Library, user-event, axe |
| Browser E2E | Portfolio journeys and browser security behavior | Playwright |
| Compatibility | CLI/SDK/API canonical equivalence | Golden/structural artifact comparison |
| Performance | Startup, filter/sort, SSE/render load | Production build harness |
| Manual review | Keyboard, visual hierarchy, reduced motion, macOS | Signed checklist and screenshots |

Snapshot tests may support stable structure but cannot replace semantic assertions, keyboard interaction, or canonical artifact checks.

## 4. Test environments and data

### Required environments

- Node.js 22 on Linux CI.
- Current Chromium for every PR E2E.
- Current Firefox in release candidate matrix.
- Current Chrome/Edge and macOS execution evidence before release.
- Mock provider for authoritative default CI.

### Required datasets

- existing 64-case e-commerce passing suite;
- isolated `REFUND_001` 30-day critical regression;
- 500-case generated artifact/suite;
- invalid manifests/configs/suites;
- path traversal and symlink fixtures;
- malicious HTML/event-handler content;
- canary API keys and authorization-like strings;
- cancelled and operationally failed partial runs;
- baseline artifacts with matched/added/removed/changed cases;
- low-confidence human-review artifact; and
- legacy v0.1 canonical artifacts.

No paid credential is required for default tests. Optional live smoke results are labelled separately.

## 5. Detailed test specifications

### Contracts and project registry

| Test | Scenario | Expected result | Type |
|---|---|---|---|
| UI-TS-001 | Valid bundled Studio manifest | All target/suite/fixture/scenario IDs resolve | Contract |
| UI-TS-002 | Duplicate or missing manifest references | Validation fails with precise field path | Negative |
| UI-TS-003 | Manifest path contains traversal | Rejected before file access | Security |
| UI-TS-004 | Manifest path reaches outside root through symlink | Rejected after canonical resolution | Security |
| UI-TS-005 | Unsupported manifest/API schema major | Actionable compatibility error | Contract |
| UI-TS-006 | Browser submits arbitrary path/model/endpoint/key field | Schema rejects unknown/forbidden input | Security |
| UI-TS-007 | Invalid artifact exists under report root | Excluded safely; valid artifacts remain available | Resilience |
| UI-TS-008 | Artifact index rebuild after restart | Stable IDs and valid summaries are restored | Integration |

### Shared SDK and compatibility

| Test | Scenario | Expected result | Type |
|---|---|---|---|
| UI-TS-009 | Existing CLI command characterization | Output, exit code, artifacts, and failure semantics remain compatible | Regression |
| UI-TS-010 | Invalid project validation | Zero provider calls and typed validation result | Integration |
| UI-TS-011 | SDK and CLI 64-case pass | Equivalent canonical metrics/status/gates | Parity |
| UI-TS-012 | SDK and CLI `REFUND_001` regression | Both quality-fail with critical gate | Parity |
| UI-TS-013 | SDK and CLI baseline comparison | Same compatibility/classification/deltas | Parity |
| UI-TS-014 | SDK and CLI promotion | Same source validation and overwrite behavior | Parity |
| UI-TS-015 | SDK progress subscriber throws | Run result remains unaffected; safe operational diagnostic recorded | Fault |
| UI-TS-016 | Abort during 500-case run | New scheduling stops; completed evidence and termination metadata persist | Cancellation |
| UI-TS-017 | Provider ignores abort temporarily | Timeout/control policy prevents indefinite session | Reliability |
| UI-TS-018 | Load legacy v0.1 artifact | Studio renders supported fields without migration/write | Compatibility |

### Local API and security

| Test | Scenario | Expected result | Type |
|---|---|---|---|
| UI-TS-019 | Default server bind | Listens on loopback only | Security |
| UI-TS-020 | Invalid Host header | Request rejected | Security |
| UI-TS-021 | Cross-origin mutating request | Origin/CSRF validation rejects it | Security |
| UI-TS-022 | Valid same-origin request with session token | Accepted without weakening cookie policy | Integration |
| UI-TS-023 | Canary secret configured server-side | Not present in bootstrap, API, SSE, browser storage, logs, screenshots, or artifacts | Security |
| UI-TS-024 | Traversal/encoded traversal artifact request | No file disclosure; safe problem response | Security |
| UI-TS-025 | Symlinked artifact escapes report root | Download/listing rejected | Security |
| UI-TS-026 | Script, SVG, and event-handler payloads in evidence | Displayed as inert text; CSP remains effective | Security/E2E |
| UI-TS-027 | Oversized body/file/case count | Bounded request rejected without server instability | Boundary |
| UI-TS-028 | Internal exception contains stack/path/key | Browser receives redacted problem only | Security |
| UI-TS-029 | Missing provider secret | Readiness false; run validation fails; no fallback to mock | Integration |
| UI-TS-030 | One active run already exists | Second start returns `409 RUN_ALREADY_ACTIVE` | Concurrency |

### API lifecycle and progress

| Test | Scenario | Expected result | Type |
|---|---|---|---|
| UI-TS-031 | Bootstrap and project endpoints | Match versioned schemas and contain only safe metadata | Contract |
| UI-TS-032 | Validate invalid/valid selection | Field errors or success; no unintended provider call | API |
| UI-TS-033 | Run plan with filters | Selected cases/calls/known cost match engine plan | API |
| UI-TS-034 | Start pass run | Returns run ID; lifecycle reaches completed with artifact links | E2E |
| UI-TS-035 | SSE normal stream | Event IDs increase and progress never decreases | Stream |
| UI-TS-036 | SSE reconnect with `Last-Event-ID` | Missing buffered events replay once in order | Stream |
| UI-TS-037 | SSE replay buffer gap | Client receives/refetches authoritative snapshot | Stream |
| UI-TS-038 | SSE payload inspection | No prompt/context/response/secret/provider body | Security |
| UI-TS-039 | Cancel running evaluation | Lifecycle reaches cancelled; artifact operationally incomplete | E2E |
| UI-TS-040 | Refresh during/after run | Route restores session snapshot or persisted result | Resilience |
| UI-TS-041 | Allowlisted artifact download | Correct file, content type, disposition, and redaction | API |
| UI-TS-042 | Missing/stale run or artifact ID | Recoverable `404` state; no silent redirect | API/UI |

### Frontend behavior and accessibility

| Test | Scenario | Expected result | Type |
|---|---|---|---|
| UI-TS-043 | Overview first visit | Purpose, pass/regression scenarios, readiness, and recent evidence are understandable | Component/E2E |
| UI-TS-044 | New Run keyboard-only | Registered selections, filters, validation, and plan are operable | Accessibility |
| UI-TS-045 | Form validation failure | Focus reaches summary/field; errors are linked and announced | Accessibility |
| UI-TS-046 | Live progress | Preliminary state is labelled; updates are announced without flooding | Component/E2E |
| UI-TS-047 | Canonical result rendering | UI values equal artifact; filters do not mutate totals | Golden |
| UI-TS-048 | Critical regression result | Critical evidence and gate reason precede aggregate charts | E2E |
| UI-TS-049 | Case explorer filters | ID/verdict/category/severity/evaluator/tag combinations are correct | Component |
| UI-TS-050 | Case detail with unavailable/redacted data | Shows honest placeholder and safe evidence, never fabricated zero/raw value | Component |
| UI-TS-051 | Quality fail vs operational error | Distinct labels, tokens, explanations, and recovery actions | Component |
| UI-TS-052 | Compare baseline/candidate | Compatibility, classifications, deltas, and critical regression are accessible | E2E |
| UI-TS-053 | Baseline overwrite | Separate confirmation; stale expected hash produces conflict UX | E2E |
| UI-TS-054 | Human-review queue | Warning/confidence/reason/export are accurate | E2E |
| UI-TS-055 | Loading/empty/error/not-found states | Semantic, recoverable, and keyboard accessible | Component |
| UI-TS-056 | Automated accessibility scan | Zero critical/serious violations on key routes | Accessibility |
| UI-TS-057 | Manual keyboard/focus journey | Complete New Run → Result → Case → Compare without pointer | Manual gate |
| UI-TS-058 | Reduced motion | Nonessential animation is removed; state remains understandable | Accessibility |

### Performance, portability, and release

| Test | Scenario | Expected result | Type |
|---|---|---|---|
| UI-TS-059 | Production local startup | Page usable ≤2 seconds after server readiness on reference hardware | Performance |
| UI-TS-060 | Filter/sort 500 cases | Interaction completes ≤200 ms on reference hardware | Performance |
| UI-TS-061 | 500-case progress event burst | UI stays responsive; updates remain accurate and bounded | Performance |
| UI-TS-062 | Large redacted logs | Stream/download; no unbounded DOM rendering | Performance |
| UI-TS-063 | Chromium/Firefox current | Critical flows behave consistently | Browser |
| UI-TS-064 | Linux/macOS startup | Documented commands and filesystem behavior work | Portability |
| UI-TS-065 | Fresh clone timed demo | Mock pass and regression story start/complete within 10 minutes | Usability |
| UI-TS-066 | Full v0.1 regression | Existing 115+ tests, CLI workflows, reports, and examples remain green | Compatibility |
| UI-TS-067 | Dependency/secret/audit gates | No high vulnerability or tracked/generated secret leakage | Release |
| UI-TS-068 | Production packaging | `studio:start` serves compiled assets and prints safe local metadata | Release |

## 6. Canonical parity rules

Parity does not require byte-identical timestamps, run IDs, paths, or duration. Comparison normalizes approved nondeterministic fields, then requires equality for:

- selected case IDs and order;
- case verdicts, evaluator verdicts, reasons, and evidence semantics;
- run status and gate failure codes/affected cases;
- category and aggregate counts/rates;
- compatibility and classification results;
- availability semantics for token/cost values; and
- raw-response retention/redaction behavior.

Any intentional semantic difference requires an approved ADR and migration test.

## 7. Accessibility gate

Automated axe checks run on Overview, New Run, Live Run, Result, Case Detail, Compare, Review, and Artifacts. Release also requires manual evidence for:

- keyboard order and visible focus;
- modal focus trap/restore;
- validation and status announcements;
- table/chart alternatives;
- 200% zoom and tablet reflow;
- high-contrast verdict comprehension; and
- reduced-motion behavior.

Critical or serious accessibility findings block release. Moderate findings require an owner and approved deferral.

## 8. Security gate

Release blocks on:

- any secret/canary in browser/network/log/artifact/screenshot evidence;
- arbitrary file read/write or symlink escape;
- executable untrusted content;
- missing Host/Origin/CSRF enforcement on mutation;
- public network binding by default;
- shell command execution from Studio input;
- baseline overwrite without expected hash; or
- high/critical dependency vulnerability without approved mitigation.

## 9. Coverage and CI policy

- Global statements/branches/functions/lines remain ≥80%.
- SDK, registry/path controls, API security, lifecycle, cancellation, and baseline guard require targeted meaningful coverage; global percentage cannot excuse missing critical branches.
- Every PR runs existing CLI suite, package tests, component tests, Chromium critical E2E, lint, format, typecheck, build, audit, and secret scan.
- Performance and Firefox matrix may run on merge/release if runtime is material, but their release evidence is mandatory.
- Paid provider tests are manual/optional and never gate deterministic CI unless secrets and explicit budget are configured.

## 10. Defect severity

| Severity | Definition | Release rule |
|---|---|---|
| Critical | Secret/file exposure, XSS, wrong quality decision, baseline corruption | Immediate block |
| High | Core flow unavailable, cancellation loses evidence, critical a11y barrier, parity regression | Block |
| Medium | Recoverable workflow or responsive/accessibility defect | Fix or explicit approved deferral |
| Low | Cosmetic/content issue without decision impact | May defer with owner |

## 11. Entry and exit criteria

### Sprint entry

- Task meets Definition of Ready.
- Required fixtures and test IDs exist.
- Previous dependency evidence is green.
- No unresolved security/schema decision affects implementation.

### Sprint exit

- Planned vertical outcome is demonstrable.
- Relevant UI-TS specs pass with recorded evidence.
- Existing CLI and artifact tests remain green.
- No open Critical/High defect.
- Traceability and documentation are updated.

### Release exit

- UI-TS-001–068 pass or have an allowed, documented noncritical deferral.
- All 12 UI acceptance criteria have evidence.
- Accessibility and security gates pass.
- CLI/Studio parity and v0.1 compatibility pass.
- Fresh-clone demo meets the time target.
- Default provider cost remains USD 0.

## 12. Stage gate

**Status:** `AWAITING APPROVAL`

This strategy becomes binding for implementation after Stage 3 approval. Test IDs may be split for execution detail but their risk coverage cannot be silently removed.
