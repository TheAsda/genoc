import type { ErrorResponse, StreamResponse } from './responses.js';

/**
 * Performs an HTTP request and returns the response.
 *
 * When `expectStream` is true, the implementation should return
 * a `StreamResponse` containing the stream data, filename (from
 * Content-Disposition header), and response headers.
 */
export type Requester = <TResponse>(
  method: string,
  path: string,
  options: {
    query?: Record<string, unknown>;
    body?: unknown;
    headers?: Record<string, string>;
    expectStream?: true;
  }
) => Promise<TResponse | StreamResponse | ErrorResponse>;
