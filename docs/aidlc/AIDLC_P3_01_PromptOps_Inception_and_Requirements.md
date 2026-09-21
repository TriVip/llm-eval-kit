# Product Phase 3 — PromptOps Inception and Requirements

> **Document status:** REVIEW  
> **Date:** 2026-09-21  
> **Product increment:** Local Prompt Experimentation and Decision Support  
> **Approved direction:** PromptOps experiments  
> **Deployment boundary:** Local-first with SQLite

## 1. Executive summary

Product Phase 3 evolves LLM Eval Studio from a run-and-investigate console into a local PromptOps experimentation system. A QA engineer or AI application developer can create immutable prompt versions, compare prompt/model variants against one evaluation suite, measure repeated-run stability, and select a winner using quality, risk, latency, token usage, and cost evidence.

The existing evaluation engine remains authoritative. Phase 3 orchestrates experiments around it; it does not duplicate evaluator, scoring, comparison, or quality-gate logic.

## 2. Problem statement

Phase 2 can execute and compare canonical evaluation runs, but prompt and model decisions still require manual coordination:

1. Prompt text and versions are not managed as first-class entities.
2. A/B or matrix experiments require multiple separate runs and manual result assembly.
3. One successful run can hide probabilistic instability.
4. Quality, cost, latency, and business risk are not combined into one decision view.
5. Experiment history and rationale are difficult to reproduce.
6. Pull requests do not receive a concise, portable experiment summary.

Without an experiment layer, teams can test individual changes but cannot consistently answer: “Which prompt/model variant should we release, and how confident are we?”

## 3. Product goal

Deliver a local PromptOps workflow that turns a prompt or model change into a reproducible experiment with an explicit decision:

**Prompt versions + dataset + targets + repeats → canonical runs → paired comparison → stability and efficiency metrics → reviewed winner or no-decision outcome.**

## 4. Target users

| Persona | Primary need | Phase 3 value |
|---|---|---|
| QA / AI Quality Engineer | Design reliable prompt regressions | Repeatable matrix runs, risk gates, flakiness evidence |
| Prompt Engineer | Compare prompt versions | Immutable versions, paired A/B results, winner rationale |
| AI Application Developer | Validate model/prompt changes | One experiment definition and portable CI summary |
| Engineering Lead | Approve release trade-offs | Quality-cost-latency view with critical-risk precedence |
| Recruiter / interviewer | Understand engineering depth quickly | Guided experiment showing evidence-based AI release decisions |

## 5. Product principles

1. **Evaluation engine remains authoritative:** PromptOps consumes canonical SDK outputs.
2. **Risk before averages:** a critical regression cannot be hidden by lower cost or better average score.
3. **No automatic winner when evidence is insufficient:** ties, operational errors, low confidence, or excessive flakiness produce `NO_DECISION`.
4. **Immutable versions:** a prompt version used in an experiment cannot be edited in place.
5. **Reproducibility:** experiment definitions, version hashes, engine inputs, and output artifact references are recorded.
6. **Local-first:** one user, one local workspace, loopback-only server, no authentication.
7. **SQLite is control-plane storage:** canonical `run.json` files remain immutable evaluation evidence.
8. **Explicit promotion:** selecting a winning prompt version always requires human confirmation.
9. **Honest cost semantics:** unavailable token/cost data remains unavailable, never zero.
10. **Mock-first portfolio:** the principal demo is deterministic, free, and CI-safe.

## 6. Primary journeys

### Journey A — Create prompt versions

1. Open a registered prompt.
2. Create a draft from the current version.
3. Edit system/user templates and metadata.
4. Validate required variables and size limits.
5. Publish an immutable version with a content hash and change note.

### Journey B — Run a prompt A/B experiment

1. Select baseline and candidate prompt versions.
2. Select one evaluation suite and target model.
3. Choose case filters, repeat count, concurrency, and cost budget.
4. Review the expanded run plan before provider calls.
5. Execute paired runs and observe bounded progress.
6. Inspect quality, critical risks, latency, cost, and stability.
7. Record `PROMOTE_CANDIDATE`, `KEEP_BASELINE`, or `NO_DECISION` with rationale.

