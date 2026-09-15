# AIDLC Phase 2 — Architecture Decisions & Traceability

> **Project:** LLM Evaluation Framework (`llm-eval-kit`)  
> **Status:** Accepted  
> **Date:** 2026-09-14
> **Approved:** 2026-09-15 by project owner

## 1. Architecture Decision Records

### ADR-001 — CLI-first, file-based MVP

- **Status:** Accepted
- **Decision:** MVP chạy bằng CLI và lưu config, suite, baseline, reports trên filesystem.
- **Why:** Đây là đường ngắn nhất để chứng minh evaluation/regression engine, dễ tích hợp CI và không tạo gánh nặng auth/database/UI.
- **Trade-off:** Chưa có history query, collaboration hoặc dashboard real-time.
- **Revisit when:** Bắt đầu v1.0 dashboard/multi-user.

### ADR-002 — TypeScript modular monorepo

- **Status:** Accepted
- **Decision:** Node.js 22 + TypeScript + pnpm workspace; tách core, providers, evaluators, scoring, artifacts, reporters và CLI.
- **Why:** Phù hợp kinh nghiệm hiện tại, tạo boundaries rõ và có thể publish packages sau này.
- **Trade-off:** Nhiều package config hơn một repository đơn.

### ADR-003 — Ports and adapters cho provider APIs

- **Status:** Accepted
- **Decision:** Core chỉ biết `LlmProvider`; OpenAI/Gemini/mock là adapters.
- **Why:** Tránh SDK lock-in và cho phép contract tests dùng chung.
- **Trade-off:** Một số feature riêng của provider chỉ có thể xuất hiện qua optional capability metadata.

### ADR-004 — Plugin-style evaluator registry

- **Status:** Accepted
- **Decision:** Evaluators implement contract thống nhất và được resolve qua registry theo `type` trong testcase.
- **Why:** Thêm evaluator mà không sửa runner/scoring core.
- **Trade-off:** Contract phải đủ hẹp; evaluator đặc biệt có thể cần version/capability negotiation sau này.

### ADR-005 — Deterministic checks có precedence

- **Status:** Accepted
- **Decision:** Required deterministic failure quyết định case `FAIL` trước semantic weighted score.
- **Why:** Business rule rõ ràng không nên bị LLM judge hoặc average score ghi đè.
- **Trade-off:** Một rule `contains` viết kém có thể tạo false failure; cần review dataset.

### ADR-006 — Tách score, confidence, verdict và error

- **Status:** Accepted
- **Decision:** Không dùng một số duy nhất để biểu diễn mọi khía cạnh; `ERROR` khác `FAIL`, confidence khác quality score.
- **Why:** Giữ semantics chính xác và hỗ trợ human-in-the-loop.
- **Trade-off:** Report/schema phức tạp hơn.

### ADR-007 — Immutable canonical run artifact

- **Status:** Accepted
- **Decision:** `run.json` đã aggregate là source cho terminal/HTML/baseline comparison; reporters không tự tính verdict.
- **Why:** Tránh report lệch nhau và tăng reproducibility.
- **Trade-off:** Cần artifact schema/version management.

### ADR-008 — Explicit baseline promotion

- **Status:** Accepted
- **Decision:** Baseline không tự update; chỉ thay khi user chạy command/workflow riêng.
- **Why:** Ngăn một run sai tự hợp thức hóa thành chuẩn mới.
- **Trade-off:** Thêm thao tác review/promotion.

### ADR-009 — Bounded concurrency and retry

- **Status:** Accepted
- **Decision:** Global/provider concurrency cap, timeout, retry tối đa và cost budget bắt buộc có default.
- **Why:** Kiểm soát rate limit, flakiness và chi phí.
- **Trade-off:** Throughput thấp hơn unbounded parallelism nhưng predictable hơn.

### ADR-010 — Privacy-safe artifacts by configuration

- **Status:** Accepted
- **Decision:** Central redaction; raw response retention có thể tắt; HTML escape mọi dynamic content.
- **Why:** Dataset và response có thể chứa secrets/PII/untrusted HTML.
- **Trade-off:** Khi tắt raw response, khả năng debug giảm; cần safe evidence summary.

### ADR-011 — Mock suite là bắt buộc trong CI

- **Status:** Accepted
- **Decision:** Mọi PR chạy deterministic mock evaluation; paid API tests là optional/scheduled/manual.
- **Why:** CI nhanh, ổn định và không phụ thuộc secrets/cost.
- **Trade-off:** Mock không chứng minh provider behavior thật; contract/smoke tests bù phần này.

## 2. Functional requirement traceability

