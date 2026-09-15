# llm-eval-kit

An automated quality engineering framework for testing, benchmarking, and regression-testing LLM-powered applications.

## Project status

Phase 4 implementation is in progress. Sprint 3 adds bounded concurrent execution, typed timeout/retry behavior, runtime cost budgets, normalized OpenAI and Gemini adapters, LLM-as-a-Judge, and human-review queue export. The default demo remains fully offline and free.

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
- [Sprint 3 execution record](docs/aidlc/AIDLC_04_Sprint_3_Execution_Record.md)

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
