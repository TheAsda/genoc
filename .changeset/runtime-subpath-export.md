---
'genoc': minor
---

Add `genoc/runtime` subpath export containing the shared runtime contract: the `Requester` type, `StreamResponse`, `ErrorResponse`, error classes (`ApiError`, `UnspecifiedApiError`, `DefaultApiError`, `RequesterFailError`), response helpers (`streamResponse`, `errorResponse`), and `isDefinedError`/`decorateWithErrors`.

Generated code now imports these from `genoc/runtime` instead of declaring inline copies (the generated `contracts.ts` re-exports them, so existing consumer imports keep working). This gives all generated clients a single class identity — `instanceof` checks work across clients and a shared `Requester` can be written and compiled against the package before any generation.

Notes for consumers:

- `genoc` is now a runtime dependency of generated output (previously the generated code was fully self-contained).
- New `--runtime-import-path` CLI flag / `runtimeImportPath` programmatic config option overrides the import specifier (default `genoc/runtime`), e.g. `genoc@2.0.0/runtime` for version pinning.
