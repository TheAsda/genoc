# AGENTS.md — genoc

## What this project does

Generates typed TypeScript HTTP clients from OpenAPI 3.0 / 3.1 specs (JSON/YAML, file or URL). Outputs three files: `contracts.ts` (types), `client.ts` (client with `createClient(requester)` factory), and `index.ts` (barrel re-exporting both) into the specified output directory. The user supplies a `Requester` implementation at runtime. Requires Node ≥ 18.

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
spec-reader → version detection → validation → ref-resolver → analyzer (analyze() → AnalyzedSpec)
                                                                                     ↓
                                               contracts-generator ←────────────────┘   (renderers read AnalyzedSpec
                                               client-generator ←── method-generator     only — never the raw spec)
                                                      ↓
                                               pipeline → write to disk
```

### Key modules

| Directory / File                       | Purpose                                                                                                                                                                                                                                                                    |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/parser/`                          | Spec loading (`spec-reader`), `$ref` resolution (`ref-resolver`), validation                                                                                                                                                                                               |
| `src/parser/version/`                  | Version seam: `resolveVersion(doc, override?)` → `VersionProfile` (detected/effective dialect + derived `preserveRefSiblings`) and `validateSpec(doc, version)` dispatching to per-version validators.                                                                     |
| `src/analyzer/`                        | Translation layer: `analyze(doc)` → `AnalyzedSpec` (operations, finished TS type text, security/server types, multipart/binary facts) in `analyze.ts`; path → `AnalyzedOperation[]` (`path-analyzer.ts`), schema → TS types (`SchemaMapper`), method naming (`naming.ts`)  |
| `src/generator/contracts-generator.ts` | Renders the `*.contracts.ts` file from `AnalyzedSpec` (`renderContracts`) — pure string assembly, no raw spec reads                                                                                                                                                        |
| `src/generator/client-generator.ts`    | Renders the `*.client.ts` file from `AnalyzedSpec` (`renderClient`, method bodies via `buildClientMethodBody`) + `generateOutput` orchestration over both renderers                                                                                                        |
| `src/generator/method-generator.ts`    | Generates individual API method signatures (params, JSDoc)                                                                                                                                                                                                                 |
| `src/pipeline.ts`                      | Pipeline entry `generateFullOutput(doc, config)`: builds `RefResolver` → runs `analyze()` once → `generateOutput` → writes files to disk. Enforced boundary: generators must not import `src/types/openapi` (oxlint `no-restricted-imports`, scoped to `src/generator/**`) |
| `src/utils/generator-helpers.ts`       | Shared codegen helpers: `toPascalCase`, `makeHeader`, `sanitizeTypeName`, `buildSchemaRenameMap`, JSDoc builders                                                                                                                                                           |
| `src/utils/operation-naming.ts`        | Single source of operation-derived names: `getOperationTypePrefix`, `getSuccessType`, `getErrorType`, runtime/client name constants, derived `RESERVED_TYPE_NAMES`                                                                                                         |
| `src/types/`                           | Shared types: `OpenAPIDocument`, `GeneratorConfig`, `MethodNameStrategy`, `SchemaObject`                                                                                                                                                                                   |
| `src/utils/`                           | Case conversion (`case.ts`), string utils, URL helpers                                                                                                                                                                                                                     |

### Entry points

- **CLI**: `src/cli/` — 4-file structure using `@stricli/core`:
  - `app.ts` — Command definition (`buildCommand` + `buildApplication`), typed flags, lazy loader
  - `impl.ts` — Lazy-loaded implementation using `this.process.stdout.write()` (not `console.log`); drives `src/pipeline.ts`'s `generateFullOutput`
  - `index.ts` — Thin entry point: shebang + `run(app, args, { process })` + `process.exit()`
  - `errors.ts` — `UserError` class for CLI-facing errors
  - Binary: `genoc [<spec>] [flags]` (optional positional spec arg, not `--input`)
- **Runtime**: `src/runtime/` — published as the `genoc/runtime` package export (the only export; the package root exports nothing and there is no programmatic API). Generated code imports `Requester`, response/error classes, and `isDefinedError` from here.

### CLI flags

| Flag                     | Default         | Description                                                                                              |
| ------------------------ | --------------- | -------------------------------------------------------------------------------------------------------- |
| `--output-dir`           | (optional)      | Output directory; required when no config file supplies it                                               |
| `--method-name-strategy` | `path-based`    | `path-based` \| `operationId` \| `operationId-with-fallback`                                             |
| `--spec-version`         | auto-detect     | Override version detection (`"3.0"` or `"3.1"`)                                                          |
| `--strict-version`       | `true`          | Warn if `--spec-version` mismatches detected version; config file value applies when the flag is omitted |
| `--runtime-import-path`  | `genoc/runtime` | Module specifier generated code imports runtime classes from                                             |
| `--proxy`                | (none)          | HTTP(S) proxy URL for fetching specs; overrides HTTP_PROXY/HTTPS_PROXY env vars                          |
| `--config`               | (none)          | Path to `.genocrc.yml` / `.genocrc.json`; skips discovery                                                |
| `--project`              | (none)          | Run only the named client from a multi-client config                                                     |

