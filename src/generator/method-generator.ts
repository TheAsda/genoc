import type { AnalyzedOperation } from '../analyzer/path-analyzer.js';
import type { GeneratedMethod } from '../types/client.js';
import {
  getOperationTypePrefix,
  getSuccessType,
  sanitizeJsDocText,
} from '../utils/generator-helpers.js';

function buildParameters(op: AnalyzedOperation): string {
  const params: string[] = [];

  for (const param of op.pathParams) {
    params.push(`${param.name}: string`);
  }

  if (op.queryParams.length > 0) {
    const prefix = getOperationTypePrefix(op);
    const allOptional = op.queryParams.every((p) => !p.required);
    const hasRequiredAfter = !!op.requestBody?.required || op.headerParams.some((p) => p.required);

    if (allOptional && hasRequiredAfter) {
      // All optional query params + required param after: use explicit undefined to avoid "required param cannot follow optional" error
      params.push(`query: ${prefix}Query | undefined`);
    } else {
      // Normal case: use optional notation
      const optional = allOptional ? '?' : '';
      params.push(`query${optional}: ${prefix}Query`);
    }
  }

  if (op.requestBody) {
    const prefix = getOperationTypePrefix(op);
    const optional = op.requestBody.required ? '' : '?';
    params.push(`body${optional}: ${prefix}Body`);
  }

  if (op.headerParams.length > 0) {
    const prefix = getOperationTypePrefix(op);
    const allOptional = op.headerParams.every((p) => !p.required);
    const optional = allOptional ? '?' : '';
    params.push(`headers${optional}: ${prefix}Headers`);
  }

  return params.join(', ');
}

function buildJsDoc(op: AnalyzedOperation): string {
  const lines: string[] = [];

  if (op.summary) {
    lines.push(` * ${op.summary}`);
  }

  if (op.description && op.description !== op.summary) {
    if (lines.length > 0) {
      lines.push(' *');
    }
    lines.push(` * ${op.description}`);
  }

  // Responses iterate ascending-numeric with 'default' last (Object.entries
  // integer-key semantics in path-analyzer), so the first success is the
  // lowest-numbered 2xx. No fallback to later 2xx when it is undescribed.
  const firstSuccess = op.responses.find((response) => response.isSuccess);
  if (firstSuccess?.description !== undefined && firstSuccess.description.trim() !== '') {
    if (lines.length > 0) {
      lines.push(' *');
    }
    lines.push(` * ${sanitizeJsDocText(firstSuccess.description)}`);
  }

  const allParams = [...op.pathParams, ...op.queryParams, ...op.headerParams, ...op.cookieParams];
  const paramsWithDescriptions = allParams.filter((param) => param.description);

  if (paramsWithDescriptions.length > 0) {
    if (lines.length > 0) {
      lines.push(' *');
    }
    for (const param of paramsWithDescriptions) {
      lines.push(` * @param ${param.name} — ${param.description}`);
    }
  }

  if (op.requestBody && op.requestBody.contentTypes.length > 0) {
    if (lines.length > 0) {
      lines.push(' *');
    }
    lines.push(` * @param body — request body`);
  }

  if (op.tags && op.tags.length > 0) {
    if (lines.length > 0) {
      lines.push(' *');
    }
    for (const tag of op.tags) {
      lines.push(` * @category ${tag}`);
    }
  }

  if (op.deprecated) {
    if (lines.length > 0) {
      lines.push(' *');
    }
    lines.push(' * @deprecated');
  }

  const deprecatedParams = allParams.filter((param) => param.deprecated === true);

  if (deprecatedParams.length > 0) {
    if (lines.length > 0) {
      lines.push(' *');
    }
    for (const param of deprecatedParams) {
      lines.push(` * @deprecated ${param.name} — This parameter is deprecated`);
    }
  }

  if (lines.length === 0) {
    return '';
  }

  return `/**\n${lines.join('\n')}\n */`;
}

/**
 * Generate a client method from an analyzed OpenAPI operation.
 *
 * @param op - The analyzed operation
 * @returns Generated method with name, JSDoc, and signature
 */
export function generateMethod(op: AnalyzedOperation): GeneratedMethod {
  const params = buildParameters(op);
  const successType = getSuccessType(op);
  const jsDoc = buildJsDoc(op);

  const signature = `${op.methodName}(${params}): Promise<${successType}>`;

  return {
    name: op.methodName,
    jsDoc,
    signature,
  };
}
