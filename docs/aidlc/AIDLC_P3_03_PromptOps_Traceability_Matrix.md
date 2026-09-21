# Product Phase 3 — PromptOps Traceability Matrix

> **Project:** LLM Evaluation Framework (`llm-eval-kit`)  
> **AIDLC stage:** 3 — Backlog & Test Design  
> **Status:** PROPOSED — OWNER REVIEW REQUIRED  
> **Date:** 2026-09-21

## 1. Functional requirements

| Requirement | Stories | Tasks | Tests | Decisions |
|---|---|---|---|---|
| P3-FR-001 List/inspect prompts | US-003, 008, 026, 029, 033 | T011, T014–016, T038, T042 | TS-026, 030–031, 071, 083, 087, 089 | ADR-001–003, 010 |
| P3-FR-002 Create prompt draft | US-003, 026, 029 | T011–016, T042 | TS-025–028, 071, 087–088 | ADR-001–003, 010 |
| P3-FR-003 Edit prompt draft | US-004, 026, 029 | T012, T014–016, T042 | TS-027–028, 071, 085, 087–088 | ADR-002–003, 010 |
| P3-FR-004 Validate prompt content | US-005, 026, 029 | T004–005, T012–016, T042 | TS-006–012, 028, 071, 088, 101 | ADR-003–004, 010 |
| P3-FR-005 Publish immutable version | US-006, 026, 029 | T003, T013–016, T043 | TS-003–006, 029–030, 071, 089 | ADR-002–004, 010 |
| P3-FR-006 Draft from published version | US-007–008, 026, 029 | T013–016, T042 | TS-030–031, 071, 087, 089 | ADR-003, 010 |
| P3-FR-007 Experiment identity | US-011, 027–028, 030, 033 | T017, T020, T033, T038, T041, T044 | TS-032, 071–073, 083, 090 | ADR-001–002, 005, 010 |
| P3-FR-008 Select bounded variants | US-012, 027, 030 | T018–020, T024, T033, T044 | TS-033, 035–040, 072, 090 | ADR-005, 009–010 |
| P3-FR-009 Configure repetitions | US-013–014, 027, 030 | T019–020, T024, T033, T044 | TS-034, 036, 040, 072, 090–091 | ADR-005, 009–010 |
| P3-FR-010 Select evaluation inputs | US-005, 012–014, 027–030 | T005, T018–020, T033, T044 | TS-009–010, 035–039, 073, 090–091 | ADR-004–005, 009–010 |
| P3-FR-011 Validate/plan before execution | US-014, 027–030 | T018–020, T024, T033, T044 | TS-036–040, 072–073, 091 | ADR-005, 009–010 |
| P3-FR-012 Execute through shared engine | US-001–002, 015–016, 027–028 | T001–T002, T006, T020–T024, T033 | TS-001, 013–014, 042–044, 050, 071–072 | ADR-001, 005–006, 012 |
| P3-FR-013 Preserve exact inputs | US-006, 012–015, 018 | T003, T006, T018–T020, T022, T025 | TS-003–006, 014, 037–040, 043, 046–049 | ADR-003–006, 009, 012 |
| P3-FR-014 Canonical run evidence | US-015, 018–021, 031 | T006, T021–T025, T047 | TS-014, 043–050, 097 | ADR-006–007, 009, 012 |
| P3-FR-015 Lifecycle/progress | US-016, 027–030 | T017, T020–T024, T033–T035, T045 | TS-032, 040–046, 072, 079–082, 092–093 | ADR-005, 009–010 |
| P3-FR-016 Cancel safely | US-017, 027, 030 | T023–T024, T033, T035, T045 | TS-044–045, 072, 079–080, 093 | ADR-005–006, 009–010 |
| P3-FR-017 Resume compatible work | US-018, 027–030 | T022–T025, T034–T036, T045 | TS-046–049, 072, 082, 093 | ADR-006, 009–010 |
| P3-FR-018 Quality/critical risk | US-019, 022–023, 031 | T025–T030, T037, T046 | TS-049–053, 057–064, 094 | ADR-006–009 |
| P3-FR-019 Latency/usage/cost | US-021–023, 031 | T025, T027–T030, T037, T046 | TS-054–056, 060, 064, 091, 096 | ADR-006–009 |
| P3-FR-020 Repeated-run stability | US-020, 022–023, 031 | T025–T030, T037, T046–T047 | TS-050–054, 058–064, 095 | ADR-006–009 |
| P3-FR-021 Bounded recommendation | US-022–023, 027–028, 031 | T029–T030, T037, T046 | TS-057–064, 072, 086, 094–096 | ADR-007–010 |
| P3-FR-022 Human decision | US-024–025, 027–028, 032 | T031–T032, T037, T048 | TS-065–068, 072, 086, 098 | ADR-008–011 |
| P3-FR-023 Browse history | US-008–010, 033 | T011, T017, T031, T034, T038, T041, T048 | TS-018–024, 030–031, 065–068, 082–083, 100 | ADR-002–003, 006, 009–010 |
| P3-FR-024 Export evidence | US-027–028, 032, 034 | T032, T039, T048–T049 | TS-069–070, 072, 076, 084, 099, 101 | ADR-006, 008–011 |

