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
