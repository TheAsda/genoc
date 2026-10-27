# Error handling

Generated methods don't throw bare `Error` values. Each method carries its own
error union, and `isDefinedError` narrows a caught error to that union. If you
arrived here directly, the [README](../README.md) covers the rest of the
project.

- **`ApiError<TStatus, TData>`**: error for a specific status code defined in the spec
- **`UnspecifiedApiError`**: error for a status code not defined in the spec
- **`DefaultApiError<TData>`**: error for a status code covered by the operation's declared `default` response - extends `ApiError<number, TData>`; catch it with `instanceof` (`isDefinedError` does not narrow to it)
- **`RequesterFailError`**: wraps unexpected failures in your `Requester`
- **`isDefinedError(err, client.method)`**: type guard that narrows to the method's defined error union

```typescript
import { isDefinedError } from 'genoc/runtime';

import { DefaultApiError, UnspecifiedApiError, RequesterFailError } from './contracts.js';

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

  if (error instanceof DefaultApiError) {
    console.error('Default response error:', error.status, error.data);
  }

  if (error instanceof RequesterFailError) {
    console.error('Requester failed:', error.cause);
  }
}
```