### Journey C — Benchmark a prompt/model matrix

1. Select up to four prompt/model variants for the MVP.
2. Run the same selected cases and repeat policy for every variant.
3. Rank only variants that pass required quality and reliability gates.
4. Compare Pareto-efficient options rather than relying on one blended score.
5. Export a Markdown/JSON experiment summary.

### Journey D — Reproduce historical evidence

1. Open experiment history.
2. Inspect immutable definition, prompt hashes, target identities, suite hash, repeats, and referenced artifacts.
3. Re-run as a new experiment; historical evidence is never mutated.

## 7. Scope

### Must have

- Local SQLite database with versioned migrations and recoverable startup behavior.
- Prompt registry with templates, metadata, variables, immutable published versions, hashes, and change notes.
- Draft-to-published lifecycle; published versions cannot be edited or deleted while referenced.
- Experiment definitions for A/B and bounded prompt/model matrices.
- Dry-run expansion showing variant count, selected cases, repeats, maximum provider calls, and cost availability.
- Paired execution through the existing SDK with canonical artifact per run.
- Repeat policy and stability/flakiness metrics.
- Comparison of quality, critical failures, latency, tokens, and estimated cost.
- Decision state: `PROMOTE_CANDIDATE`, `KEEP_BASELINE`, or `NO_DECISION`.
- Explicit human confirmation and rationale for winner promotion.
- Experiment history, detail, filtering, and reproducibility metadata.
- Markdown and JSON experiment summaries suitable for GitHub job summaries.
- Guided offline pass, regression, cost-trade-off, and flaky-variant scenarios.
- Backward compatibility for existing CLI, Studio, artifacts, and provider behavior.
- Security, accessibility, migration, parity, and performance verification.

### Should have

- Dataset/suite catalog that indexes existing reviewed files and their hashes.
- Prompt-variable preview using synthetic test-case data.
- Configurable repeat count from 1–10 with safe defaults.
- Cancellation that stops unscheduled variant runs and preserves completed artifacts.
- Pareto-frontier presentation for quality, cost, and latency.
- Notes/tags for experiments and decisions.
- Export/import of experiment definitions without secrets.

### Could have

- CSV export of aggregate comparison metrics.
- Read-only static experiment snapshot.
- Dark theme.
- Configurable retention/archival for derived database records.
- Manual label for externally reviewed results.

### Out of scope

- Hosted SaaS, public deployment, authentication, RBAC, organizations, or billing.
- Cloud database or remote artifact storage.
- Real-time multi-user editing or approvals.
- Full GitHub App, bot installation, or automatic PR commenting.
- Autonomous prompt generation or optimization.
- RAG retrieval evaluation.
- AI-agent/tool execution evaluation.
- Fine-tuning, training, or model deployment.
- Arbitrary SQL, filesystem browsing, or shell execution from the browser.
- Replacing canonical run artifacts with database-only evidence.

## 8. Functional requirements

