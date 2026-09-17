import type { AnalyzedOperation } from '../analyzer/path-analyzer.js';
import { sanitizeTypeName, toPascalCase } from './generator-helpers.js';

/**
 * Canonical runtime class list in the contracts re-export order. Membership
 * source of truth for every runtime class name the generators emit.
 */
export const RUNTIME_CLASS_NAMES = [
  'ApiError',
  'UnspecifiedApiError',
  'DefaultApiError',
  'RequesterFailError',
  'StreamResponse',
  'ErrorResponse',
] as const;

/**
 * client.ts value imports from contracts.js in site emission order.
 * `DefaultApiError` is conditional (only when an operation has a default
 * error response), so it is appended by the client generator, not listed here.
 */
export const CLIENT_BASE_VALUE_IMPORTS = [
  'ApiError',
  'UnspecifiedApiError',
  'ErrorResponse',
  'StreamResponse',
  'RequesterFailError',
] as const;

/** Fixed client-file surface names (values and types client.ts declares). */
export const CLIENT_SURFACE_NAMES = [
  'Requester',
  'isDefinedError',
  'decorateWithErrors',
  'ApiClient',
  'createClient',
] as const;

/**
 * Reserved type names used by the generated output's built-in classes,
 * functions, and types. User-defined schema names that collide with these
 * are automatically renamed with a suffix to prevent duplicate identifiers.
 *
 * Derived — never hand-edited: add new fixed names to the owning constant
 * (`RUNTIME_CLASS_NAMES` / `CLIENT_SURFACE_NAMES`) or, for contracts-only
 * interfaces like `FileInput`, extend the derivation below.
 */
export const RESERVED_TYPE_NAMES: ReadonlySet<string> = new Set<string>([
  ...RUNTIME_CLASS_NAMES,
  ...CLIENT_SURFACE_NAMES,
  'FileInput',
]);

/**
 * Build a PascalCase type-name prefix from an operation's method + path.
 * get + /api/v1/products → "GetApiV1Products"
 *
 * Returns the deduped prefix assigned by analyzePaths when available
 * (distinct routes folding to the same identifier get numbered suffixes),
 * otherwise computes it from the operation directly.
 */
export function getOperationTypePrefix(op: AnalyzedOperation): string {
  if (op.typePrefix) return op.typePrefix;
  return computeOperationTypePrefix(op);
}

function computeOperationTypePrefix(op: AnalyzedOperation): string {
  const methodPascal = op.method.charAt(0).toUpperCase() + op.method.slice(1).toLowerCase();

  const segments = op.path
    .split('/')
    .filter((s) => s.length > 0)
    .map((s) => {
      const cleaned = s.replace(/[{}]/g, '');
      return sanitizeTypeName(toPascalCase(cleaned));
    });

  return methodPascal + segments.join('');
}

/**
 * Determine the success return type for an operation.
 */
export function getSuccessType(op: AnalyzedOperation): string {
  const successResponses = op.responses.filter((r) => r.isSuccess);

  if (successResponses.length === 0) {
    return 'unknown';
  }

  const noContent = successResponses.find((r) => r.tsType === 'void');
  const hasOnlyNoContent = noContent && successResponses.every((r) => r.tsType === 'void');
  if (hasOnlyNoContent) {
    return 'void';
  }

  const withSchema = successResponses.filter((r) => r.tsType !== 'void');

  if (withSchema.length === 0) {
    return 'void';
  }

  const prefix = getOperationTypePrefix(op);
  const types = withSchema.map(() => `${prefix}Response`);

  const unique = [...new Set(types)];
  return unique.join(' | ');
}

/**
 * Determine the error type name for an operation.
 */
export function getErrorType(op: AnalyzedOperation): string {
  const prefix = getOperationTypePrefix(op);
  const errorResponses = op.responses.filter((r) => !r.isSuccess && r.statusCode !== 'default');
  if (errorResponses.length === 0) {
    return 'never';
  }
  return `${prefix}Errors`;
}

/** Name of one per-status error type (`{prefix}Error{status}`). */
export interface StatusErrorName {
  status: string;
  name: string;
}

/**
 * Inventory of every operation-derived type name the contracts file emits
 * for one operation. A field is present exactly when the contracts loop
 * emits that type — presence and naming are decided here and nowhere else.
 *
 * The client file imports a subset of this inventory (`clientImportedNames`);
 * the asymmetry is deliberate: e.g. 204-only operations emit
 * `{prefix}Response = void` which the client does not import.
 */
export interface OperationEmissions {
  query?: string;
  headers?: string;
  body?: string;
  response?: string;
  statusErrors: StatusErrorName[];
  defaultError?: string;
  errorsUnion?: string;
}

/**
 * Derive the emission inventory for an operation. Pure function of the
 * AnalyzedOperation — no mapper or resolver state participates in naming
 * or presence decisions.
 */
export function operationEmissions(op: AnalyzedOperation): OperationEmissions {
  const prefix = getOperationTypePrefix(op);
  const errorResponses = op.responses.filter((r) => !r.isSuccess && r.statusCode !== 'default');
  const statusErrors = errorResponses.map((r) => ({
    status: r.statusCode,
    name: `${prefix}Error${r.statusCode}`,
  }));

  return {
    query: op.queryParams.length > 0 ? `${prefix}Query` : undefined,
    headers: op.headerParams.length > 0 ? `${prefix}Headers` : undefined,
    body: op.requestBody?.schema ? `${prefix}Body` : undefined,
    response: op.responses.some((r) => r.isSuccess) ? `${prefix}Response` : undefined,
    statusErrors,
    defaultError: op.responses.some((r) => !r.isSuccess && r.statusCode === 'default')
      ? `${prefix}DefaultError`
      : undefined,
    errorsUnion: statusErrors.length > 0 ? `${prefix}Errors` : undefined,
  };
}

/**
 * Type names the client file imports from contracts for one operation.
 *
 * Deliberately a subset of the emission inventory: the client names the
 * response type only when the success type is a named type — 204-only
 * operations emit `{prefix}Response = void` in contracts, but the client
 * method returns `void` without ever naming the type.
 */
export function clientImportedNames(op: AnalyzedOperation): string[] {
  const emissions = operationEmissions(op);
  const names: string[] = [];

  if (emissions.query !== undefined) names.push(emissions.query);
  if (emissions.headers !== undefined) names.push(emissions.headers);
  if (emissions.body !== undefined) names.push(emissions.body);

  if (emissions.response !== undefined) {
    const successType = getSuccessType(op);
    if (successType !== 'void' && successType !== 'unknown' && /^[A-Z]/.test(successType)) {
      names.push(successType);
    }
  }

  for (const statusError of emissions.statusErrors) {
    names.push(statusError.name);
  }
  if (emissions.errorsUnion !== undefined) names.push(emissions.errorsUnion);
  if (emissions.defaultError !== undefined) names.push(emissions.defaultError);

  return names;
}

/**
 * Value imports for the client file: the fixed base list plus
 * `DefaultApiError` when any operation has a default error response.
 */
export function clientValueImports(operations: AnalyzedOperation[]): string[] {
  const needsDefaultApiError = operations.some(
    (op) => operationEmissions(op).defaultError !== undefined
  );
  return needsDefaultApiError
    ? [...CLIENT_BASE_VALUE_IMPORTS, 'DefaultApiError']
    : [...CLIENT_BASE_VALUE_IMPORTS];
}
