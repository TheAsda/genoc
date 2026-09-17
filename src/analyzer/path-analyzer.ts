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
import { isBinaryContentType } from '../utils/generator-helpers.js';
import { getOperationTypePrefix } from '../utils/operation-naming.js';
import { getMethodName } from './naming.js';

export interface AnalyzedParameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required: boolean;
  /** Resolved param schema — analyzer-internal translation input for `analyze()`; renderers must not read it. */
  schema: SchemaObject | undefined;
  description?: string;
  deprecated?: boolean;
  example?: unknown;
}

export interface AnalyzedRequestBody {
  required: boolean;
  contentTypes: string[];
  /**
   * Whether the first content entry carries a schema — drives the
   * `{Prefix}Body` emission-presence decision (both the emission inventory in
   * operation-naming and the Section-3 emission in analyze() read this fact,
   * so they can never desync). The raw schema itself travels beside the
   * operations array in `AnalyzedPathsResult`.
   */
  hasSchema: boolean;
  isMultipart: boolean;
  isBinary: boolean;
  description?: string;
}

export interface AnalyzedResponse {
  statusCode: string;
  description?: string;
  /** Raw (possibly `$ref`) first-content schema — analyzer-internal translation input for `analyze()`; renderers must not read it. */
  schema: SchemaObject | ReferenceObject | undefined;
  isSuccess: boolean;
  isBinary: boolean;
  /**
   * True exactly for schema-less, non-binary 2xx responses with no content
   * (or empty content) — the "empty body → void" classification.
   */
  isVoid: boolean;
  /**
   * Finished (real-mapper) TS type text — StreamResponse substitution and
   * discriminator variant rewrites applied. Set by `analyze()`.
   */
  finishedType?: string;
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

/**
 * Resolve a possibly-$ref-ed schema and check for an exact top-level `format: binary`
 * match. Top-level only — intentionally no deep-walk into items/allOf/oneOf/anyOf.
 */
function isBinarySchema(
  schema: SchemaObject | ReferenceObject | undefined,
  resolver: RefResolver
): boolean {
  if (!schema) return false;
  return resolver.resolveSchema(schema).format === 'binary';
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

/**
 * Analyze one request body. Returns the structural facts plus the RAW
 * (possibly `$ref`) first-content schema as a separate value — the schema is
 * analyzer-internal translation input for `analyze()` and does not travel on
 * the `AnalyzedRequestBody` seam.
 */
function analyzeRequestBody(
  body: RequestBodyObject | ReferenceObject | undefined,
  resolver: RefResolver
):
  | { requestBody: AnalyzedRequestBody; rawSchema: SchemaObject | ReferenceObject | undefined }
  | undefined {
  if (!body) return undefined;

  const resolved = resolveRequestBody(body, resolver);
  const contentTypes = Object.keys(resolved.content);

  let schema: SchemaObject | ReferenceObject | undefined;

  if (contentTypes.length > 0) {
    const firstContent = resolved.content[contentTypes[0]];
    if (firstContent?.schema) {
      schema = firstContent.schema;
    }
  }

  const isMultipart = contentTypes.length > 0 && contentTypes[0] === 'multipart/form-data';

  // Contract with the generators: multipart bodies keep the FileInput shape
  // and must never be Blob-ified, so the binary signals are bypassed.
  const isBinary = isMultipart
    ? false
    : contentTypes.some(isBinaryContentType) || isBinarySchema(schema, resolver);

  return {
    requestBody: {
      required: resolved.required ?? false,
      contentTypes,
      hasSchema: schema !== undefined,
      isMultipart,
      isBinary,
      description: resolved.description,
    },
    rawSchema: schema,
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
    let contentTypes: string[] = [];

    if (resolved.content) {
      contentTypes = Object.keys(resolved.content);
      if (contentTypes.length > 0) {
        const firstContent = resolved.content[contentTypes[0]];
        if (firstContent?.schema) {
          schema = firstContent.schema;
        }
      }
    }

    // Empty-body success responses → void
    const isVoid =
      schema === undefined &&
      statusCode.startsWith('2') &&
      (!resolved.content || contentTypes.length === 0);

    const isBinary =
      contentTypes.length > 0 &&
      (isBinaryContentType(contentTypes[0]) || isBinarySchema(schema, resolver));

    result.push({
      statusCode,
      description: resolved.description,
      schema,
      isSuccess: statusCode.startsWith('2'),
      isBinary,
      isVoid,
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
 * Analyzer-internal analysis result: the analyzed operations plus the raw
 * request body schemas in a PARALLEL ARRAY (same length and order as
 * `operations`). The raw schemas are translation input for `analyze()` and
 * deliberately do not travel on the `AnalyzedRequestBody` seam.
 */
export interface AnalyzedPathsResult {
  operations: AnalyzedOperation[];
  requestBodySchemas: (SchemaObject | ReferenceObject | undefined)[];
}

/**
 * Analyze all paths and operations from an OpenAPI document into structured
 * data for code generation, carrying the raw request body schemas alongside.
 *
 * @param doc - The parsed and validated OpenAPI document
 * @param resolver - A RefResolver for resolving $ref pointers
 * @param strategy - Method naming strategy (defaults to 'path-based')
 * @returns Operations with parallel raw request body schemas
 */
export function analyzePathsDetailed(
  doc: OpenAPIDocument,
  resolver: RefResolver,
  strategy: MethodNameStrategy = 'path-based'
): AnalyzedPathsResult {
  const operations: AnalyzedOperation[] = [];
  const requestBodySchemas: (SchemaObject | ReferenceObject | undefined)[] = [];

  if (!doc.paths) return { operations, requestBodySchemas };

  const usedTypePrefixes = new Set<string>();
  const usedMethodNames = new Set<string>();
  for (const [urlPath, pathItem] of Object.entries(doc.paths)) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;

      const mergedParams = mergeParameters(pathItem.parameters, operation.parameters, resolver);

      const analyzedParams = mergedParams.map((p) => analyzeParameter(p, resolver));

      const categorized = categorizeParameters(analyzedParams);

      const requestBodyResult = analyzeRequestBody(operation.requestBody, resolver);

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
        requestBody: requestBodyResult?.requestBody,
        responses,
      });
      requestBodySchemas.push(requestBodyResult?.rawSchema);
    }
  }

  // Dedupe type prefixes and method names so that distinct routes folding to
  // the same identifier (e.g. "/weird" and "/weird-", or "/Weird" and
  // "/weird") cannot produce duplicate exported types or client methods.
  // Assignment relies on insertion order and the fixed HTTP_METHODS loop.
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

  return { operations, requestBodySchemas };
}

/**
 * Analyze all paths and operations from an OpenAPI document into structured
 * data for code generation.
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
  return analyzePathsDetailed(doc, resolver, strategy).operations;
}
