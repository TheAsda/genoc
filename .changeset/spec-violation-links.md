---
'genoc': patch
---

Validation errors that report a spec violation now link to the section of the OpenAPI specification that states the violated rule (e.g. `https://spec.openapis.org/oas/v3.1.1.html#info-version`), each dialect at its latest patch release. When `--spec-version` overrides detection, the override decides which page is linked; for documents whose dialect is unknown, `--spec-version` is used and 3.1.1 is the default. Unsupported features (Swagger 2.0, OpenAPI 3.2, external `$ref`s) remain link-free: those documents are valid and the errors cite a genoc limitation, not a specification rule. Version/dialect rules now live solely in the version module (the spec reader no longer duplicates them). Fixes #83.
