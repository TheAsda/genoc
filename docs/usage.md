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

## Client options (`createClient`)

`createClient` accepts an optional second argument with per-client options:

```typescript
const client = createClient(requester, options);
```

```typescript
type CreateClientOptions = {
  /**
   * Formats one path parameter value to its string form before URL-encoding
   * and interpolation. Defaults to `String`.
   */
  formatPathParam?: (value: string | number | boolean) => string;
};
```

### `formatPathParam`

Every path parameter value passes through `formatPathParam` before it is
URL-encoded and interpolated into the request path:

```typescript
// Inside a generated method:
const path = `/pets/${encodeURIComponent(formatPathParam(id))}`;
```

The formatter receives the raw, schema-typed value — not a string. Path
parameters are typed from their schema: `type: integer` becomes `number`,
`type: boolean` becomes `boolean`, an enum becomes a union of its literals,
and a `$ref` becomes the named contract type.

The default formatter is `String`, which produces the right wire form for most
specs. Override it when `String()` would not — for example, booleans
serialized as `1`/`0`, numeric ids that need padding, or lowercase enums:

```typescript
const client = createClient(requester, {
  formatPathParam: (value) => {
    if (typeof value === 'boolean') return value ? '1' : '0';
    return String(value);
  },
});
```

Options apply per client: each `createClient(requester, options)` call returns
an independent client, so a formatter configured for one client never affects
other clients.

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
