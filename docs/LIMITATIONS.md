# Limitations

Version 0.1.0 is an engineering MVP, not a hosted evaluation service.

- Execution is local and file-based; there is no database, web dashboard, access control or multi-tenant isolation.
- OpenAI and Gemini are supported, but live smoke tests require user-supplied credentials and reviewed model IDs. Default CI is deliberately offline.
- Provider pricing is not hard-coded. Cost is unavailable until reviewed pricing is configured.
- The bundled 30-sample judge calibration uses deterministic mock evidence to verify the calibration pipeline. It does **not** prove that an arbitrary live judge is safe. A live judge must meet the documented thresholds before its verdict is blocking.
- LLM evaluation remains probabilistic. Low-confidence results require human review; automated scores do not replace domain experts.
- The portfolio dataset covers an e-commerce support domain and should not be treated as evidence for medical, legal, financial or other high-stakes domains.
- The 500-case benchmark measures framework overhead with an in-memory provider. Network latency and provider rate limits are excluded.
- No AI-agent tool-call evaluation, RAG retrieval metrics, distributed runners or historical trend service are included in this release.

Security reports should not include secrets or customer data. Use synthetic or properly anonymized datasets.