| Requirement | Primary component | Verification |
|---|---|---|
| FR-001 Load config/suite | `config`, CLI | Unit + CLI E2E |
| FR-002 Pre-call validation | `config`, application runner | Integration test xác nhận provider call count = 0 |
| FR-003 Filters/execution | CLI, runner | Unit + E2E |
| FR-004 OpenAI provider | `providers/openai` | Contract + optional smoke |
| FR-005 Gemini provider | `providers/gemini` | Contract + optional smoke |
| FR-006 Mock provider | `providers/mock` | Unit + integration |
| FR-007 Deterministic evaluators | `evaluators/deterministic` | Table-driven unit tests |
| FR-008 JSON Schema evaluator | `evaluators/json-schema` | Unit/golden violations |
| FR-009 LLM judge | `evaluators/llm-judge` | Contract + malformed-output tests |
| FR-010 Aggregate results | `scoring` | Unit/property tests |
| FR-011 Severity | `core/domain`, `scoring` | Critical precedence tests |
| FR-012 Run metadata | runner, `artifacts` | Integration artifact assertions |
| FR-013 Usage/cost/latency | provider adapters, scoring | Contract + aggregation tests |
| FR-014 Terminal report | `reporters/terminal` | Golden tests |
| FR-015 JSON report | `reporters/json`, artifacts | JSON Schema validation |
| FR-016 HTML report | `reporters/html` | Golden + escaping tests |
| FR-017 Baseline compare | `scoring/baseline` | Regression matrix tests |
| FR-018 Quality gate | `scoring/gate`, CLI | Unit + exit-code E2E |
| FR-019 Retry | provider execution policy | Fault-injection tests |
| FR-020 Secret redaction | logging/artifacts/reporters | Security tests |
| FR-021 Human-review export | scoring, artifacts | Integration artifact test |
| FR-022 Baseline save | CLI, artifacts | E2E + overwrite guard tests |

## 3. Non-functional requirement traceability

| Requirement | Design mechanism | Evidence target |
|---|---|---|
| NFR-001 Reproducibility | Immutable artifact, hashes, mock provider | Repeated-run golden comparison |
| NFR-002 ≥80% core coverage | Vitest coverage gate | CI coverage report |
| NFR-003 ≤100ms internal p95 | In-process deterministic path | Benchmark excluding provider time |
| NFR-004 500-case suite | Bounded scheduler, memory controls | Load test với mock provider |
| NFR-005 Partial results | Per-batch checkpoint + typed errors | Fault-injection run |
| NFR-006 Security | Env secrets, redaction, escaping, scans | Security suite + CI scans |
| NFR-007 Maintainability | Contracts/registry/package boundaries | Dependency rules + contract tests |
| NFR-008 Portability | Node 22, filesystem abstractions | Linux/macOS CI matrix |
| NFR-009 Observability | Correlation IDs + NDJSON | Log schema test |
| NFR-010 Cost control | Dry-run, budgets, bounded calls | Budget-exhaustion E2E |

## 4. Cross-cutting design rules

1. Domain logic là pure functions khi có thể.
2. Provider/evaluator side effects nằm sau interfaces.
3. User input, provider output và report content đều là untrusted.
4. Mọi persisted artifact đều có schema version.
5. Không silent fallback từ provider thật sang mock.
6. Không tự update baseline.
7. Không biến infrastructure error thành quality failure.
8. Không tính unknown cost/token là zero.
9. Mọi critical failure phải xuất hiện rõ trong terminal và JSON report.
10. AI-generated code phải trace tới task và acceptance criteria ở Phase 3.

## 5. Phase 2 open items

Các mục sau được phép chốt ở Phase 3/configuration, không phải architecture blockers:

- exact model IDs cho OpenAI/Gemini;
- pricing catalog values và cơ chế update thủ công;
- nội dung judge prompt/rubric calibration dataset;
- final HTML visual design;
- danh sách đủ 50 demo cases;
- tên npm package nếu namespace đã bị sử dụng.

## 6. Decisions explicitly deferred beyond MVP

- database technology;
- web framework/dashboard architecture;
- authentication/RBAC;
- hosted multi-tenant isolation;
- plugin marketplace;
- RAG retrieval instrumentation;
- AI agent tool sandboxing.

## 7. Review checklist

- [x] Chấp nhận CLI-first, file-based MVP.
- [x] Chấp nhận modular monorepo và package boundaries.
- [x] Chấp nhận provider/evaluator contracts.
- [x] Chấp nhận deterministic precedence và scoring semantics.
- [x] Chấp nhận baseline promotion explicit.
- [x] Chấp nhận retry/concurrency/budget strategy.
- [x] Chấp nhận artifact, error và exit-code design.
- [x] Chấp nhận security/privacy controls.
- [x] Xác nhận traceability không bỏ sót FR/NFR.

## 8. Phase gate

**Status:** `PASSED`

ADR-001 đến ADR-011 đã chuyển thành `Accepted`. Phase 3 được phép tạo backlog và test specifications nhưng không được tự ý thay đổi các quyết định này.
