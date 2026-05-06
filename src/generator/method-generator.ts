import type { AnalyzedOperation } from '../analyzer/path-analyzer.js';
import type { GeneratedMethod } from '../types/client.js';
import type { SchemaObject } from '../types/openapi.js';
import { getOperationTypePrefix, getSuccessType } from '../utils/generator-helpers.js';

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

function buildUrlConstruction(op: AnalyzedOperation): string {
  let url = op.path;

  for (const param of op.pathParams) {
    url = url.replace(`{${param.name}}`, `\${encodeURIComponent(${param.name})}`);
  }

  return `\`${url}\``;
}

function buildImplementation(op: AnalyzedOperation): string {
  const successType = getSuccessType(op);
  const prefix = getOperationTypePrefix(op);

  const lines: string[] = [];

  if (op.pathParams.length > 0) {
    lines.push(`const url = ${buildUrlConstruction(op)};`);
  } else {
    lines.push(`const url = "${op.path}";`);
  }

  if (op.queryParams.length > 0) {
    lines.push(
      `const queryString = query ? "?" + new URLSearchParams(query as Record<string, string>).toString() : "";`
    );
    lines.push('const fullUrl = url + queryString;');
  }

  const finalUrl = op.queryParams.length > 0 ? 'fullUrl' : 'url';

  const requesterOpts: string[] = [];
  if (op.queryParams.length > 0) {
    requesterOpts.push('query');
  }
  if (op.requestBody) {
    requesterOpts.push('body');
  }
  if (op.headerParams.length > 0) {
    requesterOpts.push('headers');
  }

  // Error responses for status-specific checks
  const errorResponses = op.responses.filter((r) => !r.isSuccess && r.statusCode !== 'default');

  // Lines for inside `if (result instanceof ErrorResponse) { ... }`
  const hasDefaultResponse = op.responses.some((r) => !r.isSuccess && r.statusCode === 'default');

  const errorCheckLines: string[] = [];
  for (const errResp of errorResponses) {
    const status = errResp.statusCode;
    errorCheckLines.push(
      `if (result.status === ${status}) throw new ApiError(${status}, result.data as ${prefix}Error${status}, result.message ?? \`Request failed with status ${status}\`);`
    );
  }
  if (hasDefaultResponse) {
    errorCheckLines.push(
      `throw new DefaultApiError(result.status, result.data as ${prefix}DefaultError, result.message ?? \`Request failed with status \${result.status}\`);`
    );
  } else {
    errorCheckLines.push(
      'throw new UnspecifiedApiError(result.status, result.data, result.message ?? `Request failed with status ${result.status}`);'
    );
  }

  // Build try/catch block around requester call
  const buildTryCatch = (opts: string): string[] => {
    const block: string[] = [];
    block.push('try {');
    block.push(
      `  const result = await requester<${successType}>("${op.method.toUpperCase()}", ${finalUrl}, ${opts});`
    );
    block.push('  if (result instanceof ErrorResponse) {');
    for (const check of errorCheckLines) {
      block.push(`    ${check}`);
    }
    block.push('  }');
    if (op.responses.some((r) => r.isSuccess && r.isBinary)) {
      block.push('  if (!(result instanceof StreamResponse)) {');
      block.push('    throw new RequesterFailError(new Error("Expected stream response"));');
      block.push('  }');
    } else {
      block.push('  if (result instanceof StreamResponse) {');
      block.push('    throw new RequesterFailError(new Error("Unexpected stream response"));');
      block.push('  }');
    }
    block.push('  return result;');
    block.push('} catch (error) {');
    block.push('  if (error instanceof UnspecifiedApiError) throw error;');
    block.push('  if (error instanceof ApiError) throw error;');
    block.push('  throw new RequesterFailError(error);');
    block.push('}');
    return block;
  };

  if (op.requestBody?.isMultipart && op.requestBody.schema) {
    const schema = op.requestBody.schema as SchemaObject;
    const requiredSet = new Set((schema?.required ?? []) as string[]);
    const properties = schema.properties ?? {};
    const propNames = Object.keys(properties);
    const bodyRequired = op.requestBody.required;

    const formDataLines: string[] = [];
    formDataLines.push('const formData = new FormData();');
    for (const propName of propNames) {
      const propSchema = properties[propName];
      const isArrayBinary = propSchema?.type === 'array' && propSchema?.items?.format === 'binary';
      if (propSchema?.format === 'binary') {
        if (requiredSet.has(propName)) {
          formDataLines.push(
            `formData.append("${propName}", body.${propName}.data, body.${propName}.filename);`
          );
        } else {
          formDataLines.push(
            `if (body.${propName} !== undefined) formData.append("${propName}", body.${propName}.data, body.${propName}.filename);`
          );
        }
      } else if (isArrayBinary) {
        formDataLines.push(
          `if (body.${propName} !== undefined) { for (const file of body.${propName}) { formData.append("${propName}", file.data, file.filename); } }`
        );
      } else {
        formDataLines.push(
          `if (body.${propName} !== undefined) formData.append("${propName}", body.${propName});`
        );
      }
    }

    const bodyIdx = requesterOpts.indexOf('body');
    if (bodyIdx !== -1) requesterOpts[bodyIdx] = 'body: formData';

    if (op.responses.some((r) => r.isSuccess && r.isBinary)) {
      requesterOpts.push('expectStream: true');
    }

    const multipartOpts = requesterOpts.length > 0 ? `{ ${requesterOpts.join(', ')} }` : '{}';

    if (bodyRequired) {
      lines.push(...formDataLines);
      lines.push(...buildTryCatch(multipartOpts));
    } else {
      lines.push('if (body) {');
      for (const line of formDataLines) {
        lines.push(`  ${line}`);
      }
      for (const line of buildTryCatch(multipartOpts)) {
        lines.push(`  ${line}`);
      }
      lines.push('}');

      const fallbackOpts = requesterOpts.filter((o) => o !== 'body: formData' && o !== 'body');
      const fallbackOptsStr = fallbackOpts.length > 0 ? `{ ${fallbackOpts.join(', ')} }` : '{}';
      lines.push(...buildTryCatch(fallbackOptsStr));
    }
  } else {
    if (op.responses.some((r) => r.isSuccess && r.isBinary)) {
      requesterOpts.push('expectStream: true');
    }

    const optsStr = requesterOpts.length > 0 ? `{ ${requesterOpts.join(', ')} }` : '{}';
    lines.push(...buildTryCatch(optsStr));
  }

  return lines.join('\n  ');
}

/**
 * Generate a client method from an analyzed OpenAPI operation.
 *
 * @param op - The analyzed operation
 * @returns Generated method with name, JSDoc, signature, and implementation
 */
export function generateMethod(op: AnalyzedOperation): GeneratedMethod {
  const params = buildParameters(op);
  const successType = getSuccessType(op);
  const jsDoc = buildJsDoc(op);

  const signature = `${op.methodName}(${params}): Promise<${successType}>`;

  const implementation = `${signature} {
  ${buildImplementation(op)}
}`;

  return {
    name: op.methodName,
    jsDoc,
    signature,
    implementation,
  };
}
