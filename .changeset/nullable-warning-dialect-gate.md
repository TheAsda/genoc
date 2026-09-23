---
'genoc': patch
---

The `'nullable' is deprecated in OpenAPI 3.1` generation warning is now gated by the effective spec dialect: it only fires when generating from a 3.1 spec, where `type: ["string", "null"]` is the modern replacement. OpenAPI 3.0 specs — where `nullable` is the correct and only mechanism — no longer produce the warning. The effective dialect is sourced from version detection (honoring `--spec-version` overrides) and threaded through the pipeline into the analyzer; as part of this, `SchemaMapper` now takes an options object instead of positional constructor parameters.
