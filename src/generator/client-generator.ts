import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

import { analyzePaths, type AnalyzedOperation } from '../analyzer/path-analyzer.js';
import { RefResolver } from '../parser/ref-resolver.js';
import type { GeneratorConfig } from '../types/client.js';
import type { OpenAPIDocument, SchemaObject } from '../types/openapi.js';
import {
  getOperationTypePrefix,
  getSuccessType,
  getErrorType,
  makeHeader,
} from '../utils/generator-helpers.js';
import { generateContracts } from './contracts-generator.js';
import { generateMethod } from './method-generator.js';

function collectImportTypes(operations: AnalyzedOperation[]): string[] {
  const types = new Set<string>();

  for (const op of operations) {
    const prefix = getOperationTypePrefix(op);

    if (op.queryParams.length > 0) {
      types.add(`${prefix}Query`);
    }

    if (op.headerParams.length > 0) {
      types.add(`${prefix}Headers`);
    }

    if (op.requestBody?.schema) {
      types.add(`${prefix}Body`);
    }

    const successType = getSuccessType(op);
    if (successType !== 'void' && successType !== 'unknown' && /^[A-Z]/.test(successType)) {
      types.add(successType);
    }

    const errorResponses = op.responses.filter((r) => !r.isSuccess && r.statusCode !== 'default');
    for (const errResp of errorResponses) {
      types.add(`${prefix}Error${errResp.statusCode}`);
    }

    const errorType = getErrorType(op);
    if (errorType !== 'never') {
      types.add(errorType);
    }

    if (op.responses.some((r) => !r.isSuccess && r.statusCode === 'default')) {
      types.add(`${prefix}DefaultError`);
    }
  }

  // oxlint-disable-next-line unicorn/no-array-sort
  return [...types].sort();
}

