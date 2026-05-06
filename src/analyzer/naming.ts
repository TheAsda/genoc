import type { MethodNameStrategy } from '../types/client.js';
import { toPascalCaseSegment } from '../utils/case.js';
import { sanitizeIdentifier } from '../utils/string.js';
import { isPathParam, extractParamName } from '../utils/url.js';

/**
 * Generate a TypeScript method name from HTTP method and path
 * @param method HTTP method (get, post, put, patch, delete, options, head, trace)
 * @param path URL path
 * @returns Generated method name
 */
export function generateMethodName(method: string, path: string): string {
  const lowerMethod = method.toLowerCase();

  // Get segments and identify parameters
  const rawSegments = path.split('/').filter((segment) => segment.length > 0);
  const segments: string[] = [];
  const isParam: boolean[] = [];

  for (const part of rawSegments) {
    if (isPathParam(part)) {
      // Extract parameter name and mark as parameter
      const paramName = extractParamName(part);
      isParam.push(true);
      segments.push(paramName);
    } else if (part.startsWith(':')) {
      // Handle standalone :param format
      const paramName = part.substring(1);
      isParam.push(true);
      segments.push(paramName);
    } else if (part.includes(':')) {
      // Handle embedded : separators (e.g., Products:change-quantity, {id}:recall)
      const subParts = part.split(':');
      for (let i = 0; i < subParts.length; i++) {
        const subPart = subParts[i];
        if (subPart === '') continue;
        if (isPathParam(subPart)) {
          isParam.push(true);
          segments.push(extractParamName(subPart));
        } else {
          isParam.push(false);
          segments.push(subPart);
        }
      }
    } else {
      // Regular segment
      isParam.push(false);
      segments.push(part);
    }
  }

  const transformedSegments = segments.map((segment, index) => {
    if (isParam[index]) {
      return `By${toPascalCaseSegment(segment)}`;
    }
    return toPascalCaseSegment(segment);
  });

  return lowerMethod + transformedSegments.join('');
}

/**
 * Generate a method name from operation ID
 * @param operationId Operation ID from OpenAPI spec
 * @returns Generated method name in camelCase
 */
export function generateMethodNameFromOperationId(operationId: string): string {
  if (!operationId) {
    throw new Error('Operation ID cannot be empty');
  }

  const sanitized = sanitizeIdentifier(operationId);
  const normalizedForCamelCase = sanitized.replace(/[$]/g, '').replace(/_/g, ' ');

  // Split into words and convert to camelCase
  const words = normalizedForCamelCase.split(/\s+/).filter((word) => word.length > 0);

  if (words.length === 0) {
    return '_';
  }

  // Check if the first word is a reserved word
  const firstWord = words[0];
  const isReservedWord =
    ['class', 'const', 'function', 'if', 'else', 'for', 'while', 'return', 'var', 'let'].includes(
      firstWord.toLowerCase()
    ) || firstWord === 'getClass';

  let camelCased;
  if (isReservedWord) {
    camelCased = '_' + firstWord.charAt(0).toLowerCase() + firstWord.slice(1);
  } else {
    camelCased = firstWord.charAt(0).toLowerCase() + firstWord.slice(1);
  }

  // Add remaining words with proper capitalization
  camelCased += words
    .slice(1)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');

  if (!camelCased || !/^[a-zA-Z_$]/.test(camelCased)) {
    return '_' + camelCased;
  }

  return camelCased;
}

/**
 * Get method name based on strategy
 * @param method HTTP method
 * @param path URL path
 * @param operationId Operation ID (optional)
 * @param strategy Method naming strategy
 * @returns Generated method name
 * @throws Error if operationId strategy is used but no operationId provided
 */
export function getMethodName(
  method: string,
  path: string,
  operationId: string | undefined,
  strategy: MethodNameStrategy
): string {
  switch (strategy) {
    case 'path-based':
      return generateMethodName(method, path);

    case 'operationId':
      if (!operationId) {
        throw new Error('Operation ID is required for operationId strategy but not provided');
      }
      return generateMethodNameFromOperationId(operationId);

    case 'operationId-with-fallback':
      if (operationId) {
        return generateMethodNameFromOperationId(operationId);
      }
      return generateMethodName(method, path);

    default:
      throw new Error(`Unknown method name strategy: ${strategy}`);
  }
}
