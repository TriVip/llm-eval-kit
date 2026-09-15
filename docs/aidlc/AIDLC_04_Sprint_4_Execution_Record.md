# AIDLC Phase 4 — Sprint 4 Execution Record

**Project:** LLM Evaluation Framework (`llm-eval-kit`)  
**Sprint:** Sprint 4 — Baseline, regression, reporting, and observability  
**Execution date:** 2026-09-15  
**Status:** COMPLETED  
**Implementation commit:** `949621b7c2fa5ba54c488dda1f78b7f27ae57149`

## 1. Sprint goal

Complete the MVP regression and reporting slice without allowing incompatible artifacts, changed case definitions, sensitive content, or accidental baseline updates to produce misleading quality decisions.

## 2. Completed backlog

| ID | Deliverable | Result | Verification |
|---|---|---|---|
| T-027 | Baseline compatibility and classification | Done | Suite/schema/metric checks; matched, added, removed, changed tests |
| T-028 | Candidate versus baseline comparison | Done | Matched-unchanged category deltas, critical regression and threshold-boundary tests |
| T-029 | Explicit baseline promotion | Done | Validated source artifact, atomic write, guarded overwrite |
| T-030 | Structured logs and central redaction | Done | NDJSON logs, nested key/pattern redaction, raw-response retention tests |
| T-031 | Terminal and canonical JSON reporting | Done | Shared immutable artifact metrics, gate reasons, failures and paths |
| T-032 | Static safe HTML reporting | Done | Self-contained HTML, escaped untrusted content, failure filters and case detail |
| T-033 | Final MVP command surface | Done | `validate`, `run`, `compare`, `baseline save`, and `report` integration tests |

## 3. Baseline safety model

- Candidate and baseline must use the same suite ID, artifact schema major, and metric-definition version.
- New artifacts record a deterministic definition hash for each case.
- Cases are classified as matched, added, removed, or changed.
- Only unchanged matched cases contribute to pass-rate and category deltas.
- A newly failing matched critical case creates `CRITICAL_CASE_REGRESSION`.
- Category regression blocks only when it exceeds the configured boundary; exactly 3 percentage points remains allowed under a 3-point threshold.
- Cost and latency deltas are emitted only when both artifacts have complete measurement coverage.
- Baselines are never updated by `run`; promotion requires the dedicated command and explicit overwrite consent.

## 4. Reporting and privacy controls

All reporters consume the same immutable `RunArtifact` and do not recalculate verdicts.

- Terminal output shows run/suite status, metrics, gate reasons, failed categories, critical failures, and artifact paths.
- `run.json` remains the versioned machine-readable integration artifact.
- `report.html` is static and self-contained, uses a restrictive CSP, escapes all dynamic content, and provides failure/error filters plus case details.
- `logs.ndjson` emits machine-readable events with run correlation.
- Central redaction masks sensitive field names and recognizable credential patterns at every log/report depth.
- With `retainRawResponses=false`, text and structured raw output are not persisted.

Legacy artifacts remain parseable, but comparison rejects artifacts that predate compatibility metadata with an actionable error instead of fabricating a delta.

## 5. CLI surface and exit semantics

```text
llmeval validate --config <path> --suite <path>
llmeval run --config <path> --suite <path> [filters/provider options]
llmeval compare --run <path> --baseline <path>
llmeval baseline save --run <path> --output <path> [--overwrite]
llmeval report --run <path> --format terminal|html [--baseline <path>]
```

Exit codes remain stable: `0` pass, `1` valid quality/regression failure, `2` invalid input, `3` operational failure, and `4` framework/reporting failure. Reporter failure does not mask a pre-existing quality failure.

## 6. Acceptance demonstration

The e-commerce mock suite produced an approved baseline with five of five cases passing. The deliberate regression fixture changed `REFUND_001` to the incorrect 30-day policy:

```text
Candidate status: QUALITY_FAILED
Candidate pass rate: 80.00%
Matched cases: 5
Critical regression: REFUND_001
Comparison failures: CRITICAL_CASE_REGRESSION, CATEGORY_REGRESSION
Compare exit code: 1
```

Baseline promotion succeeded only through `baseline save`. The candidate and baseline artifacts stored `[RAW_RESPONSE_NOT_RETAINED]` for all model response text under the default privacy policy. A standalone HTML report was generated successfully from the persisted artifacts.

## 7. Quality evidence

| Gate | Result |
|---|---|
| ESLint | PASS |
| Prettier check | PASS |
| TypeScript build/typecheck | PASS, all 8 workspace projects |
| Automated tests | PASS, 109/109 across 22 test files |
| Statement coverage | 90.38% |
| Branch coverage | 80.22% |
| Function coverage | 91.25% |
| Line coverage | 92.18% |
| Coverage threshold | PASS, minimum 80% for all global measures |
| Dependency audit | PASS, no known vulnerabilities at high threshold |
| Peer dependencies | PASS |
| Secret-file scan | PASS, no tracked `.env` files |
| Git whitespace check | PASS |
| Offline baseline/regression demo | PASS |

The Dependabot merge immediately before Sprint 4 raised TypeScript to 7.0.2, which is unsupported by `typescript-eslint` 8.70 and broke lint. TypeScript is pinned back to 6.0.2; this preserves the accepted compatibility decision and restores the quality gate.

## 8. Known limitations and deferrals

- Historical artifacts without suite/metric compatibility metadata can be inspected and reported but cannot be used as trusted baselines.
- Structured logs currently cover provider attempts, evaluator results, and run completion; deeper scheduler lifecycle events can be added without changing the NDJSON contract.
- HTML filtering is deliberately lightweight and dependency-free.
- The portfolio-scale 50-case dataset, CI regression showcase, performance run, judge calibration, and release packaging remain Sprint 5 scope.

## 9. Sprint review conclusion

Sprint 4 meets T-027 through T-033. The framework now supports safe, explicit prompt/model regression workflows from validation through baseline promotion, comparison, reporting, and CI-compatible exit decisions. Sprint 5 is ready for portfolio dataset expansion and release hardening.
