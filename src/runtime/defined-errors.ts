import { ApiError, UnspecifiedApiError } from './errors.js';

/**
 * Attaches the `__definedErrors` metadata property to a client method.
 * The property carries the method's error codes and is used by
 * `isDefinedError` for type narrowing.
 */
export function decorateWithErrors<T, E>(
  item: T,
  runtimeErrors: unknown
): T & { __definedErrors: E } {
  Object.defineProperty(item, '__definedErrors', {
    value: runtimeErrors,
    enumerable: false,
    configurable: true,
    writable: false,
  });
  return item as T & { __definedErrors: E };
}

/**
 * Type guard that narrows a caught error to a method's defined error union.
 * Returns false for `UnspecifiedApiError` (status not declared in the spec)
 * and for anything that is not an `ApiError`.
 */
export function isDefinedError<E extends ApiError<number, unknown>>(
  err: unknown,
  _fn: { __definedErrors: E }
): err is E {
  if (err instanceof UnspecifiedApiError) return false;
  if (!(err instanceof ApiError)) return false;
  return true;
}
