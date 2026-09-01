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

This creates two files in `./src/api`:

- `contracts.ts` — Type definitions, error classes, and helper types
- `client.ts` — Typed client with `createClient(requester)` factory

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
      response.headers,
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
import { errorResponse } from 'genoc/runtime';

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
    response.headers
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

### Response Helpers

The generated `contracts.ts` re-exports helper functions for constructing
responses in your `Requester` implementation (they come from `genoc/runtime`):

- `streamResponse(data, filename?, headers?)` — Creates a `StreamResponse` instance
- `errorResponse(status, data, headers?, message?)` — Creates an `ErrorResponse` instance

These are convenience wrappers around the `StreamResponse` and `ErrorResponse`
constructors.

## CLI Reference

```bash
genoc <spec> [flags]
```

`<spec>` — Path or URL to an OpenAPI 3.0 / 3.1 spec (JSON or YAML).

| Flag                     | Default         | Description                                                  |
| ------------------------ | --------------- | ------------------------------------------------------------ |
| `--output-dir`           | (required)      | Output directory for generated files                         |
| `--method-name-strategy` | `path-based`    | Method naming strategy                                       |
| `--spec-version`         | auto-detect     | Override version detection (`"3.0"` or `"3.1"`)              |
| `--strict-version`       | `true`          | Warn if `--spec-version` mismatches detected version         |
| `--runtime-import-path`  | `genoc/runtime` | Module specifier generated code imports runtime classes from |

## Method Naming Strategies

- **`path-based`** (default) — HTTP method + path segments in PascalCase.
  `GET /pets` → `getPets`, `GET /api/v1/products` → `getApiV1Products`

- **`operationId`** — Use the `operationId` field from the spec.
  `GET /pets` → `findPets` (if `operationId` is `"findPets"`)

- **`operationId-with-fallback`** — Use `operationId` if present, otherwise
  fall back to path-based naming.

## Programmatic API

```typescript
import { generateClient } from 'genoc';

await generateClient({
  input: './openapi.yaml',
  outputDir: './src/api',
  methodNameStrategy: 'path-based',
  specVersion: '3.1',
  strictVersion: true,
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
