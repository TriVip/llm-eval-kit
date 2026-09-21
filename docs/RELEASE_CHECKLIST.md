# v0.1.0 release checklist

- [x] Versioned JSON/YAML contracts and CLI command surface
- [x] Mock, OpenAI and Gemini providers
- [x] Deterministic, schema and model-based evaluators
- [x] Severity-aware scoring and stable exit codes
- [x] Explicit baseline promotion and compatible regression comparison
- [x] Redacted JSON/log/review artifacts and escaped HTML report
- [x] 64-case reviewed e-commerce dataset with positive, negative, boundary and adversarial coverage
- [x] CI pass demo and deliberate critical-regression demo
- [x] 500-case internal benchmark and one-fault result-integrity test
- [x] 30-sample deterministic judge calibration gate
- [x] Dependency audit and secret scan workflows
- [x] Local Studio uses the shared SDK and preserves CLI/API artifact semantics
- [x] One-command production packaging and loopback startup verification
- [x] Automated accessibility checks, keyboard workflow, focus recovery and reduced-motion rules
- [x] Host/Origin/CSRF, containment, symlink, XSS, redaction and baseline-conflict threat tests
- [x] 500-case explorer and progress-burst performance checks
- [x] Chromium/Firefox browser workflow and Linux/macOS startup CI jobs
- [ ] Live OpenAI smoke with repository secret and model variable
- [ ] Live Gemini smoke with repository secret and model variable

The two live checks are optional for the offline MVP and are never silently reported as executed. `.github/workflows/provider-smoke.yml` prints an explicit skip unless both the provider key and model variable are configured.

## Release gate

Run `pnpm release:verify`. Tagging is allowed only after lint, format, typecheck, coverage, calibration, static release checks, portfolio pass demo and deliberate regression exit-code evidence pass.
