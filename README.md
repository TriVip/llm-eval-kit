# llm-eval-kit

An automated quality engineering framework for testing, benchmarking, and regression-testing LLM-powered applications.

## Project status

Phase 4 implementation is in progress. Sprint 4 adds safe baseline compatibility and regression comparison, explicit baseline promotion, central redaction, structured logs, static HTML reports, and the complete MVP command surface. The default demo remains fully offline and free.

## Architecture

- `apps/cli` — command-line adapter
- `packages/core` — framework contracts, domain types, and error model
- `packages/config` — versioned Zod schemas and configuration parsing
- `packages/providers` — provider adapters
- `packages/evaluators` — deterministic and model-based evaluators
- `packages/scoring` — aggregation and risk-based quality gates
- `packages/artifacts` — run/baseline persistence
- `packages/reporters` — terminal, JSON, and HTML projections

The MVP is CLI-first and file-based. It does not require a server or database.

## Project documentation

The approved product, architecture, backlog, test strategy, traceability matrix, sprint plan, and execution evidence are maintained in [docs/aidlc](docs/aidlc/README.md).

- [Framework prototype](docs/aidlc/LLM_Evaluation_Framework_Prototype.md)
- [System design](docs/aidlc/AIDLC_02_System_Design.md)
- [Product backlog](docs/aidlc/AIDLC_03_Product_Backlog.md)
- [Sprint 4 execution record](docs/aidlc/AIDLC_04_Sprint_4_Execution_Record.md)

## Development

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test:coverage
pnpm build
```

## Run the offline demo

```bash
pnpm build
node apps/cli/dist/index.js run \
  --config examples/ecommerce-support/llmeval.config.json \
  --suite examples/ecommerce-support/suite.yaml \
  --fixtures examples/ecommerce-support/fixtures.json
```

Run a targeted selection by repeating or comma-separating filters:

```bash
node apps/cli/dist/index.js run \
  --config examples/ecommerce-support/llmeval.config.json \
  --suite examples/ecommerce-support/suite.yaml \
  --fixtures examples/ecommerce-support/fixtures.json \
  --category refund_policy \
  --severity critical \
  --tag smoke
```

Run the deliberate critical regression fixture (returns exit `1`):

```bash
node apps/cli/dist/index.js run \
  --config examples/ecommerce-support/llmeval.config.json \
  --suite examples/ecommerce-support/suite.yaml \
  --fixtures examples/ecommerce-support/fixtures-regression.json
```

Exit codes are stable: `0` pass, `1` quality gate failure, `2` invalid input, `3` operationally unreliable run, and `4` internal/framework failure.

## Validate, compare, and report

Validate inputs without calling a provider:

```bash
node apps/cli/dist/index.js validate \
  --config examples/ecommerce-support/llmeval.config.json \
  --suite examples/ecommerce-support/suite.yaml
```

Promote a reviewed run explicitly. Existing baselines are never replaced unless `--overwrite` is supplied:

```bash
node apps/cli/dist/index.js baseline save \
  --run reports/<approved-run-id>/run.json \
  --output reports/baseline.json
```

Compare a candidate with the compatible baseline. Only unchanged matched cases contribute to category deltas; added, removed, and changed cases are classified separately:

```bash
node apps/cli/dist/index.js compare \
  --run reports/<candidate-run-id>/run.json \
  --baseline reports/baseline.json
```

Render a self-contained local HTML report, optionally with baseline deltas:

```bash
node apps/cli/dist/index.js report \
  --run reports/<candidate-run-id>/run.json \
  --baseline reports/baseline.json \
  --format html \
  --output reports/report.html
```

Each run writes canonical `run.json`, `human-review.json`, and redacted `logs.ndjson`. HTML is also generated during `run` when `html` is included in `output.formats`. Dynamic content is escaped, secrets are centrally redacted, and raw responses are replaced when `retainRawResponses=false`.

## Provider execution

Validate a real-provider configuration without making API calls:

```bash
node apps/cli/dist/index.js run \
  --config examples/ecommerce-support/llmeval.openai.config.json \
  --suite examples/ecommerce-support/suite.yaml \
  --dry-run
```

To execute against OpenAI or Gemini, replace the placeholder model ID in the matching config and expose the API key only through the configured environment variable:

```bash
export OPENAI_API_KEY="..."
node apps/cli/dist/index.js run \
  --config examples/ecommerce-support/llmeval.openai.config.json \
  --suite examples/ecommerce-support/suite.yaml
```

```bash
export GEMINI_API_KEY="..."
node apps/cli/dist/index.js run \
  --config examples/ecommerce-support/llmeval.gemini.config.json \
  --suite examples/ecommerce-support/suite.yaml
```

Token prices are deliberately not hard-coded because provider pricing changes. Add a reviewed `target.pricing` object with input/output USD per million tokens when cost tracking is required. Unknown usage or cost remains unavailable and is never reported as zero.

For semantic evaluation, configure a separate `judge` target and use `llm_judge`, as demonstrated by `llmeval.semantic.openai.config.json` and `suite-semantic.yaml`. Judge output is schema-validated. Low-confidence model judgments become warnings and are exported to `reports/<run-id>/human-review.json`.

Provider unit and contract tests use injected HTTP transports; the default CI never requires credentials or spends API budget.

Run the semantic-evaluation and human-review flow entirely offline:

```bash
node apps/cli/dist/index.js run \
  --config examples/ecommerce-support/llmeval.semantic.mock.config.json \
  --suite examples/ecommerce-support/suite-semantic.yaml \
  --fixtures examples/ecommerce-support/fixtures-semantic-target.json \
  --judge-fixtures examples/ecommerce-support/fixtures-semantic-judge.json
```

This deliberate low-confidence judge result produces a `WARNING` case and one item in `human-review.json`.

## License

MIT
