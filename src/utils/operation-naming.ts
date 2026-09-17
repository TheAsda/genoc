import type { AnalyzedOperation } from '../analyzer/path-analyzer.js';
import { sanitizeTypeName, toPascalCase } from './generator-helpers.js';

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
