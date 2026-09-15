# AIDLC Phase 3 — Product Backlog

> **Project:** LLM Evaluation Framework (`llm-eval-kit`)  
> **Status:** Approved  
> **Date:** 2026-09-15  
> **Approved:** 2026-09-15 by project owner  
> **Approved inputs:** Phase 1 Requirements + Phase 2 System Design/ADRs

## 1. Backlog rules

- `Must`: bắt buộc cho MVP.
- `Should`: có giá trị cao nhưng có thể dời khỏi MVP nếu ảnh hưởng critical path.
- Mỗi story phải trace đến requirement và test specification.
- Story chỉ vào sprint khi đạt Definition of Ready.
- Architecture changes phải tạo ADR mới; task không được tự ý phá ADR-001–ADR-011.
- Ưu tiên một vertical slice chạy được trước khi mở rộng số lượng adapters/reporters.

## 2. Epic summary

| Epic | Outcome | Priority | Dependencies |
|---|---|---|---|
| E1 — Project Foundation | Repo có boundaries, CI và quality checks | Must | None |
| E2 — Dataset & Runner | Validate/filter/run suite, giữ partial results | Must | E1 |
| E3 — Provider Layer | Mock, OpenAI, Gemini và normalized usage/errors | Must | E1, E2 |
| E4 — Evaluator Engine | Deterministic, JSON Schema và LLM judge | Must | E1–E3 |
| E5 — Scoring & Quality Gate | Risk-based verdict, metrics và exit code | Must | E2, E4 |
| E6 — Baseline & Regression | So sánh candidate với approved baseline | Must | E5 |
| E7 — Reporting & Observability | Terminal, JSON, HTML, logs, redaction | Must/Should | E2–E6 |
| E8 — Portfolio Demo & Release Readiness | 50-case dataset, CI demo, docs | Must | E1–E7 |

## 3. E1 — Project Foundation

### US-001 — Scaffold modular monorepo

**As a** maintainer, **I want** package boundaries rõ ràng **so that** core không bị phụ thuộc vào provider/CLI implementation.

- **Priority:** Must
- **Requirements:** NFR-007, NFR-008
- **Acceptance criteria:**
  - pnpm workspace có `apps/cli` và các packages đã duyệt.
  - Node.js 22, TypeScript strict mode, lint/format/typecheck commands hoạt động.
  - Dependency rule được kiểm tra tự động hoặc bằng architecture test.

### US-002 — Define versioned domain contracts

**As a** framework developer, **I want** versioned core types/schemas **so that** adapters và artifacts có contract ổn định.

- **Priority:** Must
- **Requirements:** FR-001, FR-002, FR-010–012, NFR-001, NFR-007
- **Acceptance criteria:**
  - Có types cho suite, case, provider result, evaluator result, run artifact và policy.
  - Zod schemas reject unknown/invalid required fields với path rõ ràng.
  - `schemaVersion` và `artifactSchemaVersion` là bắt buộc.

### US-003 — Establish CI foundation

**As a** contributor, **I want** automated checks trên pull request **so that** code không hợp lệ bị chặn sớm.

- **Priority:** Must
- **Requirements:** NFR-002, NFR-006, NFR-008
- **Acceptance criteria:**
  - CI chạy install, lint, typecheck, unit tests và coverage.
  - Core coverage gate tối thiểu 80%.
  - Secret/dependency scanning có cấu hình và không in secrets.

## 4. E2 — Dataset & Runner

### US-004 — Load and validate config/suite

**As a** QA engineer, **I want** validation trước API call **so that** lỗi dữ liệu không làm tốn chi phí.

- **Priority:** Must
- **Requirements:** FR-001, FR-002
- **Acceptance criteria:**
  - JSON/YAML hợp lệ được normalize về domain objects.
  - Invalid file trả exit code `2`, field path và safe reason.
  - Provider call count bằng `0` khi validation fail.

### US-005 — Filter evaluation cases

