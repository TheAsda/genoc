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
