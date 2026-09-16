# Architecture

`llm-eval-kit` is a file-based quality engineering framework with a shared application SDK. The CLI and the Local Evaluation Studio use the same validate, plan, run, compare, and baseline-promotion path. A run loads a versioned project configuration and evaluation suite, selects cases, calls one target provider, executes configured evaluators, applies risk-aware scoring, and writes immutable evidence.

```mermaid
flowchart TD
  A[CLI] --> B[Application SDK]
  H[React Studio] --> I[Loopback API]
  I --> B
  B --> C[Runner and provider]
  C --> D[Evaluators]
  D --> E[Risk scoring]
  E --> F[JSON, HTML and review artifacts]
  F --> G[CI quality gate]
```

## Package boundaries

| Package           | Responsibility                                                        |
| ----------------- | --------------------------------------------------------------------- |
| `apps/cli`        | Commands, stable exit codes and terminal/file presentation            |
| `apps/studio-api` | Loopback HTTP security, ID registries and redacted read endpoints     |
| `apps/studio-web` | Typed React routes, accessible local evidence presentation            |
| `sdk`             | Shared validate, plan, run, compare and baseline application facade   |
| `api-contracts`   | Strict versioned Studio request, response, problem and event schemas  |
| `core`            | Domain contracts, filtering, concurrency, retry and run orchestration |
| `config`          | Versioned JSON/YAML and Studio project-manifest validation            |
| `providers`       | Mock, OpenAI and Gemini adapters with injectable HTTP transport       |
| `evaluators`      | Deterministic checks, JSON Schema and LLM-as-a-Judge                  |
| `scoring`         | Case aggregation, severity rules and quality gates                    |
| `artifacts`       | Atomic run and explicitly promoted baseline persistence               |
| `reporters`       | Terminal, JSON, human-review and self-contained HTML output           |

## Trust boundaries

Provider text, judge output, datasets and referenced schemas are untrusted input. Schema references cannot escape the suite directory, HTML is escaped, secrets are centrally redacted, and raw responses are omitted by default. Studio binds to loopback, accepts only allowlisted Host/Origin values, protects mutations with session plus CSRF tokens, and exposes opaque IDs instead of filesystem paths. Manifest references and artifact discovery are checked after symlink resolution. An `ERROR` is operational uncertainty and is never converted to a quality `FAIL`. A baseline is never promoted automatically.

## Reproducibility

Artifacts include schema versions, definition hashes, config/suite hashes, resolved provider/model identity, timestamps and per-case evidence. Baseline comparisons exclude added, removed or definition-changed cases from regression math.