**As a** developer, **I want** lọc theo case/category/severity/tag **so that** có thể debug và chạy targeted suite.

- **Priority:** Must
- **Requirements:** FR-003
- **Acceptance criteria:**
  - Các filter hoạt động độc lập và kết hợp.
  - Unknown filter value tạo empty-selection error rõ ràng.
  - Filtered-out cases không nằm trong metric denominator.

### US-006 — Execute reproducible run lifecycle

**As a** QA engineer, **I want** mỗi run có snapshot và partial results **so that** có thể điều tra và tái hiện.

- **Priority:** Must
- **Requirements:** FR-003, FR-012, NFR-001, NFR-005, NFR-009
- **Acceptance criteria:**
  - Run lưu config/suite/prompt hashes, IDs, timestamp và optional git SHA.
  - Result order theo suite order dù execution concurrent.
  - Operational failure không làm mất results đã hoàn thành.

## 5. E3 — Provider Layer

### US-007 — Deterministic mock provider

**As a** contributor, **I want** mock provider **so that** full suite chạy offline và không tốn phí.

- **Priority:** Must
- **Requirements:** FR-006, NFR-001
- **Acceptance criteria:**
  - Fixture mapping hỗ trợ response, usage, latency và typed error scenarios.
  - Cùng input/fixture cho cùng normalized output.
  - Mock provider không yêu cầu API key.

### US-008 — Provider execution policy

**As a** maintainer, **I want** timeout/retry/concurrency thống nhất **so that** provider behavior predictable.

- **Priority:** Must
- **Requirements:** FR-019, NFR-004, NFR-005, NFR-010
- **Acceptance criteria:**
  - Retry chỉ áp dụng cho typed transient errors.
  - Global/provider concurrency caps được enforce.
  - Budget exhaustion dừng schedule case mới và giữ partial artifact.

### US-009 — OpenAI adapter

**As a** user, **I want** chạy suite với OpenAI model **so that** đánh giá ứng dụng/model thực.

- **Priority:** Must
- **Requirements:** FR-004, FR-013, FR-019
- **Acceptance criteria:**
  - Normalize text, usage, model/request IDs, finish reason và latency.
  - Map authentication/rate-limit/timeout/invalid/server errors.
  - API key chỉ đọc từ environment variable.

### US-010 — Gemini adapter

**As a** user, **I want** cùng suite chạy với Gemini **so that** có thể benchmark multi-provider.

- **Priority:** Must
- **Requirements:** FR-005, FR-013, FR-019
- **Acceptance criteria:**
  - Tuân theo cùng provider contract và error taxonomy.
  - Missing usage/cost được ghi `unavailable`, không phải `0`.
  - API key chỉ đọc từ environment variable.

### US-011 — Usage and cost accounting

**As an** engineering lead, **I want** token/cost/latency metrics **so that** quyết định model dựa trên quality–cost–latency.

- **Priority:** Must
- **Requirements:** FR-013, NFR-010
- **Acceptance criteria:**
  - Aggregate latency/tokens/cost và coverage của metrics.
  - Unknown values không bị tính như zero.
  - Dry-run và max estimated cost policy hoạt động.

## 6. E4 — Evaluator Engine

### US-012 — Deterministic text evaluators

**As a** QA engineer, **I want** exact/contains/must-not-contain/regex checks **so that** business rules rõ ràng được kiểm tra ổn định.

- **Priority:** Must
- **Requirements:** FR-007
- **Acceptance criteria:**
  - Mỗi evaluator trả verdict, reason, evidence và duration.
  - Unicode/case-sensitivity behavior được cấu hình và test.
  - Deterministic evaluators không gọi network.

### US-013 — JSON Schema evaluator

**As a** QA engineer, **I want** validate structured output **so that** contract violations được phát hiện rõ.

- **Priority:** Must
- **Requirements:** FR-008
- **Acceptance criteria:**
  - Parse lỗi và schema violation được phân biệt.
  - Evidence chỉ ra JSON path/keyword liên quan.
  - External schema references bị giới hạn theo safe resolution policy.