| ID | Requirement | Priority | Acceptance summary |
|---|---|---|---|
| P3-FR-001 | Initialize local PromptOps workspace | Must | One command creates/opens the reviewed SQLite database and applies safe migrations |
| P3-FR-002 | Register prompts | Must | User can create a prompt with stable ID, name, purpose, tags, and declared variables |
| P3-FR-003 | Manage prompt drafts | Must | Draft content can be edited and validated without affecting published versions |
| P3-FR-004 | Publish immutable prompt versions | Must | Publish creates sequential version, SHA-256 content hash, timestamp, and change note |
| P3-FR-005 | Prevent referenced-version mutation | Must | Published/referenced content cannot be edited or silently deleted |
| P3-FR-006 | Preview prompt rendering | Should | Synthetic case input renders declared variables; missing/unknown variables fail safely |
| P3-FR-007 | Index evaluation suites | Should | Catalog shows stable suite ID, case count, categories, severities, and definition hash |
| P3-FR-008 | Define A/B experiments | Must | Baseline and candidate use the same suite, filters, target, and repeat policy |
| P3-FR-009 | Define bounded matrix experiments | Must | Up to four prompt/target variants are validated before execution |
| P3-FR-010 | Plan experiment cost and calls | Must | Dry run reports variants × selected cases × repeats and honest cost availability with zero provider calls |
| P3-FR-011 | Enforce execution budgets | Must | Provider-call, concurrency, timeout, retry, and configured cost bounds block unsafe starts |
| P3-FR-012 | Execute through shared SDK | Must | Every cell produces an existing-schema canonical run artifact without duplicate scoring logic |
| P3-FR-013 | Repeat runs | Must | Each variant executes 1–10 paired repetitions with deterministic mock support |
| P3-FR-014 | Measure stability | Must | Per-case verdict agreement, flip rate, run agreement, and operational-error rate are reported |
| P3-FR-015 | Compare experiment variants | Must | Quality gates, critical failures, matched case outcomes, latency, tokens, and cost are comparable |
| P3-FR-016 | Determine decision eligibility | Must | Only reliable quality-passing variants are rank-eligible; otherwise result is `NO_DECISION` |
| P3-FR-017 | Present Pareto-efficient variants | Should | UI identifies non-dominated quality/cost/latency choices without hiding risk |
| P3-FR-018 | Record explicit decision | Must | Human selects promotion/keep/no-decision and supplies rationale; no automatic promotion occurs |
| P3-FR-019 | Promote prompt winner | Must | Promotion changes the active prompt pointer only after confirmation and expected-current-version check |
| P3-FR-020 | Preserve experiment history | Must | Definition, hashes, state transitions, decisions, and artifact references remain queryable |
| P3-FR-021 | Reproduce an experiment | Must | Re-run clones immutable definition into a new experiment and reports unavailable dependencies |
| P3-FR-022 | Export experiment evidence | Must | JSON and Markdown summaries contain no secrets/raw responses and link run artifact IDs |
| P3-FR-023 | Provide guided demos | Must | Offline scenarios demonstrate safe improvement, critical regression, cost trade-off, and flakiness |
| P3-FR-024 | Preserve existing interfaces | Must | Current CLI/SDK/Studio flows and v0.1 artifact schemas remain backward compatible |

## 9. Non-functional requirements

| ID | Requirement | Target |
|---|---|---|
| P3-NFR-001 | Security | Loopback-only; parameterized SQL; schema/path allowlists; no secrets in SQLite, UI, exports, logs, or artifacts |
| P3-NFR-002 | Evidence integrity | Canonical run artifacts are immutable; DB references include run ID and artifact/content hashes |
| P3-NFR-003 | Migration safety | Migrations are transactional, ordered, idempotent where applicable, and backup/recovery is documented |
| P3-NFR-004 | Reliability | Crash/restart cannot mark an unfinished experiment as successful; partial artifacts remain discoverable |
| P3-NFR-005 | Performance | History/filter queries over 10,000 experiment-run references complete within 300 ms on reference hardware |
| P3-NFR-006 | Responsiveness | A 4-variant × 64-case × 3-repeat mock experiment does not freeze Studio progress views |
| P3-NFR-007 | Accessibility | New screens maintain WCAG 2.2 AA targets and keyboard-only critical journeys |
| P3-NFR-008 | Compatibility | Node.js 22, current Chromium/Firefox, macOS/Linux, existing CLI exit codes and artifact readers |
| P3-NFR-009 | Testability | Global coverage remains at least 80%; decision, migration, parity, and budget logic have direct tests |
| P3-NFR-010 | Privacy | Prompt previews and exports respect raw-response retention and redaction policy |
| P3-NFR-011 | Maintainability | Versioned contracts and repository boundaries prevent UI/SQLite code from owning evaluation semantics |
| P3-NFR-012 | Observability | Experiment, cell, repetition, run, and request correlation IDs are present in safe events and errors |

