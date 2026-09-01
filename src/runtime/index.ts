/**
 * Public runtime contract shared by generated clients and user-provided
 * `Requester` implementations.
 *
 * Import from `genoc/runtime` — the main `genoc` entry point is the
 * generator API (dev-time only); this subpath is the tiny runtime surface.
 */
export { ApiError, UnspecifiedApiError, DefaultApiError, RequesterFailError } from './errors.js';
export { StreamResponse, streamResponse, ErrorResponse, errorResponse } from './responses.js';
export { decorateWithErrors, isDefinedError } from './defined-errors.js';
export type { Requester } from './requester.js';