### US-014 — LLM-as-a-Judge evaluator

**As a** prompt engineer, **I want** semantic evaluation **so that** relevance, groundedness và instruction following được đo.

- **Priority:** Must
- **Requirements:** FR-009, FR-020, NFR-006
- **Acceptance criteria:**
  - Judge model có thể khác model under test.
  - Structured judge output qua Zod validation.
  - Prompt injection content được quote/delimit; malformed output tạo `ERROR`.

### US-015 — Human-review queue

**As a** reviewer, **I want** export low-confidence/disagreement cases **so that** con người xử lý phần AI không chắc chắn.

- **Priority:** Should
- **Requirements:** FR-021
- **Acceptance criteria:**
  - Case dưới confidence threshold được export.
  - Có reason/evidence an toàn và trace về run/case/evaluator.
  - Không yêu cầu web UI.

## 7. E5 — Scoring & Quality Gate

### US-016 — Aggregate case/category/run metrics

**As an** engineering lead, **I want** metrics nhất quán **so that** report và gate dùng cùng một nguồn dữ liệu.

- **Priority:** Must
- **Requirements:** FR-010, FR-011, FR-013
- **Acceptance criteria:**
  - Deterministic failure precedence được enforce.
  - Score, confidence, verdict và error không bị trộn semantics.
  - Category/run metrics dùng denominator đã định nghĩa.

### US-017 — Evaluate risk-based quality gate

**As a** release owner, **I want** critical/category/overall gates **so that** regression nghiêm trọng bị chặn.

- **Priority:** Must
- **Requirements:** FR-017, FR-018
- **Acceptance criteria:**
  - Critical failure luôn block khi policy bật.
  - Error rate, category regression và overall pass rate chạy đúng thứ tự.
  - Report liệt kê mọi gate failure đã biết.

### US-018 — Stable CLI exit codes

**As a** CI pipeline, **I want** exit codes ổn định **so that** phân biệt quality, validation và operational failures.

- **Priority:** Must
- **Requirements:** FR-018
- **Acceptance criteria:**
  - Exit codes `0–4` đúng theo system design.
  - Reporter failure không che nguyên nhân run ban đầu.
  - E2E tests cover từng exit-code class.

## 8. E6 — Baseline & Regression

### US-019 — Validate baseline compatibility

**As a** QA engineer, **I want** biết baseline có comparable không **so that** delta không bị hiểu sai.

- **Priority:** Must
- **Requirements:** FR-017
- **Acceptance criteria:**
  - Kiểm tra suite ID, schema major và metric compatibility.
  - Cases được phân loại matched/added/removed/changed.
  - Incompatible baseline trả safe actionable error.

### US-020 — Compare candidate with baseline

**As a** prompt engineer, **I want** metric/category delta **so that** biết thay đổi gây regression ở đâu.

- **Priority:** Must
- **Requirements:** FR-017
- **Acceptance criteria:**
  - Category delta mặc định dùng matched unchanged cases.
  - Critical regressions và affected cases hiển thị rõ.
  - Cost/latency delta chỉ tính khi data coverage đủ.

### US-021 — Explicit baseline promotion

**As a** release owner, **I want** promote baseline bằng command riêng **so that** run sai không tự trở thành chuẩn.

- **Priority:** Should
- **Requirements:** FR-022
- **Acceptance criteria:**
  - Không có auto-update baseline sau run.
  - Command validate source artifact trước write.
  - Existing target cần explicit overwrite/guard behavior.

## 9. E7 — Reporting & Observability

### US-022 — Terminal and JSON reports

**As a** user/CI, **I want** human-readable và machine-readable reports **so that** có thể debug và integrate.

- **Priority:** Must
- **Requirements:** FR-014, FR-015
- **Acceptance criteria:**
  - Cả hai dùng cùng immutable `RunArtifact`.
  - JSON report validate theo versioned schema.
  - Terminal nêu gate reasons, critical failures và report path.

