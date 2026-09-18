# Usage

If you're new to genoc, start with the [README](../README.md) for installation, the quick start, and a basic fetch example.

## The `Requester` contract

The generated client requires a `Requester` implementation: a function that
performs the HTTP call and returns the result. The type lives in
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

## Shared runtime (`genoc/runtime`)

Generated clients import their response and error classes from `genoc/runtime`
instead of declaring inline copies (the generated `contracts.ts` re-exports
them, so existing imports keep working). This gives every generated client the
same class identity, so `instanceof` checks work across clients, and you can
implement one shared requester typed against the package:

```typescript
// common-requester.ts — reusable across all generated clients,
// no generated imports needed
import type { Requester } from 'genoc/runtime';

export const requester: Requester = async (method, path, options) => {
  // ...your fetch/axios/etc. implementation
};
```

To pin a specific version or point at a mirror, override the import specifier
via the `--runtime-import-path` flag or the `runtimeImportPath` config-file key.

## Binary and file responses

When your spec defines binary responses (such as `format: binary`,
`application/octet-stream`, or `image/*`), the generated client sends
`expectStream: true` in options. In that case, your `Requester` must return a
`StreamResponse`:

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

`StreamResponse` contains the following:

```typescript
class StreamResponse {
  data: ReadableStream<Uint8Array>;
  filename?: string;
  headers: Record<string, string>;
}
```

## JSDoc output

The `description`, `deprecated`, `default`, `example`, `examples`, and `title`
fields from your spec become JSDoc comments in the generated code, on object
type properties, named schemas, and client methods. Object types are always
emitted multi-line, so per-property JSDoc stays aligned at each nesting depth.
`@deprecated` tags make editors show deprecated fields and methods with
strikethrough.
