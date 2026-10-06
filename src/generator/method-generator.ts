import type { AnalyzedOperation } from '../analyzer/path-analyzer.js';
import type { GeneratedMethod } from '../types/client.js';
import { sanitizeJsDocText } from '../utils/generator-helpers.js';
import { getSuccessType, operationEmissions } from '../utils/operation-naming.js';

type ParamSpec = { name: string; type: string | undefined; isOptional: boolean };

/**
 * A `?:` parameter may only be followed by other optional parameters — a
 * required parameter after an optional one is a TS1016 compile error
 * ("A required parameter cannot follow an optional parameter"). Optional
 * parameters that precede a required one are therefore rendered as
 * `name: T | undefined` instead of `name?: T`.
 */
function renderParams(specs: ParamSpec[]): string {
  return specs
    .map((spec, index) => {
      if (!spec.isOptional) {
        return `${spec.name}: ${spec.type}`;
      }
      const hasRequiredAfter = specs.slice(index + 1).some((s) => !s.isOptional);
      if (hasRequiredAfter) {
        return `${spec.name}: ${spec.type} | undefined`;
      }
      return `${spec.name}?: ${spec.type}`;
    })
    .join(', ');
}

function buildParameters(op: AnalyzedOperation): string {
  const emissions = operationEmissions(op);
  const specs: ParamSpec[] = [];

  for (const param of op.pathParams) {
    specs.push({ name: param.name, type: 'string', isOptional: false });
  }

  if (emissions.query !== undefined) {
    const allOptional = op.queryParams.every((p) => !p.required);
    specs.push({ name: 'query', type: emissions.query, isOptional: allOptional });
  }

  if (op.requestBody) {
    specs.push({ name: 'body', type: emissions.body, isOptional: !op.requestBody.required });
  }

  if (emissions.headers !== undefined) {
    const allOptional = op.headerParams.every((p) => !p.required);
    specs.push({ name: 'headers', type: emissions.headers, isOptional: allOptional });
  }

  return renderParams(specs);
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