## 2. Non-functional requirements

| Requirement | Stories | Tasks | Tests | Decisions |
|---|---|---|---|---|
| P3-NFR-001 Reproducibility | US-001–002, 006, 012–024, 035 | T002–T006, T013, T018–T032, T050 | TS-003–006, 014, 029–030, 037–070, 106 | ADR-001, 003, 006–009, 012 |
| P3-NFR-002 Immutability | US-006–010, 018, 024–025 | T003, T010–T013, T017, T022, T025, T031 | TS-019–030, 046–049, 065–068 | ADR-002–003, 006, 008–009 |
| P3-NFR-003 Security | US-005, 009–010, 028–035 | T004–T005, T009–T016, T033–T040, T042–T049, T056 | TS-008, 011–012, 015–025, 047, 067–070, 073–086, 101, 106 | ADR-002, 004, 006, 009–011 |
| P3-NFR-004 Privacy | US-005, 014–025, 028–035 | T004–T008, T022, T025–T032, T035, T039–T040, T042–T049, T056 | TS-011–012, 048–070, 076, 081, 084, 096, 099, 101, 106 | ADR-004, 006–011 |
| P3-NFR-005 Reliability | US-009–010, 015–018, 024, 035 | T009–T013, T017, T021–T025, T031, T034, T036, T040, T052 | TS-018–030, 041–049, 065–068, 082, 106 | ADR-002–003, 005–006, 009 |
| P3-NFR-006 Performance | US-014, 016, 020–021, 030–035 | T019, T021, T025–T030, T035, T038, T045–T049, T053 | TS-036, 040–042, 050–064, 079–080, 083, 092, 105 | ADR-005, 007, 010 |
| P3-NFR-007 Scalability bounds | US-012–017, 030, 035 | T019–T024, T033–T035, T044–T045, T053 | TS-033–045, 078–080, 090–093, 105 | ADR-005, 009–010 |
| P3-NFR-008 Compatibility | US-001–002, 009, 026–028, 035 | T001, T006–T010, T014–T016, T020, T024, T050–T051, T055, T058 | TS-001–002, 013–020, 071–072, 106 | ADR-001–002, 006, 010, 012 |
| P3-NFR-009 Consistency | US-001–002, 026–032, 035 | T002, T006–T007, T014–T016, T020, T024, T029–T032, T033–T050 | TS-013–014, 043, 048–086, 087–100, 106 | ADR-001, 006–012 |
| P3-NFR-010 Accessibility | US-029–035 | T041–T049, T054 | TS-087–104, 106 | ADR-010–011 |
| P3-NFR-011 Testability | US-001–035 | T001–T058 | TS-001–106 | ADR-001–012 |
| P3-NFR-012 Observability | US-016–018, 027–030, 035 | T017, T020–T025, T033–T036, T040, T045, T056 | TS-040–049, 076, 079–082, 092–093, 106 | ADR-005–006, 009–010 |

## 3. Acceptance criteria

| AC | Evidence specification | Primary tasks |
|---:|---|---|
| P3-AC-01 Immutable published version/hash | TS-003–006, 029–030 | T003, T013–T016, T043 |
| P3-AC-02 Same version usable through CLI/SDK/Studio | TS-014, 071, 087–089 | T006, T014–T016, T041–T043, T050 |
| P3-AC-03 Reject variant/repetition bounds | TS-033–034, 090 | T019, T033, T044 |
| P3-AC-04 Full zero-call plan | TS-036–040, 091 | T018–T020, T033, T044 |
| P3-AC-05 Free repeated mock experiment | TS-043, 049 | T024, T049 |
| P3-AC-06 Canonical `run.json` per repetition | TS-014, 043, 048–049 | T006, T022, T024–T025 |
| P3-AC-07 Cancel/failure preserves evidence | TS-044–047, 093 | T023–T024, T034–T036, T045 |
| P3-AC-08 Critical/incompatibility before averages | TS-049, 057, 059, 094 | T025, T029, T046 |
| P3-AC-09 Deliberately flaky case identified | TS-052–053, 095 | T026–T027, T046 |
| P3-AC-10 Unknown cost never zero | TS-055–056, 060, 091, 096 | T028–T030, T044, T046 |
| P3-AC-11 Approved recommendation states/reasons | TS-057–064 | T029–T030, T037, T046 |
| P3-AC-12 Human confirmation/rationale/evidence hash | TS-065–068, 086, 098 | T031, T037, T048 |
| P3-AC-13 JSON/Markdown semantic equivalence | TS-069–070, 084, 099 | T032, T039, T048 |
| P3-AC-14 Existing workflows backward compatible | TS-001, 013, 071–072, 106 | T001, T006, T050–T051, T058 |

