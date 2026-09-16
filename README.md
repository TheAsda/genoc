# genoc

Generate TypeScript HTTP clients from OpenAPI 3.0 / 3.1 specifications.
Generated code depends only on the tiny `genoc/runtime` module. Full type safety. Bring your own HTTP client.

[![npm version](https://img.shields.io/npm/v/genoc)](https://www.npmjs.com/package/genoc)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-green)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-blue)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

## Features

- Full OpenAPI 3.0 and 3.1 specification support with automatic version detection
- End-to-end type safety — requests, responses, and errors are fully typed
- HTTP-client agnostic — adapter pattern lets you plug in fetch, axios, or anything else
- Shared runtime contract — `genoc/runtime` exports the `Requester` type and response/error classes, so one requester implementation works with every generated client
- Error types with per-status-code narrowing and type guards
- File and binary upload/download with stream handling
- Flexible method naming strategies (path-based, operationId, operationId-with-fallback)
- CLI and programmatic API

## Quick Start

Install:

```bash
npm install genoc
```

Generated code imports from `genoc/runtime`, so `genoc` is a runtime
dependency (not just `devDependencies`).

Generate:

```bash
genoc ./path/to/spec.yaml --output-dir ./src/api
```

This creates three files in `./src/api`:

- `contracts.ts` — Type definitions, error classes, and helper types
- `client.ts` — Typed client with `createClient(requester)` factory
- `index.ts` — Barrel re-exporting both files, so you can import directly from the output directory

The barrel means `import { createClient } from './index.js'` works too.

## Usage

The generated client requires a `Requester` implementation — a function that
performs the actual HTTP call and returns the result. The type lives in
`genoc/runtime`, so you can write and compile a requester before generating
anything:

```typescript
import type { Requester } from 'genoc/runtime';
```

```typescript
type Requester = <TResponse>(
  method: string,
  path: string,
  options: {
    query?: Record<string, unknown>;
    body?: unknown;
    headers?: Record<string, string>;
    expectStream?: true;
  }
) => Promise<TResponse | StreamResponse | ErrorResponse>;
```

### Basic Example with `fetch`

```typescript
import { createClient } from './client.js';
import type { Requester } from 'genoc/runtime';
import { RequesterFailError, ErrorResponse } from 'genoc/runtime';

const baseUrl = 'https://api.example.com';

const requester: Requester = async (method, path, options) => {
  const url = new URL(path, baseUrl);
  if (options.query) {
    Object.entries(options.query).forEach(([key, value]) => {
      url.searchParams.set(key, String(value));
    });
  }

  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    return new ErrorResponse(
      response.status,
      await response.json(),
      Object.fromEntries(response.headers.entries()),
      response.statusText
    );
  }

  return response.json();
};

const client = createClient(requester);

// Typed call — response type is inferred from the spec
const pets = await client.getPets({ limit: 10 });
```

See [Binary / File Responses](#binary--file-responses) for handling `expectStream: true`.

## Shared Runtime (`genoc/runtime`)

Generated clients import their response and error classes from `genoc/runtime`
instead of declaring inline copies (the generated `contracts.ts` re-exports
them, so existing imports keep working). This gives every generated client the
same class identity — `instanceof` checks work across clients, and you can
implement **one shared requester** typed against the package:

```typescript
// common-requester.ts — reusable across all generated clients,
// no generated imports needed
import type { Requester } from 'genoc/runtime';

export const requester: Requester = async (method, path, options) => {
  // ...your fetch/axios/etc. implementation
};
```

To pin a specific version or point at a mirror, override the import specifier
via `--runtime-import-path` (CLI) or `runtimeImportPath` (programmatic config).

## Binary / File Responses

When your spec defines binary responses (e.g. `format: binary`,
`application/octet-stream`, `image/*`), the generated client sends
`expectStream: true` in options. Your `Requester` should return a
`StreamResponse` in that case:

```typescript
import { StreamResponse } from 'genoc/runtime';

// Inside your Requester implementation:
if (options.expectStream === true) {
  return new StreamResponse(
    response.body as ReadableStream<Uint8Array>,
    getFilename(response.headers), // extract from Content-Disposition
    Object.fromEntries(response.headers.entries())
  );
}
```

`StreamResponse` is a simple container:

```typescript
class StreamResponse {
  data: ReadableStream<Uint8Array>;
  filename?: string;
  headers: Record<string, string>;
}
```

## CLI Reference

```bash
genoc [--output-dir dir | -o dir] [--method-name-strategy path-based|operationId|operationId-with-fallback] [--spec-version version] [--strict-version] [--runtime-import-path module] [--proxy url] [--config path] [--project name] [<spec>]
```

`<spec>` — Path or URL to an OpenAPI 3.0 / 3.1 spec (JSON or YAML). Optional when a
config file supplies the input; see [Configuration Files](#configuration-files).

| Flag                     | Default         | Description                                                                                                |
| ------------------------ | --------------- | ---------------------------------------------------------------------------------------------------------- |
| `--output-dir`, `-o`     | (optional)      | Output directory for generated files; required when no config file supplies `outputDir`                    |
| `--method-name-strategy` | `path-based`    | Method naming strategy                                                                                     |
| `--spec-version`         | auto-detect     | Override version detection (`"3.0"` or `"3.1"`)                                                            |
| `--strict-version`       | `true`          | Warn if `--spec-version` mismatches detected version; a config file value applies when the flag is omitted |
| `--runtime-import-path`  | `genoc/runtime` | Module specifier generated code imports runtime classes from                                               |
| `--proxy`                | (none)          | HTTP(S) proxy URL for fetching specs from URLs; overrides HTTP_PROXY/HTTPS_PROXY/NO_PROXY env vars         |
| `--config`               | (none)          | Path to a config file (`.genocrc.yml` or `.genocrc.json`); skips config discovery                          |
| `--project`              | (none)          | Run only the named client from a multi-client config; omit to run all clients                              |

## Configuration Files

Instead of repeating flags on every invocation, `genoc` can read its settings
from a config file.

### Supported files

Two file names are recognized:

- `.genocrc.yml` (YAML)
- `.genocrc.json` (JSON)

`.genocrc.yaml` is **not** supported — the YAML variant must be named
`.genocrc.yml`. TypeScript configs, a `genoc` section in `package.json`,
extensionless `.genocrc`, JSON5, and remote (URL) configs are not supported
either.

### Discovery

Run without `--config`, `genoc` searches for a config file:

1. In the current directory, `.genocrc.yml` wins over `.genocrc.json`
2. Then upward, one directory at a time
3. The search stops at the git repository boundary (the first directory
   containing `.git`)

`--config <path>` skips discovery and loads exactly the file you name
(`.yml` or `.json` extension required — `.yaml` is rejected).

### Config shapes

**Flat** — one client; the keys mirror the CLI flags:

```yaml
# .genocrc.yml
input: ./openapi/petstore.yaml
outputDir: ./src/api/petstore
methodNameStrategy: operationId-with-fallback
```

```json
{
  "input": "./openapi/petstore.yaml",
  "outputDir": "./src/api/petstore"
}
```

**`clients` map** — several clients in one file, each with its own `input` and
`outputDir` plus the optional strategy options:

```yaml
# .genocrc.yml
clients:
  petstore:
    input: ./openapi/petstore.yaml
    outputDir: ./src/api/petstore
  billing:
    input: ./openapi/billing.json
    outputDir: ./src/api/billing
    methodNameStrategy: operationId
    strictVersion: false
```

```json
{
  "clients": {
    "petstore": {
      "input": "./openapi/petstore.yaml",
      "outputDir": "./src/api/petstore"
    },
    "billing": {
      "input": "./openapi/billing.json",
      "outputDir": "./src/api/billing",
      "methodNameStrategy": "operationId"
    }
  }
}
```

Allowed keys: `input`, `outputDir`, `methodNameStrategy`, `specVersion`,
`strictVersion`, `runtimeImportPath`, `proxy` (flat: all optional), plus
`clients` at the root for the multi shape. Mixing flat keys and `clients` in
one file is an error.

### Precedence

Values resolve as: explicitly passed CLI flag > config file > built-in default.
One honest caveat: for flags with declared defaults (e.g.
`--method-name-strategy`), passing the default value is indistinguishable from
omitting the flag, so in that case the config file wins.

`strictVersion` is tri-state: an explicit `--strict-version` (or
`--no-strict-version`) always beats the file. With the flag omitted, a config
file's `strictVersion: false` applies (the built-in default is `true`, so the
mismatch warning stays on without config).

### Path resolution

Relative `input` and `outputDir` paths resolve against the directory containing
the config file, not your current working directory — running `genoc` from a
subdirectory of your project works as expected. `http(s)://` URLs are never
touched.

### Selecting clients (`--project`)

With a `clients` config, `genoc` runs **all** clients by default.
`--project <name>` runs a single client:

- Unknown name → error listing the available client names
- `--project` with a flat config → error (there is nothing to select)

### Conflicts

These combinations are rejected:

- `spec` positional + `clients` config → error; use `--project` to pick a client
- Running all clients with an explicit `--output-dir` → error (one directory
  cannot serve every target)
- `--project <name>` + `--output-dir` → allowed; the flag overrides that
  target's `outputDir`

### Validation

Configs are validated up front, before any client runs:

- Unknown keys are rejected; the error names the offending key path and the
  allowed keys
- Flat keys together with `clients` → error
- Two clients resolving to the same `outputDir` → error naming both clients
- Empty file, `null` document, or `{}` → error

### Multi-client execution

Clients run sequentially in declaration order. A failing target does not stop
the run — the remaining clients still execute. At the end, failures are
aggregated:

```text
× client "billing": <error message>
1/2 targets failed
```

The process exits with code `1`. Files already written by successful targets
are kept; a partial run is not rolled back.

### YAML notes

Duplicate keys in a YAML config follow standard YAML semantics: last one wins.

## Method Naming Strategies

- **`path-based`** (default) — HTTP method + path segments in PascalCase.
  `GET /pets` → `getPets`, `GET /api/v1/products` → `getApiV1Products`

- **`operationId`** — Use the `operationId` field from the spec.
  `GET /pets` → `findPets` (if `operationId` is `"findPets"`)

- **`operationId-with-fallback`** — Use `operationId` if present, otherwise
  fall back to path-based naming.

## Proxy Support

When fetching a spec from a URL, `genoc` can route the request through an
HTTP(S) proxy:

```bash
genoc https://api.example.com/openapi.yaml --output-dir ./src/api \
  --proxy http://user:pass@proxy.example.com:8080
```

- Credentials are supported in the proxy URL (`user:pass@host:port`).
- Without `--proxy`, the `HTTP_PROXY` / `HTTPS_PROXY` environment variables
  (either casing) are respected automatically, minus `NO_PROXY` exclusions.
- An explicit `--proxy` flag overrides environment detection entirely.
- Programmatic equivalent: `proxy: 'http://proxy.example.com:8080'` in the
  `generateClient` config, or an optional second argument `loadSpec(url, { proxy })`.
- SOCKS proxies and `ALL_PROXY` are not supported.

Note: if you already have `HTTP_PROXY` set in your environment, spec fetches
now go through it (previously ignored). Use `NO_PROXY` to opt out.

## JSDoc Documentation Output

`description`, `deprecated`, `default`, `example`/`examples`, and `title`
fields from your spec become JSDoc comments in the generated code — on object
type properties, named schemas, and client methods. Object types are always
emitted multi-line, so per-property JSDoc stays aligned at each nesting depth.
`@deprecated` tags give you editor strikethrough on deprecated fields and
methods for free.

## Programmatic API

```typescript
import { generateClient } from 'genoc';

await generateClient({
  input: './openapi.yaml',
  outputDir: './src/api',
  methodNameStrategy: 'path-based',
  specVersion: '3.1',
  strictVersion: true,
  proxy: 'http://proxy.example.com:8080',
});
```

## Error Handling

The generated client throws typed errors. Each method carries its own error
union, and `isDefinedError` narrows a caught error to that union:

- **`ApiError<TStatus, TData>`** — Error for a specific status code defined in the spec
- **`UnspecifiedApiError`** — Error for a status code not defined in the spec
- **`RequesterFailError`** — Wraps unexpected failures in your `Requester`
- **`isDefinedError(err, client.method)`** — Type guard that narrows to the method's defined error union

```typescript
import { UnspecifiedApiError, RequesterFailError } from './contracts.js';
import { isDefinedError } from 'genoc/runtime';

try {
  const result = await client.getPets();
} catch (error) {
  if (isDefinedError(error, client.getPets)) {
    // error is narrowed to GetPetsErrors (ApiError<400, ...> | ApiError<500, ...>)
    if (error.status === 400) {
      console.error('Bad request:', error.data);
    }
  }

  if (error instanceof UnspecifiedApiError) {
    console.error('Unexpected status:', error.status, error.data);
  }

  if (error instanceof RequesterFailError) {
    console.error('Requester failed:', error.cause);
  }
}
```

## Feature Support

Check the detailed feature support tables to see if your OpenAPI spec features are covered:

- **[OpenAPI 3.0 Support](./docs/openapi-3.0-support.md)** — Data types, schema keywords, parameters, request bodies, file uploads, responses, error handling, `$ref` resolution, components, security schemes, servers, and path operations.
- **[OpenAPI 3.1 Support](./docs/openapi-3.1-support.md)** — All 3.0 features plus type arrays, `$ref` siblings, webhooks, JSON Schema 2020-12 alignment, and a [3.0 → 3.1 diff](./docs/openapi-3.1-support.md#differences-from-openapi-30).

## Requirements

- Node.js >= 18
- OpenAPI 3.0.x or 3.1.x specification (JSON or YAML, file path or URL)

## License

[MIT](./LICENSE) — Copyright © Andrey Kiselev
