/**
 * Shared error classes for generated clients.
 *
 * This module is the single source of truth for error class identity:
 * both generated client code and user-provided `Requester` implementations
 * import these classes, so `instanceof` checks work across module boundaries.
 */

/** Error thrown for a specific status code declared in the spec. */
export class ApiError<TStatus extends number, TData> extends Error {
  readonly status: TStatus;
  readonly data: TData;

  constructor(status: TStatus, data: TData, message: string) {
    super(message);
    this.status = status;
    this.data = data;
    this.name = 'ApiError';
  }
}

/** Error thrown for a status code not declared in the spec. */
export class UnspecifiedApiError extends ApiError<number, unknown> {
  constructor(status: number, data: unknown, message: string) {
    super(status, data, message);
    this.name = 'UnspecifiedApiError';
  }
}

/** Error thrown for operations that declare a `default` response. */
export class DefaultApiError<TData> extends Error {
  readonly status: number;
  readonly data: TData;

  constructor(status: number, data: TData, message: string) {
    super(message);
    this.status = status;
    this.data = data;
    this.name = 'DefaultApiError';
  }
}

/** Wraps unexpected failures inside a `Requester` implementation. */
export class RequesterFailError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super(`Request failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.cause = cause;
    this.name = 'RequesterFailError';
  }
}