## 10. Experiment semantics

### Experiment states

`DRAFT → PLANNED → RUNNING → COMPLETED | CANCELLED | OPERATIONAL_FAILED`

A completed experiment may then receive a decision:

`UNREVIEWED → PROMOTE_CANDIDATE | KEEP_BASELINE | NO_DECISION`

Execution state and human decision state are separate.

### Stability metrics

- **Verdict agreement:** share of repeated case executions with the modal verdict.
- **Flip rate:** share of cases producing more than one quality verdict across repeats.
- **Run agreement:** share of repetitions with the modal run status.
- **Operational error rate:** executions ending in `ERROR` or an unreliable run state.
- **Critical stability:** any critical case flip is shown separately and blocks automatic ranking eligibility.

Exact formulas and thresholds are Stage 2 design decisions. Stage 1 requires metrics to be reproducible, paired, and never inferred from missing repetitions.

### Decision ordering

1. Validate compatibility and completeness.
2. Exclude operationally unreliable variants.
3. Apply existing critical and quality gates.
4. Apply stability requirements.
5. Compare quality among eligible variants.
6. Present cost and latency trade-offs/Pareto frontier.
7. Require human decision and rationale.

No weighted “magic score” may override a critical failure.

## 11. Data ownership boundaries

| Data | Owner / source of truth |
|---|---|
| Prompt drafts, published versions, active-version pointer | SQLite control plane with migrations and integrity constraints |
| Experiment definitions, lifecycle, decisions, tags, artifact references | SQLite control plane |
| Suite and target definitions | Existing reviewed project/config files |
| Evaluation results and case evidence | Canonical immutable `run.json` artifacts |
| Human-review queue | Existing canonical review artifacts |
| Derived tables/charts | Rebuildable projection from SQLite metadata plus canonical artifacts |
| Provider credentials | Server environment only |

SQLite corruption or deletion may lose PromptOps metadata, but must not invalidate existing canonical evaluation artifacts. Backup/export and reconciliation behavior will be designed in Stage 2.

## 12. Acceptance criteria

1. A new user can start PromptOps locally and complete the guided A/B mock demo within 10 minutes.
2. A prompt draft can be published as an immutable, content-hashed version.
3. Editing a published or experiment-referenced version is rejected.
4. Dry-run planning makes zero provider calls and accurately expands variants × cases × repeats.
5. A two-prompt experiment produces canonical run artifacts whose semantics match equivalent SDK execution.
6. A critical candidate regression produces `KEEP_BASELINE` eligibility and cannot be masked by lower cost/latency.
7. A flaky candidate exceeding the approved stability threshold produces `NO_DECISION`.
8. Missing token or pricing data is displayed as unavailable and cannot make a variant appear free.
9. Prompt promotion requires confirmation, rationale, and expected-current-version protection.
10. Restart during an experiment yields an explicit interrupted/recoverable state, never a false success.
11. JSON/Markdown exports contain prompt/version hashes and artifact IDs but no secret or disallowed raw response.
12. History queries remain within the performance target at 10,000 experiment-run references.
13. Keyboard-only users can create/version a prompt, configure an experiment, inspect results, and record a decision.
14. Existing v0.1 CLI flows, Phase 2 Studio journeys, artifacts, exit codes, and CI demonstrations remain green.

## 13. Guided portfolio demo

The primary demo uses the e-commerce support suite:

| Variant | Behavior | Expected decision evidence |
|---|---|---|
| Baseline prompt v1 | Correct 14-day return policy | Quality-passing reference |
| Candidate prompt v2 | Better tone and equal policy accuracy | Eligible improvement |
| Candidate prompt v3 | Cheaper/faster but claims 30 days | Excluded by critical gate |
| Candidate prompt v4 | Usually correct but flips across repeats | `NO_DECISION` due to instability |

