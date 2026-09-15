# AIDLC Phase 3 — Test Strategy & Specifications

> **Project:** LLM Evaluation Framework (`llm-eval-kit`)  
> **Status:** Approved  
> **Date:** 2026-09-15  
> **Approved:** 2026-09-15 by project owner  
> **Test principle:** Test the evaluator before trusting the evaluation

## 1. Test objectives

1. Chứng minh framework đưa ra verdict đúng, có lý do và reproducible.
2. Phân biệt chính xác quality failure, operational error và invalid input.
3. Chứng minh critical failure không bị average score che giấu.
4. Chứng minh adapters tuân theo cùng contracts dù SDK khác nhau.
5. Chứng minh reports nhất quán và không lộ secrets/untrusted HTML.
6. Chứng minh baseline comparison không tạo false regression do dataset change.
7. Đo giới hạn của LLM judge bằng human-labeled calibration set.

## 2. Quality risks và test response

| Risk | Test response |
|---|---|
| Sai scoring/gate | Pure unit + property-based + decision-table tests |
| Provider SDK drift | Contract tests + optional smoke tests |
| Judge không ổn định | Calibration, repeated-run agreement, malformed-output/fault tests |
| Retry tạo duplicate/cost tăng | Attempt accounting + fault injection |
| Partial run mất dữ liệu | Abrupt failure/budget/timeout integration tests |
| Baseline delta sai | Compatibility/change classification matrix |
| Secret/PII lộ | Canary secret tests trên logs, JSON, HTML, errors |
| HTML injection | Escaping/CSP-oriented tests với malicious payloads |
| Cross-platform lỗi | Linux/macOS CI matrix |
| 500-case suite chậm/oom | Mock-provider performance/load tests |

## 3. Test levels

| Level | Scope | Runs |
|---|---|---|
| Unit | Schemas, pure domain, evaluators, scoring, redaction | Every PR |
| Contract | Provider/evaluator/reporter/artifact interfaces | Every PR với fakes/fixtures |
| Integration | Runner, scheduler, artifact repository, reporters | Every PR |
| CLI E2E | Commands, outputs, exit codes | Every PR |
| Security | Secrets, escaping, unsafe refs, dependency scan | Every PR/scheduled |
| Performance | 500-case mock suite, internal overhead | Scheduled/release |
| Live smoke | OpenAI/Gemini minimal calls | Manual/scheduled khi có secrets |
| Judge calibration | Human-labeled semantic cases | Khi đổi judge prompt/model/rubric |

## 4. Test data strategy

### 4.1 Data layers

- **Unit fixtures:** input nhỏ, cô lập một rule.
- **Golden artifacts:** run/report outputs ổn định, không có timestamps ngẫu nhiên chưa normalize.
- **Fault fixtures:** 429, timeout, malformed response, auth error, filesystem failure.
- **Security canaries:** fake API keys/PII/HTML scripts để kiểm tra redaction và escaping.
- **Demo dataset:** 50+ e-commerce support cases, dữ liệu giả lập hoàn toàn.
- **Judge calibration set:** tối thiểu 30 cases có human labels và reason.

### 4.2 Demo dataset categories

| Category | Minimum cases | Critical focus |
|---|---:|---|
| Refund/return policy | 12 | Wrong eligibility/window |
| Product information | 10 | Invented material/price/availability |
| Shipping/delivery | 10 | Unsupported date/fee promises |
| Promotions/coupons | 10 | Invalid discount stacking/expiry |
| Safety/escalation | 8 | Sensitive action/advice, refusal/escalation |

Mỗi category cần positive, negative, boundary và adversarial cases. Ít nhất 20% cases mang severity `HIGH` hoặc `CRITICAL`.

## 5. Determinism policy

- Mock provider fixtures và clock/ID generators được inject.
- Unit/integration tests không gọi network.
- Test dùng live providers không quyết định core CI pass/fail trừ workflow explicit.
- LLM judge tests tách thành:
  - contract/fault tests deterministic bằng mock judge;
  - calibration tests với model thật, có tolerance và human labels.
- Golden snapshots phải normalize timestamps, UUIDs, latency và provider request IDs.

## 6. LLM judge validation

Không coi LLM judge là oracle mặc định.

### Calibration targets

