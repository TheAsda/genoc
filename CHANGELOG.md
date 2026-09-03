# genoc

## 0.3.0

### Minor Changes

- 7b4dd43: Add HTTP(S) proxy support for fetching OpenAPI specs from URLs: new `--proxy` CLI flag and `proxy` programmatic option; `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY` environment variables are now respected when no flag is given (previously ignored — escape hatch: `NO_PROXY`).

### Patch Changes

- 5ab175a: Remove the dead `src/generator/error-types.ts` module. `generateErrorTypes` was never called by the generation pipeline and had diverged from the live inline scheme (methodName-based prefixes, un-renamed tsTypes, inline ApiError classes already emitted by contracts-generator).
- 48289eb: Handle special characters in schema names and routes: any run of non-identifier symbols (brackets, backticks, hyphens, spaces, dots, tildes, ...) is folded into PascalCase, leading digits and exact reserved words get an `_` prefix, and schemas whose sanitized names collide are renamed with a `Model` suffix. Route-derived type prefixes and method names go through the same sanitization.

## 0.2.0

### Minor Changes

- f558199: Generate JSDoc documentation from OpenAPI field metadata. Field-level `description`, `deprecated`, `default`, `example`/`examples`, and `title` now flow into the generated output as JSDoc — on schema properties, query/header/body parameter types, response types, named type declarations, and client method JSDoc (lowest-numbered 2xx response description). Descriptions containing `*/` or newlines are now escaped/flattened instead of corrupting the generated file.

  **Output format change (regeneration required):** generated type tokens are provably unchanged — a stripped-comment equivalence harness verifies every type compiles identically to before — but object types now render as multi-line blocks with depth-aware indentation instead of single-line inline literals (`{ id: string; name: string; }` → one property per line). Generated files therefore differ textually: consumers diffing or snapshotting generated output must regenerate it. Note that JSDoc comments are preserved in `tsc --declaration` output, so published `.d.ts` text changes as well. Tag order is fixed: description → `@deprecated` → `@default` → `@example`(s) → `@title`. Composition rules: `allOf` parent metadata is emitted, inline `oneOf`/`anyOf` member and `items`/`additionalProperties` metadata is dropped; parameter-level metadata takes precedence over schema-level metadata on parameter types.

- 33b378e: Remove the `streamResponse()` and `errorResponse()` factory functions from `genoc/runtime`. They were zero-logic wrappers around the `StreamResponse` and `ErrorResponse` constructors, so the classes are all that remain on the runtime surface.

  **Breaking change:** code importing `streamResponse` or `errorResponse` from `genoc`, `genoc/runtime`, or a generated `contracts.ts` (which no longer re-exports them) must call the constructors directly instead:

  ```ts
  // before
  import { streamResponse, errorResponse } from 'genoc/runtime';
  const stream = streamResponse(data, filename, headers);
  const error = errorResponse(status, data, headers, message);

  // after
  import { StreamResponse, ErrorResponse } from 'genoc/runtime';
  const stream = new StreamResponse(data, filename, headers);
  const error = new ErrorResponse(status, data, headers, message);
  ```

  Both constructors default `headers` to `{}`, so calls that omitted the argument keep working unchanged. All other runtime exports (`StreamResponse`, `ErrorResponse`, `ApiError`, `UnspecifiedApiError`, `DefaultApiError`, `RequesterFailError`, `decorateWithErrors`, `isDefinedError`, `Requester`) are unaffected.

- 315e181: Add `genoc/runtime` subpath export containing the shared runtime contract: the `Requester` type, `StreamResponse`, `ErrorResponse`, error classes (`ApiError`, `UnspecifiedApiError`, `DefaultApiError`, `RequesterFailError`), response helpers (`streamResponse`, `errorResponse`), and `isDefinedError`/`decorateWithErrors`.

  Generated code now imports these from `genoc/runtime` instead of declaring inline copies (the generated `contracts.ts` re-exports them, so existing consumer imports keep working). This gives all generated clients a single class identity — `instanceof` checks work across clients and a shared `Requester` can be written and compiled against the package before any generation.

  Notes for consumers:
  - `genoc` is now a runtime dependency of generated output (previously the generated code was fully self-contained).
  - New `--runtime-import-path` CLI flag / `runtimeImportPath` programmatic config option overrides the import specifier (default `genoc/runtime`), e.g. `genoc@2.0.0/runtime` for version pinning.

## 0.1.3

### Patch Changes

- 418e5cd: Handle dotted contracts
- 6dfe0dc: Remove isError utility
- 3ba7344: Handle name collision

## 0.1.2

### Patch Changes

- 192cf5e: Update headers type
- 192cf5e: Update parameters order generation: params -> query -> body -> headers

## 0.1.1

### Patch Changes

- 089590e: Replace errorsSymbol with a hidden errors string property to fix typescript errors ts(4023) and ts(2527)

## 0.1.0

### Minor Changes

- 979a37f: Initial commit
