# AIDLC Phase 3 — Requirements Traceability Matrix

> **Project:** LLM Evaluation Framework (`llm-eval-kit`)  
> **Status:** Approved  
> **Date:** 2026-09-15  
> **Approved:** 2026-09-15 by project owner  
> **Trace direction:** Requirement → Story → Task → Test evidence

## 1. Functional requirements

| Requirement | User stories | Implementation tasks | Test specifications |
|---|---|---|---|
| FR-001 Load config/suite | US-002, US-004 | T-005, T-006, T-033 | TS-001–003 |
| FR-002 Validate before provider | US-002, US-004 | T-005–006 | TS-002–003 |
| FR-003 Run/filter cases | US-005, US-006 | T-009, T-013, T-019 | TS-004–005, TS-038 |
| FR-004 OpenAI provider | US-009 | T-023, T-038 | TS-008, TS-013, TS-038 |
| FR-005 Gemini provider | US-010 | T-024, T-038 | TS-008, TS-013, TS-038 |
| FR-006 Mock provider | US-007 | T-007, T-019 | TS-006, TS-039–042 |
| FR-007 Text evaluators | US-012 | T-008, T-014 | TS-014–016, TS-040–041 |
| FR-008 JSON Schema evaluator | US-013 | T-015 | TS-017–018, TS-035 |
| FR-009 LLM judge | US-014 | T-025, T-038 | TS-019–021 + calibration suite |
| FR-010 Aggregate results | US-002, US-016 | T-004, T-010, T-016 | TS-022–027 |
| FR-011 Severity | US-002, US-016, US-017 | T-004, T-016–017 | TS-023–024 |
| FR-012 Run metadata | US-002, US-006 | T-004, T-009, T-011 | TS-009, TS-032, repeated-run tests |
| FR-013 Usage/cost/latency | US-009–011, US-016 | T-022–024, T-016 | TS-006, TS-012–013, TS-032 |
| FR-014 Terminal report | US-022 | T-012, T-031, T-033 | TS-027, TS-032 |
| FR-015 JSON report | US-022 | T-011, T-031 | TS-009, TS-032, TS-038 |
| FR-016 HTML report | US-023 | T-032 | TS-032, TS-034 |
| FR-017 Baseline comparison | US-017, US-019, US-020 | T-017, T-027–028 | TS-026, TS-028–030 |
| FR-018 Quality gate/exit code | US-017, US-018 | T-017–018, T-033 | TS-023–027 + exit-code matrix |
| FR-019 Retry transient errors | US-008–010 | T-020–024 | TS-007–010 |
| FR-020 Redact secrets | US-009, US-010, US-014, US-023, US-024 | T-023–025, T-030, T-032, T-036 | TS-021, TS-033–035 |
| FR-021 Human-review export | US-015 | T-026 | TS-020 |
| FR-022 Baseline save | US-021 | T-029, T-033 | TS-031 |

## 2. Non-functional requirements

| Requirement | User stories | Implementation tasks | Test evidence |
|---|---|---|---|
| NFR-001 Reproducibility | US-002, US-006, US-007 | T-004–007, T-009, T-011, T-019 | TS-006, TS-032, repeated-run golden tests |
| NFR-002 Core coverage ≥80% | US-003 | T-002–003, all core tasks | CI coverage report; critical paths 100% branch target |
| NFR-003 Internal p95 ≤100ms/case | US-006 | T-020, T-037 | TS-037 |
| NFR-004 Stable 500-case suite | US-006, US-008 | T-020, T-037 | TS-037–038 |
| NFR-005 Partial results | US-006, US-008 | T-009, T-011, T-020–021 | TS-009, TS-011, TS-038 |
| NFR-006 Security | US-003, US-014, US-023, US-024 | T-003, T-025, T-030, T-032, T-036 | TS-021, TS-033–035 + scans |
| NFR-007 Maintainability | US-001, US-002 | T-001–005 | Architecture/dependency tests + contract tests |
| NFR-008 Portability | US-001, US-003, US-026 | T-001–003, T-035 | TS-036, TS-042 |
| NFR-009 Observability | US-006, US-024 | T-009, T-021, T-030 | Log-schema/correlation tests, TS-033 |
| NFR-010 Cost control | US-008, US-011 | T-020–022 | TS-011–012 |

