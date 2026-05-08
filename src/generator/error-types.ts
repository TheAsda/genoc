import type { AnalyzedOperation } from '../analyzer/path-analyzer.js';

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

/**
 * Generate error types for a set of analyzed operations.
 *
 * Produces:
 * 1. `ApiError<TStatus, TData>` class
 * 2. `UnspecifiedApiError` class (extends ApiError, for status codes not in spec)
 * 3. Per-operation error union types (e.g. `GetApiV1ProductsErrors`)
 * 4. Per-operation per-status error type aliases (e.g. `GetApiV1ProductsError400`)
 * 5. `DefaultErrorBody` type for `default` responses
 * 6. Catch-all `UnspecifiedApiError` in error unions for unexpected status codes
 */
export function generateErrorTypes(operations: AnalyzedOperation[]): string {
  const lines: string[] = [];

  lines.push(`export class ApiError<TStatus extends number, TData> extends Error {
  constructor(
    public readonly status: TStatus,
    public readonly data: TData,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}`);

  lines.push('');

  lines.push(`export class UnspecifiedApiError extends ApiError<number, unknown> {
  constructor(
    status: number,
    data: unknown,
    message: string,
  ) {
    super(status, data, message);
    this.name = "UnspecifiedApiError";
  }
}`);

  lines.push('');

  let needsDefaultErrorBody = false;

  for (const op of operations) {
    const errorResponses = op.responses.filter((r) => !r.isSuccess && r.statusCode !== 'default');
    const defaultResponse = op.responses.find((r) => !r.isSuccess && r.statusCode === 'default');

    if (errorResponses.length === 0 && !defaultResponse) {
      continue;
    }

    const methodName = op.methodName;
    const errorTypeName = (status: string) => `${methodName}Error${status}`;

    lines.push('');

    for (const err of errorResponses) {
      const tsType = err.tsType || 'unknown';
      lines.push(`export type ${errorTypeName(err.statusCode)} = ${tsType};`);
    }

    const unionParts: string[] = [];

    for (const err of errorResponses) {
      const status = Number(err.statusCode);
      unionParts.push(`ApiError<${status}, ${errorTypeName(err.statusCode)}>`);
    }

    if (defaultResponse) {
      needsDefaultErrorBody = true;
      unionParts.push(`ApiError<number, DefaultErrorBody>`);
    }

    unionParts.push(`UnspecifiedApiError`);

    lines.push(`export type ${methodName}Errors = ${unionParts.join('\n  | ')};`);
  }

  if (needsDefaultErrorBody) {
    lines.push('');
    lines.push('export type DefaultErrorBody = unknown;');
  }

  return lines.join('\n');
}
