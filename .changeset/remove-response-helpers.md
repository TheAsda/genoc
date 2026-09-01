---
'genoc': minor
---

Remove the `streamResponse()` and `errorResponse()` factory functions from `genoc/runtime`. They were zero-logic wrappers around the `StreamResponse` and `ErrorResponse` constructors, so the classes are all that remain on the runtime surface.

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