The reviewer sees why a superficially cheaper or more fluent prompt is not necessarily releasable. This demonstrates QA risk analysis, automation, and business decision support rather than prompt editing alone.

## 14. Success metrics

| Metric | Target |
|---|---:|
| Fresh-clone guided A/B demo | ≤10 minutes |
| Default demo cost | USD 0 |
| Prompt versions used in experiments with content hash | 100% |
| Experiment cells with canonical artifact reference | 100% |
| Critical regressions masked by aggregate ranking | 0 |
| Missing cost represented as zero | 0 |
| Reproducible completed mock experiments | 100% |
| Browser-exposed secrets | 0 |
| Global automated coverage | ≥80% |
| Existing CLI/Studio regression suite | 100% passing |

## 15. ROI hypothesis

Phase 3 should reduce:

- manual setup and spreadsheet assembly for prompt/model comparisons;
- repeated review of identical stable cases;
- release decisions based on one nondeterministic run;
- cost surprises from unbounded experiment matrices; and
- time required to explain why a candidate was accepted or rejected.

Evidence to collect during implementation:

- minutes from prompt change to reviewed decision;
- manual comparison steps removed;
- unstable cases detected only through repeats;
- provider calls prevented by planning/budget validation;
- quality retained per unit cost among eligible variants.

## 16. Risks and controls

| Risk | Impact | Control |
|---|---|---|
| Scope expands into full Prompt Management SaaS | Delayed portfolio outcome | Local-only boundary; no auth/teams/cloud |
| SQLite becomes new evaluation truth | Artifact inconsistency | Canonical run files remain authoritative; DB stores references/projections |
| Matrix costs grow unexpectedly | Financial risk | Preflight expansion, hard call/cost budgets, explicit confirmation |
| Repeats are mistaken for statistical certainty | Misleading decision | Report sample size and confidence limitations; no unsupported significance claims |
| One blended score hides critical risk | Unsafe promotion | Eligibility gates before efficiency comparison; Pareto view |
| Prompt variables render unsafe content | Injection/data leak | Strict variable declaration, text-only preview, escaping, size limits |
| Database migration corrupts history | Evidence loss | Transactional migrations, backup, fixtures, rollback/recovery tests |
| Provider nondeterminism makes CI flaky | Unreliable pipeline | Mock-first deterministic CI; real-provider tests opt-in |
| Promotion races with another change | Wrong active version | Expected-current-version optimistic concurrency |
| History grows without bounds | Slow local UI | Indexed queries, pagination, retention/export guidance |
| Existing Studio regresses | Lost trust | Backward-compatibility suite and shared SDK parity gates |

## 17. Dependencies and assumptions

- Product Phase 2 shared SDK, Studio API/web, canonical artifacts, security boundaries, and browser CI remain the foundation.
- SQLite runs in the local Node process and is not exposed directly to the browser.
- Existing project manifests continue to allowlist suites, targets, fixtures, and provider readiness.
- Real-provider experiment execution remains opt-in and requires user-managed environment credentials and reviewed pricing.
- The first implementation uses the existing e-commerce domain; domain-general abstractions must not weaken the demo.
- Detailed SQLite library, migration mechanism, prompt-template syntax, schemas, API contracts, and thresholds are deferred to Stage 2.

## 18. Stage 1 decisions requiring approval

Approval of this document locks:

- PromptOps experimentation as the Phase 3 outcome;
- local-first SQLite without authentication or hosted deployment;
- immutable prompt versions and explicit winner promotion;
- A/B plus a maximum four-variant matrix for the MVP;
- 1–10 paired repetitions and stability metrics;
- quality/risk eligibility before cost/latency comparison;
- canonical `run.json` artifacts remaining authoritative;
- the Must/Should/Could boundaries and 14 acceptance criteria.

## 19. Phase gate

**Status:** `REVIEW`

Stage 2 — System Design may begin only after the project owner approves this Stage 1 baseline. No Phase 3 implementation begins before Stage 2 architecture/security decisions and Stage 3 backlog/test gates are approved.
