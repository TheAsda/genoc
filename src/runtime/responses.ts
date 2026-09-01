/**
 * Shared response containers exchanged between generated clients and
 * `Requester` implementations.
 */

/** Container for binary/stream responses returned by a `Requester`. */
export class StreamResponse {
  readonly data: ReadableStream<Uint8Array>;
  readonly filename?: string;
  readonly headers: Record<string, string>;

  constructor(
    data: ReadableStream<Uint8Array>,
    filename?: string,
    headers: Record<string, string> = {}
  ) {
    this.data = data;
    this.filename = filename;
    this.headers = headers;
  }
}

/** Convenience wrapper around the `StreamResponse` constructor. */
export function streamResponse(
  data: ReadableStream<Uint8Array>,
  filename?: string,
  headers?: Record<string, string>
): StreamResponse {
  return new StreamResponse(data, filename, headers ?? {});
}

/** Container for non-2xx responses returned by a `Requester`. */
export class ErrorResponse {
  readonly status: number;
  readonly data: unknown;
  readonly headers: Record<string, string>;
  readonly message?: string;

  constructor(
    status: number,
    data: unknown,
    headers: Record<string, string> = {},
    message?: string
  ) {
    this.status = status;
    this.data = data;
    this.headers = headers;
    this.message = message;
  }
}

/** Convenience wrapper around the `ErrorResponse` constructor. */
export function errorResponse(
  status: number,
  data: unknown,
  headers?: Record<string, string>,
  message?: string
): ErrorResponse {
  return new ErrorResponse(status, data, headers ?? {}, message);
}