## 4. ADR implementation ownership

| Decision | Primary tasks | Verification |
|---|---|---|
| P3-ADR-001 PromptOps ports/adapters | T001–T002, T014, T020, T050 | TS-001, 013–014, 071–072, 106 |
| P3-ADR-002 `node:sqlite` adapter | T001, T009–T013, T017, T031, T052, T055 | TS-002, 015–030, 065–068, 106 |
| P3-ADR-003 Immutable prompt lifecycle | T003, T011–T016, T042–T043 | TS-003–006, 026–031, 087–089 |
| P3-ADR-004 Restricted template grammar | T004–T006, T012–T013, T042 | TS-007–012, 014, 088, 101 |
| P3-ADR-005 Sequential bounded orchestration | T017–T024, T033–T035, T044–T045 | TS-032–045, 079–080, 090–093 |
| P3-ADR-006 Canonical run evidence | T006, T022, T024–T025, T032, T047 | TS-014, 043–050, 069–070, 097 |
| P3-ADR-007 Stability aggregation | T025–T030, T046 | TS-050–064, 094–096 |
| P3-ADR-008 Recommendation/human decision | T029–T032, T037, T046, T048 | TS-057–070, 086, 098–099 |
| P3-ADR-009 Plan/evidence hash guards | T003, T018–T019, T022, T025, T030–T031, T036–T037 | TS-037–049, 064–068, 086 |
| P3-ADR-010 Loopback HTTP/SSE | T016, T033–T041, T045 | TS-073–086, 092–093 |
| P3-ADR-011 Portable safe exports | T007, T032, T039, T048 | TS-069–070, 076, 084, 099, 101 |
| P3-ADR-012 Backward-compatible prompt integration | T006, T024, T050–T051 | TS-013–014, 043, 071–072, 106 |

## 5. Story-to-task completeness

| Story range | Primary task coverage |
|---|---|
| P3-US-001–002 | T001–T002, T006, T020, T050–T051 |
| P3-US-003–008 | T003–T005, T011–T016, T042–T043 |
| P3-US-009–010 | T009–T011, T034, T040, T052, T055 |
| P3-US-011–018 | T017–T024, T033–T036, T044–T045 |
| P3-US-019–023 | T025–T030, T037, T046–T047 |
| P3-US-024–025 | T031, T037, T048 |
| P3-US-026–028 | T007, T014–T016, T020, T024, T033–T040, T050 |
| P3-US-029–033 | T041–T049, T054 |
| P3-US-034–035 | T008, T024, T040, T049–T058 |

## 6. Sprint-to-evidence matrix

| Sprint | Tasks | Primary test ranges | Exit evidence |
|---:|---|---|---|
| 11 | T001–T008 | TS-001–014 | Safe rendered mock run with prompt hash; legacy characterization green |
| 12 | T009–T016 | TS-015–031, 071, 085 | Immutable prompt lifecycle through CLI/API and restart |
| 13 | T017–T024 | TS-032–049, 072 | Six canonical runs from repeated mock experiment; cancel/resume evidence |
| 14 | T025–T032 | TS-048–070 | Stability, recommendation, human decision, JSON/Markdown export |
| 15 | T033–T040 | TS-073–086 | Secure lifecycle/SSE/history/recovery API across restart |
| 16 | T041–T049 | TS-087–104 | Accessible end-to-end Studio portfolio journey |
| 17 | T050–T058 | TS-001–106 | Full compatibility/security/recovery/performance/release evidence |

## 7. Completeness checks

- 24 functional requirements map to stories, tasks, tests, and accepted ADRs.
- 12 non-functional requirements map to stories, tasks, tests, and accepted ADRs.
- 14 acceptance criteria map to executable evidence and primary tasks.
- 12 accepted P3 ADRs have implementation ownership and verification.
- 35 user stories have task coverage.
- 58 implementation tasks belong to Sprint 11–17.
- 106 test specifications cover domain, persistence, migrations, execution, recommendation, security, accessibility, performance, compatibility, and release.
- Every sprint has a vertical outcome and explicit exit evidence.
- No task authorizes SaaS/auth, autonomous optimization, RAG, agent evaluation, remote storage, or automatic promotion.

## 8. Stage gate

**Status:** `PENDING OWNER REVIEW`

Implementation may begin at Sprint 11 / P3-T001 only after the owner approves this matrix together with the backlog/sprint plan and test strategy.