### US-023 — Static HTML report

**As a** reviewer, **I want** HTML report không cần server **so that** có thể xem và chia sẻ CI artifact.

- **Priority:** Should
- **Requirements:** FR-016, FR-020
- **Acceptance criteria:**
  - Self-contained và mở local được.
  - Có overview, deltas, failure filters và case details.
  - Escape mọi dynamic/untrusted content.

### US-024 — Structured logging and redaction

**As a** maintainer, **I want** correlation IDs và safe logs **so that** điều tra lỗi mà không lộ secret.

- **Priority:** Must
- **Requirements:** FR-020, NFR-006, NFR-009
- **Acceptance criteria:**
  - NDJSON event có run/case/attempt IDs.
  - Central redactor áp dụng ở mọi log level và artifact path.
  - Không log headers, env dump, chain-of-thought hoặc API keys.

## 10. E8 — Portfolio Demo & Release Readiness

### US-025 — Build e-commerce evaluation dataset

**As a** recruiter/demo viewer, **I want** realistic dataset **so that** thấy rõ năng lực AI Quality Engineering.

- **Priority:** Must
- **Requirements:** MVP AC-2, FR-003, FR-007–009
- **Acceptance criteria:**
  - Tối thiểu 50 cases, 5 categories và đủ severity levels.
  - Có positive, negative, boundary, ambiguous, adversarial và policy-conflict cases.
  - `REFUND_001` bắt được claim sai “30 days”.

### US-026 — Demonstrate CI quality gate

**As a** portfolio reviewer, **I want** xem pass/fail workflows **so that** hiểu giá trị regression gate.

- **Priority:** Must
- **Requirements:** MVP AC-7–9, NFR-008
- **Acceptance criteria:**
  - PR/default workflow chạy mock suite.
  - Có reproducible baseline-pass và regression-fail examples.
  - JSON/HTML reports được giữ làm CI artifacts.

### US-027 — Publish engineering documentation

**As a** new user, **I want** quick start và architecture/limitations/ROI docs **so that** chạy demo trong 10 phút và hiểu trade-offs.

- **Priority:** Must
- **Requirements:** MVP AC-1, AC-12
- **Acceptance criteria:**
  - README có quick start, architecture, examples, reports, limitations và roadmap.
  - Không cần paid API để chạy default demo.
  - Có demo GIF/screenshots ở release-readiness stage, không chặn core implementation.

## 11. Backlog priority order

```text
US-001 → US-002 → US-004 → US-007 → US-012 → US-016 → US-022
    ↓ vertical slice đầu tiên: mock case → verdict → JSON report

Sau đó:
US-005/006/008 → US-013/017/018 → US-009/010/011 →
US-014/015 → US-019/020/021 → US-023/024 → US-025/026/027
```

## 12. Definition of Ready

Một story chỉ được triển khai khi:

- có story ID, requirement links và priority;
- acceptance criteria kiểm thử được;
- dependencies hoàn thành hoặc có test double;
- input/output contract đã có trong approved design;
- test specification liên quan đã được xác định;
- không còn câu hỏi làm thay đổi architecture;
- sample data không chứa dữ liệu thật nhạy cảm;
- estimate đủ nhỏ để hoàn thành trong một sprint.

## 13. Definition of Done

Một story chỉ được Done khi:

- implementation đáp ứng acceptance criteria;
- unit/contract/integration/E2E tests liên quan pass;
- negative/error paths được test;
- typecheck, lint và coverage gate pass;
- không lộ secret hoặc unredacted sensitive data;
- docs/schema/examples được cập nhật;
- traceability matrix được cập nhật;
- reviewer xác nhận không phá ADR và unrelated behavior;
- thay đổi có evidence trong CI.

## 14. Phase gate

**Status:** `PASSED`

Backlog được phép chuyển thành implementation work. Mọi thay đổi story/scope phải cập nhật traceability và được review.
