# llm-eval-kit

An automated quality engineering framework for testing, benchmarking, and regression-testing LLM-powered applications.

## Project status

Phase 4 implementation is in progress. Sprint 2 provides an offline multi-case evaluation slice with targeted filters, deterministic text and JSON Schema evaluators, risk-based scoring, canonical artifacts, and CI-safe exit codes.

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
- [Sprint 2 execution record](docs/aidlc/AIDLC_04_Sprint_2_Execution_Record.md)

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

## License

MIT
