# Security model

LLM Eval Studio is a local engineering console, not a public or multi-tenant service. Its default production listener is `127.0.0.1:4317`.

## Trust boundaries

- Provider responses, judge output, datasets, schemas, reports, filenames, URL parameters, and browser input are untrusted.
- Provider credentials stay in server environment variables. They are never accepted from or returned to the browser.
- The UI receives opaque resource IDs and redacted canonical evidence, not arbitrary filesystem paths.
- Raw model responses are omitted by default; unavailable values are not fabricated as zero.

## Enforced controls

- Host and Origin allowlists reject DNS-rebinding and cross-origin requests.
- Every mutation requires an HttpOnly SameSite session cookie plus a CSRF token.
- The server binds to loopback by default and does not infer a public listener.
- Config, suite, fixture, schema, artifact, baseline, and static-asset paths are contained after symlink resolution and restricted by extension/identifier allowlists.
- HTML report content is escaped. React renders model evidence as text.
- Production responses set CSP, frame denial, MIME sniffing denial, strict referrer, same-origin resource, and restricted browser-permission headers. API responses use `Cache-Control: no-store`.
- Baseline overwrite requires an explicit confirmation and the expected hash of the current baseline.
- Logs and public problem responses use safe error codes/messages and omit secrets and unrestricted paths.

## Verification

The automated threat suite covers rejected Host/Origin/CSRF requests, path and symlink escape, canary-secret leakage, XSS-safe rendering, stale baseline hashes, allowlisted downloads/assets, and safe 404/500 responses. CI also runs dependency auditing and gitleaks.

Report security issues without including real credentials, customer data, or unsafe model content. Use synthetic reproduction data.