function buildClientMethodBody(op: AnalyzedOperation): string {
  const successType = getSuccessType(op);

  let urlTemplate = op.path;
  for (const param of op.pathParams) {
    urlTemplate = urlTemplate.replace(`{${param.name}}`, `\${encodeURIComponent(${param.name})}`);
  }

  const urlExpr = `\`${urlTemplate}\``;

  const prefix = getOperationTypePrefix(op);
  const hasDefaultResponse = op.responses.some((r) => !r.isSuccess && r.statusCode === 'default');
  const errorResponses = op.responses.filter((r) => !r.isSuccess && r.statusCode !== 'default');
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

  const buildTryCatch = (opts: string): string[] => {
    const block: string[] = [];
    block.push('try {');
    block.push(
      `  const result = await requester<${successType}>("${op.method.toUpperCase()}", ${urlExpr}, ${opts});`
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

  const opts: string[] = [];
  if (op.queryParams.length > 0) {
    opts.push('query');
  }
  if (op.requestBody) {
    opts.push('body');
  }
  if (op.headerParams.length > 0) {
    opts.push('headers');
  }

  const lines: string[] = [];

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
    const bodyIdx = opts.indexOf('body');
    if (bodyIdx !== -1) opts[bodyIdx] = 'body: formData';

    if (bodyRequired) {
      lines.push(...formDataLines);
    } else {
      lines.push('if (body) {');
      for (const line of formDataLines) {
        lines.push(`  ${line}`);
      }
    }
  }

  if (op.responses.some((r) => r.isSuccess && r.isBinary)) {
    opts.push('expectStream: true');
  }

  const optsStr = opts.length > 0 ? `{ ${opts.join(', ')} }` : '{}';

  if (op.requestBody?.isMultipart && !op.requestBody.required) {
    for (const line of buildTryCatch(optsStr)) {
      lines.push(`  ${line}`);
    }
    lines.push('}');
    const fallbackOpts = opts.filter((o) => o !== 'body: formData' && o !== 'body');
    const fallbackOptsStr = fallbackOpts.length > 0 ? `{ ${fallbackOpts.join(', ')} }` : '{}';
    lines.push(...buildTryCatch(fallbackOptsStr));
    return lines.join('\n');
  }

  const tryCatchLines = buildTryCatch(optsStr);

  if (lines.length > 0) {
    lines.push(...tryCatchLines);
    return lines.join('\n');
  }

  return tryCatchLines.join('\n');
}

function buildClientFile(operations: AnalyzedOperation[], version: string): string {
  const lines: string[] = [];

  lines.push(makeHeader(version));

  const importTypes = collectImportTypes(operations);
  const needsDefaultApiError = operations.some((op) =>
    op.responses.some((r) => !r.isSuccess && r.statusCode === 'default')
  );
  const valueImports = [
    'ApiError',
    'UnspecifiedApiError',
    'ErrorResponse',
    'StreamResponse',
    'RequesterFailError',
  ];
  if (needsDefaultApiError) {
    valueImports.push('DefaultApiError');
  }
  const typeImports = importTypes.filter((t) => !valueImports.includes(t));

  lines.push(`import { ${valueImports.join(', ')} } from './contracts.js';`);

  if (typeImports.length > 0) {
    lines.push(`import type { ${typeImports.join(', ')} } from './contracts.js';`);
  }

  const hasMultipart = operations.some((op) => op.requestBody?.isMultipart);
  if (hasMultipart) {
    lines.push('/* global FormData */');
  }

  lines.push('');

  lines.push('function decorateWithErrors<T, E>(');
  lines.push('  item: T,');
  lines.push('  runtimeErrors: unknown,');
  lines.push('): T & { __definedErrors: E } {');
  lines.push('  Object.defineProperty(item, "__definedErrors", {');
  lines.push('    value: runtimeErrors,');
  lines.push('    enumerable: false,');
  lines.push('    configurable: true,');
  lines.push('    writable: false,');
  lines.push('  });');
  lines.push('  return item as T & { __definedErrors: E };');
  lines.push('}');
  lines.push('');
  lines.push('export function isDefinedError<E extends ApiError<number, unknown>>(');
  lines.push('  err: unknown,');
  lines.push('  fn: { __definedErrors: E },');
  lines.push('): err is E {');
  lines.push('  if (err instanceof UnspecifiedApiError) return false;');
  lines.push('  if (!(err instanceof ApiError)) return false;');
  lines.push('  return true;');
  lines.push('}');
  lines.push('');

  lines.push('/**');
  lines.push(' * Performs an HTTP request and returns the response.');
  lines.push(' *');
  lines.push(' * When `expectStream` is true, the implementation should return');
  lines.push(' * a `StreamResponse` containing the stream data, filename (from');
  lines.push(' * Content-Disposition header), and response headers.');
  lines.push(' */');
  lines.push('export type Requester = <TResponse>(');
  lines.push('  method: string,');
  lines.push('  path: string,');
  lines.push('  options: {');
  lines.push('    query?: Record<string, unknown>;');
  lines.push('    body?: unknown;');
  lines.push('    headers?: Record<string, string>;');
  lines.push('    expectStream?: true;');
  lines.push('  },');
  lines.push(') => Promise<TResponse | StreamResponse | ErrorResponse>;');

  lines.push('');

  lines.push('');

  lines.push('export function createClient(requester: Requester) {');
  lines.push('  return {');

  for (let i = 0; i < operations.length; i++) {
    const op = operations[i];
    const method = generateMethod(op);

    if (method.jsDoc) {
      const indentedJsDoc = method.jsDoc
        .split('\n')
        .map((line) => `    ${line}`)
        .join('\n');
      lines.push(indentedJsDoc);
    }

    const body = buildClientMethodBody(op);

    const sig = method.signature;
    const firstParen = sig.indexOf('(');
    const closeParenColon = sig.indexOf('): ');
    const params = sig.substring(firstParen + 1, closeParenColon);
    const returnType = sig.substring(closeParenColon + 3);
    const methodName = method.name;
    const errorType = getErrorType(op);

    const errorResponses = op.responses.filter((r) => !r.isSuccess && r.statusCode !== 'default');
    const errorCodes = errorResponses.map((r) => r.statusCode);
    const errorCodeArray =
      errorCodes.length > 0 ? `[${errorCodes.join(', ')}] as const` : '[] as const';

    const indentedBody = body
      .split('\n')
      .map((line) => '        ' + line)
      .join('\n');

    lines.push(
      `    ${methodName}: decorateWithErrors<(${params}) => ${returnType}, ${errorType}>(`
    );
    lines.push(`      async (${params}): ${returnType} => {`);
    lines.push(indentedBody);
    lines.push(`      },`);
    lines.push(`      ${errorCodeArray},`);
    lines.push(`    )${i < operations.length - 1 ? ',' : ''}`);
  }

  lines.push('  };');
  lines.push('}');
  lines.push('');
  lines.push('export type ApiClient = ReturnType<typeof createClient>;');

  return lines.join('\n');
}

export type ApiClient = {
  [key: string]: (...args: any[]) => Promise<any>;
};

/** Options for controlling generation behavior. */
export interface GenerationOptions {
  /** When true, sibling properties alongside $ref are preserved (OpenAPI 3.1 behavior). */
  preserveRefSiblings?: boolean;
}

/**
 * Generate both the contracts and client file content from an OpenAPI document.
 */
export function generateClient(
  doc: OpenAPIDocument,
  config: GeneratorConfig,
  options?: GenerationOptions
): { contracts: string; client: string } {
  const resolver = new RefResolver(doc, undefined, {
    preserveRefSiblings: options?.preserveRefSiblings,
  });

  const contracts = generateContracts(doc, resolver);

  const operations = analyzePaths(doc, resolver, config.methodNameStrategy ?? 'path-based');

  const client = buildClientFile(operations, doc.openapi);

  return { contracts, client };
}

/**
 * Generate and write both output files to disk.
 */
export async function generateFullOutput(
  doc: OpenAPIDocument,
  config: GeneratorConfig,
  options?: GenerationOptions
): Promise<void> {
  const { contracts, client } = generateClient(doc, config, options);

  await mkdir(config.outputDir, { recursive: true });

  await writeFile(join(config.outputDir, 'contracts.ts'), contracts, 'utf-8');
  await writeFile(join(config.outputDir, 'client.ts'), client, 'utf-8');
}
