# genoc

Generate TypeScript HTTP clients from OpenAPI 3.0 or 3.1 specifications.
Generated code depends only on the tiny `genoc/runtime` module. Full type safety. Bring your own HTTP client.

[![npm version](https://img.shields.io/npm/v/genoc)](https://www.npmjs.com/package/genoc)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.18.1-green)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-blue)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

## Features

- Full OpenAPI 3.0 and 3.1 specification support with automatic version detection
- End-to-end type safety: requests, responses, and errors are fully typed
- Works with any HTTP client: plug in fetch, axios, or anything else
- Shared runtime contract: `genoc/runtime` exports the `Requester` type and response and error classes, so one requester implementation works with every generated client
- Error types with per-status-code narrowing and type guards
- File and binary uploads and downloads with stream handling
- Flexible method naming strategies (path-based, operationId, operationId-with-fallback)

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

- `contracts.ts`: type definitions, error classes, and helper types
- `client.ts`: typed client with the `createClient(requester)` factory
- `index.ts`: barrel that re-exports both files, so you can import directly from the output directory

The barrel means `import { createClient } from './index.js'` works too.

## Usage

The generated client requires a `Requester` implementation: a function that
performs the HTTP call and returns the result. The type lives in
`genoc/runtime`, so you can write and compile a requester before generating
anything:

```typescript
import type { Requester } from 'genoc/runtime';
```

For the full `Requester` type signature and binary and stream handling, see [Usage](./docs/usage.md).

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

// Typed call: response type is inferred from the spec
const pets = await client.getPets({ limit: 10 });
```

For handling `expectStream: true`, see [Binary and file responses](./docs/usage.md#binary-and-file-responses).

## Error handling

The generated client throws typed errors. Each method carries its own error
union, and `isDefinedError` narrows a caught error to that union:

- **`ApiError<TStatus, TData>`**: error for a specific status code defined in the spec
- **`UnspecifiedApiError`**: error for a status code not defined in the spec
- **`RequesterFailError`**: wraps unexpected failures in your `Requester`
- **`isDefinedError(err, client.method)`**: type guard that narrows to the method's defined error union

For the full example of catching and narrowing errors, see [Error handling](./docs/error-handling.md).

## Documentation

- [Configuration](./docs/configuration.md): CLI flags, `.genocrc` config files, method naming strategies, and proxy support
- [Usage](./docs/usage.md): the `Requester` contract, shared runtime, binary and file responses, and JSDoc output
- [Error handling](./docs/error-handling.md): typed errors, `isDefinedError`, and the catching example
- [OpenAPI 3.0 support](./docs/openapi-3.0-support.md): data types, schema keywords, parameters, bodies, uploads, responses, errors, `$ref`, components, security, servers, and operations
- [OpenAPI 3.1 support](./docs/openapi-3.1-support.md): all 3.0 features plus webhooks and JSON Schema 2020-12 alignment, with a diff against 3.0

## Requirements

- Node.js 20.18.1 or later
- OpenAPI 3.0.x or 3.1.x specification (JSON or YAML, file path or URL)

## License

[MIT](./LICENSE). Copyright © Andrey Kiselev
