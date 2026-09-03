import { RefResolver } from '../parser/ref-resolver.js';
import type { MethodNameStrategy } from '../types/client.js';
import type {
  OpenAPIDocument,
  ParameterObject,
  ReferenceObject,
  RequestBodyObject,
  ResponseObject,
  SchemaObject,
} from '../types/openapi.js';
import { sanitizeTypeName, getOperationTypePrefix } from '../utils/generator-helpers.js';
import { getMethodName } from './naming.js';

export interface AnalyzedParameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required: boolean;
  schema: SchemaObject | undefined;
  tsType: string;
  description?: string;
  deprecated?: boolean;
  example?: unknown;
}

export interface AnalyzedRequestBody {
  required: boolean;
  contentTypes: string[];
  schema: SchemaObject | ReferenceObject | undefined;
  tsType: string;
  isMultipart: boolean;
  description?: string;
}

export interface AnalyzedResponse {
  statusCode: string;
  description?: string;
  schema: SchemaObject | ReferenceObject | undefined;
  tsType: string;
  isSuccess: boolean;
  isBinary: boolean;
}

export interface AnalyzedOperation {
  method: string;
  path: string;
  operationId: string | undefined;
  methodName: string;
  /** Deduped by analyzePaths; computed from method + path when absent. */
  typePrefix?: string;
  summary: string | undefined;
  description: string | undefined;
  deprecated: boolean;
  tags: string[];
  pathParams: AnalyzedParameter[];
  queryParams: AnalyzedParameter[];
  headerParams: AnalyzedParameter[];
  cookieParams: AnalyzedParameter[];
  requestBody: AnalyzedRequestBody | undefined;
  responses: AnalyzedResponse[];
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'] as const;

function isRef(obj: unknown): obj is ReferenceObject {
  return obj !== null && typeof obj === 'object' && '$ref' in (obj as Record<string, unknown>);
}

function isBinaryContentType(ct: string): boolean {
  if (ct === 'application/octet-stream') return true;
  if (ct.startsWith('image/')) return true;
  if (ct.startsWith('video/')) return true;
  if (ct.startsWith('audio/')) return true;
  return false;
}

function schemaToTsType(
  schema: SchemaObject | ReferenceObject | undefined,
  resolver: RefResolver
): string {
  if (!schema) return 'unknown';

  if (isRef(schema)) {
    const resolved = resolver.resolve<SchemaObject>(schema);
    const refStr = schema.$ref;
    const lastSegment = sanitizeTypeName(refStr.split('/').pop()!);
    if (lastSegment && resolved.type) {
      return lastSegment;
    }
    return lastSegment ?? 'unknown';
  }

  const s = schema as SchemaObject;

  if (s.type === undefined) return 'unknown';

  if (Array.isArray(s.type)) {
    const nonNull = s.type.filter((t) => t !== 'null');
    if (nonNull.length === 0) return 'null';
    return schemaToTsType({ ...s, type: nonNull[0] }, resolver);
  }

  switch (s.type) {
    case 'string':
      return 'string';
    case 'integer':
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'array':
      if (s.items) {
        const itemType = schemaToTsType(s.items, resolver);
        return `${itemType}[]`;
      }
      return 'unknown[]';
    case 'object':
      return 'object';
    case 'null':
      return 'null';
    default:
      return 'unknown';
  }
}

function resolveParameter(
  param: ParameterObject | ReferenceObject,
  resolver: RefResolver
): ParameterObject {
  return resolver.resolve<ParameterObject>(param);
}

function resolveRequestBody(
  body: RequestBodyObject | ReferenceObject,
  resolver: RefResolver
): RequestBodyObject {
  return resolver.resolve<RequestBodyObject>(body);
}

function resolveResponse(
  response: ResponseObject | ReferenceObject,
  resolver: RefResolver
): ResponseObject {
  return resolver.resolve<ResponseObject>(response);
}

function analyzeParameter(param: ParameterObject, resolver: RefResolver): AnalyzedParameter {
  const schema = param.schema ? resolver.resolve<SchemaObject>(param.schema) : undefined;

  return {
    name: param.name,
    in: param.in,
    required: param.required ?? param.in === 'path',
    schema,
    tsType: schemaToTsType(param.schema, resolver),
    description: param.description,
    deprecated: param.deprecated,
    example: param.example,
  };
}

function mergeParameters(
  pathItemParams: (ParameterObject | ReferenceObject)[] | undefined,
  operationParams: (ParameterObject | ReferenceObject)[] | undefined,
  resolver: RefResolver
): ParameterObject[] {
  const resolvedPathParams = (pathItemParams ?? []).map((p) => resolveParameter(p, resolver));
  const resolvedOpParams = (operationParams ?? []).map((p) => resolveParameter(p, resolver));

  const opParamMap = new Map<string, ParameterObject>();
  for (const p of resolvedOpParams) {
    opParamMap.set(`${p.name}::${p.in}`, p);
  }

  const merged: ParameterObject[] = [];
  for (const p of resolvedPathParams) {
    const key = `${p.name}::${p.in}`;
    if (!opParamMap.has(key)) {
      merged.push(p);
    }
  }

  for (const p of resolvedOpParams) {
    merged.push(p);
  }

  return merged;
}

function analyzeRequestBody(
  body: RequestBodyObject | ReferenceObject | undefined,
  resolver: RefResolver
): AnalyzedRequestBody | undefined {
  if (!body) return undefined;

  const resolved = resolveRequestBody(body, resolver);
  const contentTypes = Object.keys(resolved.content);

  let schema: SchemaObject | ReferenceObject | undefined;
  let tsType = 'unknown';

  if (contentTypes.length > 0) {
    const firstContent = resolved.content[contentTypes[0]];
    if (firstContent?.schema) {
      schema = firstContent.schema;
      tsType = schemaToTsType(schema, resolver);
    }
  }

  const isMultipart = contentTypes.length > 0 && contentTypes[0] === 'multipart/form-data';

  return {
    required: resolved.required ?? false,
    contentTypes,
    schema,
    tsType,
    isMultipart,
    description: resolved.description,
  };
}

function analyzeResponses(
  responses: Record<string, ResponseObject | ReferenceObject>,
  resolver: RefResolver
): AnalyzedResponse[] {
  const result: AnalyzedResponse[] = [];

  for (const [statusCode, response] of Object.entries(responses)) {
    const resolved = resolveResponse(response, resolver);

    let schema: SchemaObject | ReferenceObject | undefined;
    let tsType = 'unknown';
    let contentTypes: string[] = [];

    if (resolved.content) {
      contentTypes = Object.keys(resolved.content);
      if (contentTypes.length > 0) {
        const firstContent = resolved.content[contentTypes[0]];
        if (firstContent?.schema) {
          schema = firstContent.schema;
          tsType = schemaToTsType(schema, resolver);
        }
      }
    }

    // Empty-body success responses → void
    if (
      tsType === 'unknown' &&
      statusCode.startsWith('2') &&
      (!resolved.content || contentTypes.length === 0)
    ) {
      tsType = 'void';
    }

    const isBinary = contentTypes.length > 0 && isBinaryContentType(contentTypes[0]);

    result.push({
      statusCode,
      description: resolved.description,
      schema,
      tsType,
      isSuccess: statusCode.startsWith('2'),
      isBinary,
    });
  }

  return result;
}

function categorizeParameters(
  params: AnalyzedParameter[]
): Pick<AnalyzedOperation, 'pathParams' | 'queryParams' | 'headerParams' | 'cookieParams'> {
  const pathParams: AnalyzedParameter[] = [];
  const queryParams: AnalyzedParameter[] = [];
  const headerParams: AnalyzedParameter[] = [];
  const cookieParams: AnalyzedParameter[] = [];

  for (const param of params) {
    switch (param.in) {
      case 'path':
        pathParams.push(param);
        break;
      case 'query':
        queryParams.push(param);
        break;
      case 'header':
        headerParams.push(param);
        break;
      case 'cookie':
        cookieParams.push(param);
        break;
    }
  }

  return { pathParams, queryParams, headerParams, cookieParams };
}

/**
 * Analyze all paths and operations from an OpenAPI document into structured data
 * for code generation.
 *
 * @param doc - The parsed and validated OpenAPI document
 * @param resolver - A RefResolver for resolving $ref pointers
 * @param strategy - Method naming strategy (defaults to 'path-based')
 * @returns Array of AnalyzedOperation objects
 */
export function analyzePaths(
  doc: OpenAPIDocument,
  resolver: RefResolver,
  strategy: MethodNameStrategy = 'path-based'
): AnalyzedOperation[] {
  const operations: AnalyzedOperation[] = [];

  if (!doc.paths) return operations;

  const usedTypePrefixes = new Set<string>();
  const usedMethodNames = new Set<string>();
  for (const [urlPath, pathItem] of Object.entries(doc.paths)) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;

      const mergedParams = mergeParameters(pathItem.parameters, operation.parameters, resolver);

      const analyzedParams = mergedParams.map((p) => analyzeParameter(p, resolver));

      const categorized = categorizeParameters(analyzedParams);

      const requestBody = analyzeRequestBody(operation.requestBody, resolver);

      const responses = analyzeResponses(operation.responses, resolver);

      const methodName = getMethodName(method, urlPath, operation.operationId, strategy);

      operations.push({
        method,
        path: urlPath,
        operationId: operation.operationId,
        methodName,
        summary: operation.summary,
        description: operation.description,
        deprecated: operation.deprecated ?? false,
        tags: operation.tags ?? [],
        ...categorized,
        requestBody,
        responses,
      });
    }
  }

  // Dedupe type prefixes and method names so that distinct routes folding to
  // the same identifier (e.g. "/weird" and "/weird-", or "/Weird" and
  // "/weird") cannot produce duplicate exported types or client methods.
  // NOTE: analyzePaths runs twice per generation (contracts pass + client
  // pass); this assignment must stay deterministic - it relies on insertion
  // order and the fixed HTTP_METHODS loop - so both passes agree.
  for (const op of operations) {
    const baseTypePrefix = getOperationTypePrefix(op);
    let typePrefix = baseTypePrefix;
    let n = 2;
    while (usedTypePrefixes.has(typePrefix)) {
      typePrefix = `${baseTypePrefix}${n}`;
      n += 1;
    }
    usedTypePrefixes.add(typePrefix);
    op.typePrefix = typePrefix;

    const baseMethodName = op.methodName;
    let methodName = baseMethodName;
    n = 2;
    while (usedMethodNames.has(methodName)) {
      methodName = `${baseMethodName}${n}`;
      n += 1;
    }
    usedMethodNames.add(methodName);
    op.methodName = methodName;
  }

  return operations;
}
