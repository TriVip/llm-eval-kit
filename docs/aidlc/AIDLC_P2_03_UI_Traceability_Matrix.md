# Product Phase 2 — UI Traceability Matrix

> **Project:** LLM Evaluation Framework (`llm-eval-kit`)  
> **AIDLC stage:** 3 — Backlog & Test Design  
> **Status:** REVIEW  
> **Date:** 2026-09-16

## 1. Functional requirements

| Requirement | Stories | Tasks | Tests | Decisions |
|---|---|---|---|---|
| UI-FR-001 Start Studio locally | 008, 028 | T009, T043–045 | TS-019, 059, 064–065, 068 | ADR-002 |
| UI-FR-002 Load bundled project | 005–006, 027 | T008, T011, T017, T027 | TS-001–005, 043, 065 | ADR-004/005 |
| UI-FR-003 Validate before run | 002, 010 | T004, T018, T022 | TS-010, 032, 044–045 | ADR-001/004 |
| UI-FR-004 Configure run | 004, 010, 017 | T007, T018, T022 | TS-006, 033, 044–045 | ADR-003/004/005 |
| UI-FR-005 Run mock evaluation | 002, 011, 017, 027 | T005, T019, T022–027 | TS-011, 034, 047–050, 065 | ADR-001/007/009 |
| UI-FR-006 Provider readiness | 009, 017 | T013, T036 | TS-023, 029, 031, 043 | ADR-008 |
| UI-FR-007 Stream progress | 011–012, 018 | T020–023 | TS-035–038, 046, 061 | ADR-006/009 |
| UI-FR-008 Cancel run | 013 | T028–029 | TS-016–017, 039–040 | ADR-010 |
| UI-FR-009 Display summary | 019, 022 | T024, T037 | TS-047–048, 051 | ADR-007/011 |
| UI-FR-010 Explore cases | 020 | T025, T040 | TS-049, 060 | ADR-003/007/011 |
| UI-FR-011 Inspect evidence | 021–022 | T026, T037 | TS-026, 047, 050–051 | ADR-007/008/011 |
| UI-FR-012 Compare baseline | 003, 023 | T005–006, T030–031 | TS-013, 052 | ADR-001/007 |
| UI-FR-013 Promote baseline | 003, 024 | T005–006, T032–033 | TS-014, 053 | ADR-001/007 |
| UI-FR-014 Browse run history | 007 | T012–013, T017 | TS-007–008, 041–043 | ADR-005/012 |
| UI-FR-015 Access artifacts | 007, 026 | T012–013, T035 | TS-024–025, 041–042 | ADR-005/007 |
| UI-FR-016 Human-review queue | 025 | T034 | TS-054 | ADR-007/012 |
| UI-FR-017 Preserve CLI parity | 001–003 | T002–006, T041 | TS-009–014, 066 | ADR-001/007 |
| UI-FR-018 Operational failure | 002, 011, 013, 022 | T003, T019, T028–029, T037 | TS-015–017, 028, 039–040, 051 | ADR-001/007/010 |
| UI-FR-019 Guided demos | 016, 027 | T008, T017, T027, T044 | TS-043, 048, 065 | ADR-004/007 |
| UI-FR-020 Async UI states | 014–015, 022 | T015–016, T037–038 | TS-042, 045–046, 055–058 | ADR-003/011 |

## 2. Non-functional requirements

| Requirement | Stories | Tasks | Tests | Decisions |
|---|---|---|---|---|
| UI-NFR-001 Security | 006, 008–009, 021, 024, 026, 028 | T010–013, T026, T032, T035, T039 | TS-003–006, 019–030, 053, 067 | ADR-002/005/008 |
| UI-NFR-002 Engine consistency | 001–003, 019–023 | T002–006, T024, T030, T041 | TS-009–018, 047, 052, 066 | ADR-001/007 |
| UI-NFR-003 Performance | 007, 020, 028 | T012, T025, T040 | TS-059–062 | ADR-003/006/012 |
| UI-NFR-004 Responsiveness | 012, 018, 020 | T020–023, T025, T040 | TS-035–037, 046, 060–061 | ADR-006/009 |
| UI-NFR-005 Reliability | 007, 011–013, 022 | T012, T019–021, T028–029, T037 | TS-007–008, 015–017, 030, 035–040 | ADR-006/009/010/012 |
| UI-NFR-006 Accessibility | 014–025, 027–028 | T015–017, T022–027, T031, T033–034, T037–038 | TS-043–058 | ADR-003/011 |
| UI-NFR-007 Testability | 001–028 | T001–045 | TS-001–068 | ADR-001/003/007 |
| UI-NFR-008 Portability | 008, 028 | T009, T042–045 | TS-063–065, 068 | ADR-002/003 |
| UI-NFR-009 Maintainability | 002, 004–006, 014, 028 | T001, T003, T007–008, T011, T014, T041 | TS-001–006, 009–018, 066 | ADR-001/003/004/005 |
| UI-NFR-010 Privacy | 006–009, 021, 026, 028 | T010–013, T026, T035–036, T039 | TS-023, 026, 028–029, 038, 041, 050, 067 | ADR-005/007/008 |
| UI-NFR-011 Observability | 009, 011–012, 022 | T010, T019–021, T037 | TS-028, 031, 034–040, 051 | ADR-006/007 |
| UI-NFR-012 Usability | 008, 016–027 | T017, T022–027, T031, T033–037, T043–045 | TS-043–058, 065, 068 | ADR-002/003/004/011 |