Config files: `.genocrc.yml` (not `.genocrc.yaml`) and `.genocrc.json`, discovered per-directory then upward to the git boundary; `--config <path>` skips discovery. Relative `input`/`outputDir` resolve against the config file's directory. See the README "Configuration Files" section for shapes, precedence, and conflict rules.

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

- **Operation naming lives in one module** (`src/utils/operation-naming.ts`): the operation type-prefix helpers, runtime/client name constants, and the derived `RESERVED_TYPE_NAMES`. All generators import names from this single source.
- Type naming prefix: `{Method}{PathSegments}` in PascalCase (e.g., `GetApiV1Products`).
- Output file names are fixed: `contracts.ts`, `client.ts`, and `index.ts`, written directly into the output directory.
- Method naming strategies: `path-based` (default, from HTTP method + path segments), `operationId` (from spec's `operationId`), `operationId-with-fallback` (uses `operationId` if present, else path-based).
- Parameter order in generated methods: path → query → body → headers (headers always last).

## Test structure

- **`tests/unit/`** — one test file per module. Includes `version/` subdirectory for version subsystem tests (detector, resolveVersion, validate dispatch, v3.0 validator, cross-version).
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

## Version module

`src/parser/version/` owns two jobs — "what dialect is this spec" and "is it valid":

- `resolveVersion(doc, override?)` (in `version-detector.ts`) — always runs real detection and returns a `VersionProfile`: `{ detected, effective, preserveRefSiblings }`. An explicit override becomes `effective`; `preserveRefSiblings` is derived from `effective` (`'3.1'` ⇒ `true`). A 3.2 document throws the "not yet supported" error here.
- `validateSpec(doc, version)` (in `validate.ts`) — dispatches to `v3.0/validator.ts` or `v3.1/validator.ts`; throws on invalid documents.

`RefResolver` takes a `preserveRefSiblings` option, sourced from `VersionProfile` (no string-comparing `doc.openapi` outside this module — see CONTEXT.md).

## Generated output structure

**Contracts file** (`*.contracts.ts`): schema types → security scheme types → server variable types → per-operation query/header/body/response/error types → `StreamResponse` class (headers as `Record<string, string>`) → `ErrorResponse` class (headers as `Record<string, string>`) → `ApiError<TStatus, TData>` class → `DefaultApiError<TData>` class → `RequesterFailError`. Also includes per-operation error union types.

**Client file** (`*.client.ts`): imports from contracts file (`ApiError`, `UnspecifiedApiError`, `ErrorResponse`, `StreamResponse`, `RequesterFailError`) → `decorateWithErrors<T, E>()` (attaches `__definedErrors` property) → `Requester` type (returns `TResponse | StreamResponse | ErrorResponse`) → `isDefinedError` type guard (uses `__definedErrors` property for narrowing) → `createClient(requester)` factory → methods with try/catch wrapping `ApiError` throws + `StreamResponse` binary handling. Error codes attached via `decorateWithErrors(fn, [400, ...] as const)`.

**Index file** (`index.ts`): barrel under the standard genoc header with two star re-exports — `export * from './contracts.js';` + `export * from './client.js';`. Any future fixed value export must be added to the owning constant in `src/utils/operation-naming.ts` (`RUNTIME_CLASS_NAMES` / `CLIENT_SURFACE_NAMES`, so `RESERVED_TYPE_NAMES` derives it automatically), because star re-exports silently drop ambiguous names.

## Dependencies

Runtime: `yaml` (parsing), `@stricli/core` (CLI framework). Dev: `typescript`, `vitest`, `oxlint`, `oxfmt`.

<!-- gitnexus:start -->

# GitNexus — Code Intelligence

This project is indexed by GitNexus as **genoc** (1342 symbols, 2219 relationships, 57 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource                               | Use for                                  |
| -------------------------------------- | ---------------------------------------- |
| `gitnexus://repo/genoc/context`        | Codebase overview, check index freshness |
| `gitnexus://repo/genoc/clusters`       | All functional areas                     |
| `gitnexus://repo/genoc/processes`      | All execution flows                      |
| `gitnexus://repo/genoc/process/{name}` | Step-by-step execution trace             |

## CLI

| Task                                         | Read this skill file                                        |
| -------------------------------------------- | ----------------------------------------------------------- |
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md`       |
| Blast radius / "What breaks if I change X?"  | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?"             | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md`       |
| Rename / extract / split / refactor          | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md`     |
| Tools, resources, schema reference           | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md`           |
| Index, status, clean, wiki CLI commands      | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md`             |

<!-- gitnexus:end -->