## 3. MVP acceptance criteria

| MVP criterion | Stories/tasks | Evidence |
|---|---|---|
| AC-01 Fresh clone chạy mock suite ≤10 phút | US-027 / T-039 | TS-039 |
| AC-02 ≥50 cases, ≥5 categories | US-025 / T-034 | Dataset validation/review |
| AC-03 ≥5 evaluator types có tests | US-012–014 / T-014–015, T-025 | TS-014–021 |
| AC-04 OpenAI/Gemini cùng contract | US-009–010 / T-023–024 | TS-013 + smoke |
| AC-05 Terminal/JSON/HTML nhất quán | US-022–023 / T-031–032 | TS-032 |
| AC-06 `REFUND_001` phát hiện claim 30 ngày | US-025–026 / T-034–035 | TS-040 |
| AC-07 Critical failure trả non-zero | US-017–018 / T-017–018 | TS-023, TS-040 |
| AC-08 Baseline nêu category regression | US-019–020 / T-027–028 | TS-026, TS-028–030 |
| AC-09 CI có pass và blocked examples | US-026 / T-035 | TS-040–042 |
| AC-10 Không lộ secret | US-024 / T-030, T-036 | TS-033–035 + secret scan |
| AC-11 Core coverage ≥80% | US-003 / T-003, T-040 | CI coverage report |
| AC-12 README đủ architecture/quick start/limitations/ROI | US-027 / T-039 | Docs review + TS-039 |

## 4. ADR-to-task controls

| ADR | Enforced by tasks | Verification/control |
|---|---|---|
| ADR-001 CLI/file-based | T-001, T-006, T-011–012 | No server/database dependency in MVP |
| ADR-002 Modular monorepo | T-001–004 | Dependency rule/architecture test |
| ADR-003 Provider ports/adapters | T-004, T-007, T-023–024 | Shared contract suite |
| ADR-004 Evaluator registry | T-004, T-008, T-014–015, T-025 | Shared evaluator contract tests |
| ADR-005 Deterministic precedence | T-016–017 | TS-022–023 |
| ADR-006 Separate score/confidence/error | T-004, T-016, T-025 | Schema + TS-019–020, TS-024–025 |
| ADR-007 Canonical run artifact | T-011, T-031–032 | TS-032 |
| ADR-008 Explicit baseline promotion | T-029 | TS-031 |
| ADR-009 Bounded execution | T-020–022 | TS-007–012, TS-037–038 |
| ADR-010 Privacy-safe artifacts | T-030, T-032, T-036 | TS-033–035 |
| ADR-011 Mock suite required in CI | T-003, T-007, T-035 | TS-006, TS-040–042 |

## 5. Coverage audit

| Audit item | Result |
|---|---|
| Functional requirements mapped | 22/22 |
| Non-functional requirements mapped | 10/10 |
| MVP acceptance criteria mapped | 12/12 |
| Accepted ADRs mapped | 11/11 |
| Product stories mapped | 27/27 through task plan/backlog |
| Implementation tasks mapped | 40/40 through stories/tests or delivery controls |
| Test specifications defined | TS-001–TS-042 |

## 6. Change-control rule

Khi requirement, ADR, story, task hoặc test thay đổi:

1. Cập nhật source document có thẩm quyền trước.
2. Ghi lý do và impact.
3. Cập nhật traceability trong cùng pull request.
4. Không xóa test chỉ vì implementation thay đổi; xác nhận requirement/decision có đổi hay không.
5. Baseline/golden update phải có reviewer xác nhận expected behavior mới.

## 7. Phase gate

**Status:** `PASSED`

Phase 3 đã pass: không có orphan requirement, Must story thiếu task hoặc critical behavior thiếu test specification.
