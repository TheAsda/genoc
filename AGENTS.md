# AGENTS.md — genoc

## What this project does

Generates typed TypeScript HTTP clients from OpenAPI 3.0 / 3.1 specs (JSON/YAML, file or URL). Outputs two files: `contracts.ts` (types) and `client.ts` (client with `createClient(requester)` factory) into the specified output directory. The user supplies a `Requester` implementation at runtime. Requires Node ≥ 18.

## Commands

```bash
npm run build          # tsc → dist/
npm run check          # tsc --noEmit (type check only)
npm run test           # vitest run
npm run lint           # oxlint
npm run lint:fix       # oxlint --fix
npm run format         # oxfmt --write
npm run format:check   # oxfmt --check
```

No watch mode. CI workflow configured in `.github/workflows/ci.yml` (lint, format check, type check, test on bun). Build before testing generated output.

### Running a single test

```bash
npx vitest run tests/unit/schema-mapper.test.ts
npx vitest run tests/integration/petstore.test.ts
```

Update snapshots: `npx vitest run --update` (or `-u`).

## Architecture (codegen pipeline)

```
spec-reader → version detection → validation → ref-resolver → path-analyzer → schema-mapper
                                                                                     ↓
                                              contracts-generator ←────────────────┘
                                              client-generator ←── method-generator + error-types
                                                     ↓
                                              write to disk
```

### Key modules

| Directory / File                       | Purpose                                                                                                           |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `src/parser/`                          | Spec loading (`spec-reader`), `$ref` resolution (`ref-resolver`), validation                                      |
| `src/parser/version/`                  | `VersionStrategy` interface with `v3.0/`, `v3.1/`, `v3.2/` (stub) implementations. Registry auto-detects version. |
| `src/analyzer/`                        | Path → `AnalyzedOperation[]`, schema → TS type strings (`SchemaMapper`), method naming (`naming.ts`)              |
| `src/generator/contracts-generator.ts` | Generates the `*.contracts.ts` file                                                                               |
| `src/generator/client-generator.ts`    | Generates the `*.client.ts` file (method bodies via `buildClientMethodBody`) + file I/O (`generateFullOutput`)    |
| `src/generator/method-generator.ts`    | Generates individual API method signatures (params, JSDoc)                                                        |
| `src/generator/error-types.ts`         | `ApiError<TStatus, TData>`, `DefaultApiError`, per-operation error type generation                                |
| `src/utils/generator-helpers.ts`       | Shared codegen helpers: `toPascalCase`, `getOperationTypePrefix`, `getSuccessType`, `getErrorType`, `makeHeader`  |
| `src/types/`                           | Shared types: `OpenAPIDocument`, `GeneratorConfig`, `MethodNameStrategy`, `SchemaObject`                          |
| `src/utils/`                           | Case conversion (`case.ts`), string utils, URL helpers                                                            |

### Entry points

- **CLI**: `src/cli/` — 4-file structure using `@stricli/core`:
  - `app.ts` — Command definition (`buildCommand` + `buildApplication`), typed flags, lazy loader
  - `impl.ts` — Lazy-loaded implementation using `this.process.stdout.write()` (not `console.log`)
  - `index.ts` — Thin entry point: shebang + `run(app, args, { process })` + `process.exit()`
  - `errors.ts` — `UserError` class for CLI-facing errors
  - Binary: `genoc <spec> [flags]` (positional spec arg, not `--input`)
- **Programmatic**: `src/index.ts` → `generateClient(config)`. Runtime exports: `generateClient`, `loadSpec`. Type exports: `GeneratorConfig`, `GenerationOptions`, `ApiClient`, `ApiError`, `DefaultApiError`.

### CLI flags

| Flag                     | Default      | Description                                                  |
| ------------------------ | ------------ | ------------------------------------------------------------ |
| `--output-dir`           | (required)   | Output directory                                             |
| `--method-name-strategy` | `path-based` | `path-based` \| `operationId` \| `operationId-with-fallback` |
| `--spec-version`         | auto-detect  | Override version detection (`"3.0"` or `"3.1"`)              |
| `--strict-version`       | `true`       | Warn if `--spec-version` mismatches detected version         |

## ESM module system

`"type": "module"` with `NodeNext` resolution. **All local imports use `.js` extensions** (required by NodeNext). Example:

```ts
import { load } from '../parser/spec-reader.js';
```

## TypeScript strictness

`tsconfig.json` enables `verbatimModuleSyntax` and `erasableSyntaxOnly`:

- **`import type` required** for type-only imports (no runtime value). Use `import type { X }` or `import { type X }`.
- **No `enum` declarations**, `namespace`, parameter properties, or other non-erasable syntax.

## Key conventions

- **Shared codegen helpers** (`toPascalCase`, `getOperationTypePrefix`, `getSuccessType`, `getErrorType`) live in `src/utils/generator-helpers.ts`. All generators import from this single source.
- Type naming prefix: `{Method}{PathSegments}` in PascalCase (e.g., `GetApiV1Products`).
- Output file names are fixed: `contracts.ts` and `client.ts`, written directly into the output directory.
- Method naming strategies: `path-based` (default, from HTTP method + path segments), `operationId` (from spec's `operationId`), `operationId-with-fallback` (uses `operationId` if present, else path-based).
- Parameter order in generated methods: path → query → body → headers (headers always last).

## Test structure

- **`tests/unit/`** — one test file per module. Includes `version/` subdirectory for version strategy tests (detector, registry, v3.0 normalizer/validator, cross-version).
- **`tests/integration/`** — full pipeline tests with snapshot assertions + `tsc --strict --noEmit` compilation of generated output. Petstore specs (v3.0, v3.1) are the primary fixtures. `real-world-specs/` for additional coverage. Snapshots in `__snapshots__/`.
- **`tests/validation/`** — comprehensive OpenAPI feature coverage tests organized by version and area (data types, keywords, params, bodies, uploads, refs, components, responses, errors, security, servers, operations, webhooks). 13 test files.
- **`tests/spec-examples/`** — OpenAPI spec feature tests (schemas, parameters, request bodies, responses). Has `v3.0/` subdirectory for version-specific behavior (nullable, exclusive-min-max, file-upload).
- **`tests/fixtures/`** — OpenAPI spec files used by tests. `v3.0/` subdirectory for 3.0-specific fixtures.
- **`tests/type-assertions/`** — Compile-time type correctness checks (e.g. `is-defined-error-types.ts`).
- **`tests/poc/`** — Proof-of-concept files validating codegen patterns compile correctly (e.g. `symbol-const-check.ts`).
- **`tests/type-helpers.ts`** / **`tests/type-helpers.test.ts`** — Shared type assertion utilities.
- Vitest config: `globals: true` — tests use global `describe`/`it`/`expect` without explicit imports.

### Integration test pattern

Integration tests compile generated output with `tsc --strict` to verify type correctness. The `TSC_FLAGS` constant is defined per test file.

## Version strategy pattern

`src/parser/version/` implements a strategy pattern:

- `VersionStrategy` interface — `matches()`, `normalizeSpec()`, `validateSpec()`, `resolveRef()`
- `VersionStrategyRegistry` — registers strategies, auto-detects via `detectAndResolve()`
- `V3_0_VersionStrategy` — `nullable` keyword, `exclusiveMin/Max` as booleans, `$ref` siblings ignored
- `V3_1_VersionStrategy` — type arrays, `$ref` siblings merged (`preserveRefSiblings`), `webhooks`
- `V3_2_VersionStrategy` — stub, throws "not yet supported"

`RefResolver` takes a `preserveRefSiblings` option (set to `true` for 3.1 specs).

## Generated output structure

**Contracts file** (`*.contracts.ts`): schema types → security scheme types → server variable types → per-operation query/header/body/response/error types → `StreamResponse` class (headers as `Record<string, string>`) → `ErrorResponse` class (headers as `Record<string, string>`) → `ApiError<TStatus, TData>` class → `DefaultApiError<TData>` class → `RequesterFailError`. Also includes per-operation error union types and `DefaultErrorBody` when `default` responses are present. Helper functions: `streamResponse()`, `errorResponse()`.

**Client file** (`*.client.ts`): imports from contracts file (`ApiError`, `UnspecifiedApiError`, `ErrorResponse`, `StreamResponse`, `RequesterFailError`) → `decorateWithErrors<T, E>()` (attaches `__definedErrors` property) → `Requester` type (returns `TResponse | StreamResponse | ErrorResponse`) → `isDefinedError` type guard (uses `__definedErrors` property for narrowing) → `createClient(requester)` factory → methods with try/catch wrapping `ApiError` throws + `StreamResponse` binary handling. Error codes attached via `decorateWithErrors(fn, [400, ...] as const)`.

## Dependencies

Runtime: `yaml` (parsing), `@stricli/core` (CLI framework). Dev: `typescript`, `vitest`, `oxlint`, `oxfmt`.
