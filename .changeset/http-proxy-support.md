---
'genoc': minor
---

Add HTTP(S) proxy support for fetching OpenAPI specs from URLs: new `--proxy` CLI flag and `proxy` programmatic option; `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY` environment variables are now respected when no flag is given (previously ignored — escape hatch: `NO_PROXY`).