| Metric | Initial target |
|---|---:|
| Verdict agreement với human labels | ≥ 85% |
| Critical false-pass rate | 0% trên calibration set |
| Structured-output parse success | ≥ 98% |
| Repeated-run verdict agreement | ≥ 90% qua 3 runs |
| Low-confidence cases routed to review | 100% |

Nếu critical false pass xuất hiện, judge/rubric không đủ điều kiện làm blocking evaluator; chỉ dùng advisory cho đến khi recalibrate.

## 7. Test specifications

### Input/configuration

| ID | Scenario | Expected result | Level |
|---|---|---|---|
| TS-001 | Load valid JSON và YAML suite | Normalize thành cùng domain shape | Unit/Integration |
| TS-002 | Missing required field/unknown field | Safe error có field path; exit `2` | Unit/E2E |
| TS-003 | Duplicate case ID/broken schema ref | Reject trước provider call | Integration |
| TS-004 | Filter case/category/severity/tag kết hợp | Chỉ selected cases chạy; denominator đúng | Unit/E2E |
| TS-005 | Filter không match case nào | Actionable empty-selection error | E2E |

### Provider and execution

| ID | Scenario | Expected result | Level |
|---|---|---|---|
| TS-006 | Mock provider success | Stable normalized response/usage | Contract |
| TS-007 | 429 rồi success | Retry đúng policy, attempt count đúng | Fault injection |
| TS-008 | Auth/invalid request error | Không retry; typed error; exit `3` theo run policy | Contract/E2E |
| TS-009 | Timeout hết retries | Partial artifact giữ completed cases | Integration |
| TS-010 | Concurrency cao hơn cap | Observed in-flight calls không vượt cap | Integration |
| TS-011 | Budget đạt khi run đang chạy | Không schedule mới; in-flight hoàn tất; partial artifact | E2E |
| TS-012 | Provider không trả token/cost | Field là unavailable; không cộng zero giả | Contract |
| TS-013 | OpenAI/Gemini fixture normalization | Cùng `GenerationResult` semantics | Contract |

### Evaluators

| ID | Scenario | Expected result | Level |
|---|---|---|---|
| TS-014 | Exact/contains với Unicode và case config | Verdict/evidence đúng | Unit |
| TS-015 | Forbidden phrase xuất hiện | Required evaluator `FAIL` | Unit |
| TS-016 | Invalid regex config | Validation error trước run | Unit |
| TS-017 | Valid/invalid/malformed JSON output | Phân biệt PASS/FAIL/parse failure | Unit |
| TS-018 | JSON Schema violation | Evidence có path và keyword | Unit |
| TS-019 | Malformed LLM judge output | Evaluator `ERROR`, không giả thành FAIL | Contract |
| TS-020 | Low judge confidence | Case `WARNING`, export human-review item | Integration |
| TS-021 | Prompt injection trong model response | Judge instructions vẫn tách biệt; schema output an toàn | Security/Calibration |

### Scoring and quality gate

| ID | Scenario | Expected result | Level |
|---|---|---|---|
| TS-022 | Required deterministic fail nhưng semantic score cao | Case `FAIL` | Unit |
| TS-023 | Critical case fail, overall pass 99% | Run gate `FAIL` | Unit/E2E |
| TS-024 | Warning case với default policy | Không tính pass; gate denominator đúng | Unit |
| TS-025 | Error rate 2% và trên 2% | Boundary đúng; trên threshold block operationally | Unit |
| TS-026 | Category giảm đúng 3pp và trên 3pp | Boundary đúng; chỉ trên threshold block | Unit |
| TS-027 | Multiple gate failures | Decision theo order; report liệt kê tất cả | Unit/Golden |

### Baseline and reports

| ID | Scenario | Expected result | Level |
|---|---|---|---|
| TS-028 | Baseline same suite/schema | Matched comparison thành công | Integration |
| TS-029 | Added/removed/changed cases | Phân loại đúng; delta dùng unchanged matched cases | Unit |
| TS-030 | Incompatible baseline | Actionable error, không tạo misleading delta | E2E |
| TS-031 | Promote baseline | Chỉ command explicit; validate artifact; overwrite guarded | E2E |
| TS-032 | Terminal/JSON/HTML từ cùng artifact | Verdict/metrics nhất quán | Golden |

### Security, portability and performance