## 3. UI acceptance criteria

| AC | Evidence specification | Primary tasks |
|---|---|---|
| UI-AC-01 Fresh-clone mock demo ≤10 minutes | UI-TS-065 | T043–045 |
| UI-AC-02 64 cases match CLI metrics | UI-TS-011, 034, 047 | T006, T019, T024, T027 |
| UI-AC-03 `REFUND_001` shows 30-day claim, 14-day evidence, CRITICAL block | UI-TS-012, 048 | T024, T026–027 |
| UI-AC-04 UI renders canonical artifact without recalculation | UI-TS-011–014, 047, 052 | T005–006, T024, T030–031 |
| UI-AC-05 Invalid dataset makes zero provider calls | UI-TS-010, 032 | T004, T018, T022 |
| UI-AC-06 No key/secret reaches browser evidence | UI-TS-023, 028–029, 038, 067 | T010, T013, T036, T039 |
| UI-AC-07 Untrusted scripts/event handlers cannot execute | UI-TS-026 | T026, T039 |
| UI-AC-08 Baseline overwrite requires separate confirmation | UI-TS-053 | T032–033 |
| UI-AC-09 500-case filter/search meets target | UI-TS-060 | T025, T040 |
| UI-AC-10 Keyboard completes New Run → Result → Case → Compare | UI-TS-044–045, 057 | T015–016, T022–026, T031, T038 |
| UI-AC-11 CLI and Studio pass contract parity | UI-TS-009–014, 066 | T002–006, T041 |
| UI-AC-12 Existing v0.1 CLI/artifacts/CI stay compatible | UI-TS-018, 066 | T002, T006, T041, T045 |

## 4. ADR implementation ownership

| Decision | Primary tasks | Verification |
|---|---|---|
| UI-ADR-001 Shared SDK | T001–006 | TS-009–018, 066 |
| UI-ADR-002 Loopback same-origin | T009–010, T043 | TS-019–022, 064, 068 |
| UI-ADR-003 React/Vite features | T014–017, T022–027, T031, T033–034 | TS-043–058, 063 |
| UI-ADR-004 Project manifest | T008, T011, T027 | TS-001–006, 065 |
| UI-ADR-005 ID-based filesystem API | T011–013, T030, T032, T035 | TS-003–008, 024–025, 041–042 |
| UI-ADR-006 SSE progress | T020–023 | TS-035–038, 046, 061 |
| UI-ADR-007 Canonical artifacts | T005–006, T012, T024, T030–035 | TS-011–018, 041, 047–054 |
| UI-ADR-008 Server-only credentials | T010, T013, T036 | TS-023, 028–029, 038, 067 |
| UI-ADR-009 One active run | T019 | TS-030, 034 |
| UI-ADR-010 Cooperative cancellation | T028–029 | TS-016–017, 039–040 |
| UI-ADR-011 Custom accessible design | T015–017, T022–027, T031, T033–034, T038 | TS-043–058 |
| UI-ADR-012 No DB/auth | T012, T043–045 | TS-008, 040, 064–065, 068 |

## 5. Story-to-task completeness

| Story range | Task coverage |
|---|---|
| UI-US-001–003 | T002–006, T041 |
| UI-US-004–007 | T007–008, T011–013 |
| UI-US-008–013 | T009–013, T018–021, T028–029, T036 |
| UI-US-014–018 | T014–017, T022–023, T027, T037–038 |
| UI-US-019–022 | T024–026, T037, T040 |
| UI-US-023–026 | T030–035 |
| UI-US-027–028 | T027, T038–045 |

## 6. Completeness checks

- 20 UI functional requirements map to story, task, test, and ADR evidence.
- 12 UI non-functional requirements map to story, task, test, and ADR evidence.
- 12 UI acceptance criteria map to executable evidence.
- 12 accepted UI ADRs have implementation ownership and verification.
- 28 user stories have task coverage.
- 45 implementation tasks belong to Sprint 6–10.
- 68 test specifications cover functional, compatibility, security, accessibility, performance, portability, and release risks.

## 7. Stage gate

**Status:** `AWAITING APPROVAL`

Implementation may begin only after the backlog, test strategy, this matrix, Definition of Ready/Done, estimates, and Sprint 6–10 sequencing are approved together.
