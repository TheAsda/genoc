---
'genoc': patch
---

Fix `DefaultApiError` to extend `ApiError<number, TData>`: generated catch blocks now re-throw it unchanged instead of wrapping it in `RequesterFailError`. `isDefinedError` explicitly returns `false` for it (a `default`-response error is not part of the per-status error union) - catch it with `instanceof DefaultApiError`. Documented in the error-handling guide. Fixes #79.