| ID | Scenario | Expected result | Level |
|---|---|---|---|
| TS-033 | Canary API key trong errors/input | Không xuất hiện trong logs/reports | Security |
| TS-034 | `<script>` và event handler trong response | HTML hiển thị escaped text, không executable | Security |
| TS-035 | External/path traversal schema ref | Bị chặn theo safe resolution policy | Security |
| TS-036 | Run trên Linux/macOS | CLI behavior và exit codes nhất quán | CI matrix |
| TS-037 | 500-case mock suite | Hoàn tất ổn định; internal p95 ≤ 100ms/case | Performance |
| TS-038 | Một case lỗi giữa 500 cases | Không mất completed results; order ổn định | Performance/Fault |

### Portfolio demo and usability

| ID | Scenario | Expected result | Level |
|---|---|---|---|
| TS-039 | Fresh clone + mock quick start | Người mới chạy thành công trong ≤10 phút | Usability |
| TS-040 | `REFUND_001` trả sai “30 days” | Must-not-contain/groundedness phát hiện; CI exit `1` | E2E |
| TS-041 | Baseline prompt đúng “14 days” | Run pass và artifact đầy đủ | E2E |
| TS-042 | Paid provider secrets không tồn tại | Default mock demo vẫn pass; paid suite skip rõ ràng | CI |

## 8. Property-based and decision-table tests

Các invariant cần property-based tests:

- pass/error rates luôn trong `[0,1]`;
- score/confidence luôn trong `[0,1]` hoặc absent;
- result order không đổi khi completion order thay đổi;
- thêm filtered-out case không thay metric;
- critical failure luôn block khi policy bật;
- reporter không thay đổi canonical artifact;
- redaction là idempotent;
- aggregate không tạo `NaN` khi denominator bằng zero.

## 9. Exit-code test matrix

| Condition | Expected code |
|---|---:|
| Valid run, gate pass | 0 |
| Valid run, quality gate fail | 1 |
| Invalid config/dataset/schema | 2 |
| Provider/budget/operational failure vượt policy | 3 |
| Unclassified internal defect | 4 |

Nếu vừa có quality failures vừa có operational invalidity vượt threshold, code `3` có precedence vì run không đủ tin cậy để kết luận quality.

## 10. CI execution matrix

| Workflow | Trigger | Suites | Blocks merge |
|---|---|---|---|
| Core PR | Every PR | Unit, contract with mocks, integration, CLI E2E, security | Yes |
| Mock evaluation | Every PR | Full demo mock suite | Yes |
| Live smoke | Manual/scheduled | 2–5 cases/provider | No by default; alerts on failure |
| Judge calibration | Judge prompt/model/rubric change | Human-labeled set × repeated runs | Blocks judge promotion |
| Performance | Scheduled/release | 500-case mock suite | Blocks release, not ordinary PR |
| Dependency/security | PR + scheduled | Audit/secret scans | Yes theo severity policy |

## 11. Entry and exit criteria

### Test entry

- Story đạt Definition of Ready.
- Contract/schema liên quan đã approved.
- Test data/fixtures không chứa dữ liệu thật nhạy cảm.
- Expected verdict và reason đã được review.

### Test exit cho MVP

- Tất cả Must story acceptance tests pass.
- Không còn open defect severity Critical/High.
- Core coverage ≥80% và critical scoring/gate paths 100% branch-covered.
- TS-001–TS-042 có kết quả hoặc approved deferral cho Should scope.
- Live provider smoke pass gần nhất hoặc limitation được ghi rõ.
- Judge đạt calibration target trước khi dùng blocking.
- 500-case performance target pass.
- Secret/HTML injection tests pass.

## 12. Defect severity

| Severity | Definition | Release effect |
|---|---|---|
| Critical | False pass ở critical case; secret leak; baseline corruption | Block release |
| High | Sai exit code/gate; mất partial results; adapter contract sai | Block release |
| Medium | Report/evidence thiếu nhưng verdict đúng; degraded usability | Review before release |
| Low | Cosmetic/docs issue không ảnh hưởng decision | Có thể defer |

## 13. Human review checklist cho evaluation data

- Expected behavior bám business policy đã mô phỏng.
- Must/must-not rules không quá brittle.
- Severity phản ánh impact, không phản ánh độ khó test.
- Critical cases có deterministic evidence nếu có thể.
- Ambiguous case có expected clarification behavior.
- Adversarial input không chứa payload nguy hiểm thật.
- Human label của judge calibration có reason và reviewer identity/version.

## 14. Phase gate

**Status:** `PASSED`

Test specifications là input bắt buộc cho mọi implementation task trong Phase 4.
