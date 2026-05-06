import type { NormalizedSpec, NormalizedSchema } from '../normalized-spec.js';

/**
 * Normalize a raw OpenAPI 3.0.x specification to a consistent format.
 *
 * 3.0-specific transformations applied during normalization:
 * - `nullable: true` → `nullable: true` on the NormalizedSchema
 * - `exclusiveMinimum: true` + `minimum: 5` → `exclusiveMinimum: 5`
 * - `exclusiveMinimum: false` → removed (not included in output)
 * - `example: value` → `examples: [value]`
 * - `format: "binary"` → `fileUpload: { binary: true, base64: false }`
 * - `format: "byte"` → `fileUpload: { binary: false, base64: true }`
 * - `$ref` siblings are stripped (3.0 compliant behavior)
 * - Error if `items` is an array (3.1-only tuple syntax)
 */
export function normalizeSpec30(rawSpec: unknown): NormalizedSpec {
  if (!rawSpec || typeof rawSpec !== 'object' || Array.isArray(rawSpec)) {
    throw new Error('Invalid spec: must be a non-null object');
  }

  const raw = rawSpec as Record<string, unknown>;

  const rawInfo = raw.info;
  if (!rawInfo || typeof rawInfo !== 'object' || Array.isArray(rawInfo)) {
    throw new Error("Invalid spec: missing or invalid 'info' field");
  }
  const ri = rawInfo as Record<string, unknown>;
  const info: NormalizedSpec['info'] = {
    title: typeof ri.title === 'string' ? ri.title : '',
    version: typeof ri.version === 'string' ? ri.version : '',
    description: typeof ri.description === 'string' ? ri.description : undefined,
    termsOfService: typeof ri.termsOfService === 'string' ? ri.termsOfService : undefined,
    contact:
      ri.contact && typeof ri.contact === 'object' && !Array.isArray(ri.contact)
        ? (ri.contact as NormalizedSpec['info']['contact'])
        : undefined,
    license:
      ri.license && typeof ri.license === 'object' && !Array.isArray(ri.license)
        ? (ri.license as NormalizedSpec['info']['license'])
        : undefined,
  };

  const servers = Array.isArray(raw.servers)
    ? (raw.servers as NormalizedSpec['servers'])
    : undefined;

  let paths: NormalizedSpec['paths'];
  if (raw.paths && typeof raw.paths === 'object' && !Array.isArray(raw.paths)) {
    paths = {};
    for (const [pathKey, pathItem] of Object.entries(raw.paths as Record<string, unknown>)) {
      if (pathItem && typeof pathItem === 'object' && !Array.isArray(pathItem)) {
        paths[pathKey] = normalizePathItem(pathItem);
      }
    }
  }

  let components: NormalizedSpec['components'];
  if (raw.components && typeof raw.components === 'object' && !Array.isArray(raw.components)) {
    const rc = raw.components as Record<string, unknown>;
    components = {};

    if (rc.schemas && typeof rc.schemas === 'object' && !Array.isArray(rc.schemas)) {
      components.schemas = {};
      for (const [name, schema] of Object.entries(rc.schemas as Record<string, unknown>)) {
        components.schemas[name] = normalizeSchema(schema);
      }
    }

    if (rc.responses && typeof rc.responses === 'object')
      components.responses = rc.responses as Record<string, unknown>;
    if (rc.parameters && typeof rc.parameters === 'object')
      components.parameters = rc.parameters as Record<string, unknown>;
    if (rc.requestBodies && typeof rc.requestBodies === 'object')
      components.requestBodies = rc.requestBodies as Record<string, unknown>;
    if (rc.headers && typeof rc.headers === 'object')
      components.headers = rc.headers as Record<string, unknown>;
    if (rc.securitySchemes && typeof rc.securitySchemes === 'object')
      components.securitySchemes = rc.securitySchemes as Record<string, unknown>;
    if (rc.links && typeof rc.links === 'object')
      components.links = rc.links as Record<string, unknown>;
    if (rc.callbacks && typeof rc.callbacks === 'object')
      components.callbacks = rc.callbacks as Record<string, unknown>;
    if (rc.examples && typeof rc.examples === 'object')
      components.examples = rc.examples as Record<string, unknown>;
  }

  let webhooks: NormalizedSpec['webhooks'];
  if (raw.webhooks && typeof raw.webhooks === 'object' && !Array.isArray(raw.webhooks)) {
    webhooks = {};
    for (const [name, pathItem] of Object.entries(raw.webhooks as Record<string, unknown>)) {
      if (pathItem && typeof pathItem === 'object' && !Array.isArray(pathItem)) {
        webhooks[name] = normalizePathItem(pathItem);
      }
    }
  }

  return {
    openapi: typeof raw.openapi === 'string' ? raw.openapi : '3.0.0',
    info,
    servers,
    paths,
    components,
    security: Array.isArray(raw.security) ? raw.security : undefined,
    tags: Array.isArray(raw.tags) ? raw.tags : undefined,
    externalDocs:
      raw.externalDocs && typeof raw.externalDocs === 'object' && !Array.isArray(raw.externalDocs)
        ? (raw.externalDocs as NormalizedSpec['externalDocs'])
        : undefined,
    webhooks,
  };
}

/**
 * Normalize a schema object with 3.0-specific transformations.
 *
 * Key differences from 3.1 normalization:
 * - `nullable` keyword is the primary null indicator (not type arrays with "null")
 * - `exclusiveMinimum`/`exclusiveMaximum` are boolean modifiers of `minimum`/`maximum`
 * - `$ref` siblings are stripped (3.0 compliant behavior)
 * - `items` as array is an error (3.1-only tuple syntax)
 */
function normalizeSchema(schema: unknown): NormalizedSchema {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return { types: [], nullable: false, examples: [] };
  }

  const s = schema as Record<string, unknown>;

  if (typeof s.$ref === 'string') {
    return {
      $ref: s.$ref,
      types: [],
      nullable: false,
      examples: [],
    };
  }

  let types: string[] = [];
  let nullable = false;

  if (typeof s.type === 'string') {
    types = [s.type];
  } else if (Array.isArray(s.type)) {
    const typeArr = s.type as string[];
    if (typeArr.includes('null')) {
      nullable = true;
      types = typeArr.filter((t) => t !== 'null');
    } else {
      types = [...typeArr];
    }
  }

  if (s.nullable === true) {
    nullable = true;
  }

  let examples: unknown[] = [];
  if (Array.isArray(s.examples)) {
    examples = [...s.examples];
  } else if (s.example !== undefined) {
    examples = [s.example];
  }

  let exclusiveMinimum: number | undefined;
  if (s.exclusiveMinimum === true && typeof s.minimum === 'number') {
    exclusiveMinimum = s.minimum;
  } else if (typeof s.exclusiveMinimum === 'number') {
    exclusiveMinimum = s.exclusiveMinimum;
  }

  let exclusiveMaximum: number | undefined;
  if (s.exclusiveMaximum === true && typeof s.maximum === 'number') {
    exclusiveMaximum = s.maximum;
  } else if (typeof s.exclusiveMaximum === 'number') {
    exclusiveMaximum = s.exclusiveMaximum;
  }

  let fileUpload: NormalizedSchema['fileUpload'];
  if (typeof s.format === 'string') {
    if (s.format === 'binary') {
      fileUpload = { binary: true, base64: false };
    } else if (s.format === 'byte') {
      fileUpload = { binary: false, base64: true };
    }
  }

  const properties = normalizePropertyMap(s.properties);

  let items: NormalizedSchema | undefined;
  if (s.items !== undefined) {
    if (Array.isArray(s.items)) {
      throw new Error(
        "Schema 'items' as an array is not supported in OpenAPI 3.0 (tuple syntax is 3.1-only). Use prefixItems in 3.1."
      );
    }
    items = normalizeSchema(s.items);
  }

  const allOf = Array.isArray(s.allOf)
    ? s.allOf.map((item: unknown) => normalizeSchema(item))
    : undefined;
  const oneOf = Array.isArray(s.oneOf)
    ? s.oneOf.map((item: unknown) => normalizeSchema(item))
    : undefined;
  const anyOf = Array.isArray(s.anyOf)
    ? s.anyOf.map((item: unknown) => normalizeSchema(item))
    : undefined;

  let additionalProperties: boolean | NormalizedSchema | undefined;
  if (s.additionalProperties === true) {
    additionalProperties = true;
  } else if (s.additionalProperties === false) {
    additionalProperties = false;
  } else if (
    s.additionalProperties &&
    typeof s.additionalProperties === 'object' &&
    !Array.isArray(s.additionalProperties)
  ) {
    additionalProperties = normalizeSchema(s.additionalProperties);
  }

  return {
    types,
    nullable,
    format: typeof s.format === 'string' ? s.format : undefined,
    properties,
    required: Array.isArray(s.required) ? (s.required as string[]) : undefined,
    items,
    additionalProperties,
    allOf,
    oneOf,
    anyOf,
    enum: Array.isArray(s.enum) ? [...(s.enum as unknown[])] : undefined,
    const: 'const' in s ? s.const : undefined,
    default: 'default' in s ? s.default : undefined,
    description: typeof s.description === 'string' ? s.description : undefined,
    examples,
    fileUpload,
    exclusiveMinimum,
    exclusiveMaximum,
    minimum: typeof s.minimum === 'number' ? s.minimum : undefined,
    maximum: typeof s.maximum === 'number' ? s.maximum : undefined,
    readOnly: s.readOnly === true ? true : undefined,
    writeOnly: s.writeOnly === true ? true : undefined,
    deprecated: s.deprecated === true ? true : undefined,
    discriminator:
      s.discriminator && typeof s.discriminator === 'object' && !Array.isArray(s.discriminator)
        ? (s.discriminator as NormalizedSchema['discriminator'])
        : undefined,
  };
}

function normalizePropertyMap(raw: unknown): Record<string, NormalizedSchema> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length === 0) return undefined;
  const result: Record<string, NormalizedSchema> = {};
  for (const [key, val] of entries) {
    result[key] = normalizeSchema(val);
  }
  return result;
}

function normalizePathItem(
  raw: unknown
): NormalizedSpec['paths'] extends Record<string, infer T> ? T : never {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {} as NormalizedSpec['paths'] extends Record<string, infer T> ? T : never;
  }

  const pi = raw as Record<string, unknown>;
  const httpMethods = [
    'get',
    'put',
    'post',
    'delete',
    'options',
    'head',
    'patch',
    'trace',
  ] as const;

  const result: Record<string, unknown> = {};

  if (typeof pi.$ref === 'string') result.$ref = pi.$ref;
  if (typeof pi.summary === 'string') result.summary = pi.summary;
  if (typeof pi.description === 'string') result.description = pi.description;
  if (Array.isArray(pi.servers)) result.servers = pi.servers;

  if (Array.isArray(pi.parameters)) {
    result.parameters = (pi.parameters as unknown[]).map((p) => normalizeParameter(p));
  }

  for (const method of httpMethods) {
    const op = pi[method];
    if (op && typeof op === 'object' && !Array.isArray(op)) {
      result[method] = normalizeOperation(op);
    }
  }

  return result as NormalizedSpec['paths'] extends Record<string, infer T> ? T : never;
}

function normalizeOperation(raw: unknown): NormalizedOperation {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { responses: {} } as NormalizedOperation;
  }

  const o = raw as Record<string, unknown>;
  const result: NormalizedOperation = {
    responses: {},
  };

  if (Array.isArray(o.tags)) result.tags = o.tags as string[];
  if (typeof o.summary === 'string') result.summary = o.summary;
  if (typeof o.description === 'string') result.description = o.description;
  if (typeof o.operationId === 'string') result.operationId = o.operationId;
  if (o.deprecated === true) result.deprecated = true;
  if (Array.isArray(o.security)) result.security = o.security;
  if (Array.isArray(o.servers)) result.servers = o.servers;

  if (Array.isArray(o.parameters)) {
    result.parameters = (o.parameters as unknown[]).map((p) => normalizeParameter(p));
  }

  if (o.requestBody && typeof o.requestBody === 'object' && !Array.isArray(o.requestBody)) {
    const rb = o.requestBody as Record<string, unknown>;
    result.requestBody = {
      content: normalizeContentMap(rb.content),
    };
    if (typeof rb.description === 'string') result.requestBody.description = rb.description;
    if (rb.required === true) result.requestBody.required = true;
  }

  if (o.responses && typeof o.responses === 'object' && !Array.isArray(o.responses)) {
    const responses: NormalizedOperation['responses'] = {};
    for (const [code, resp] of Object.entries(o.responses as Record<string, unknown>)) {
      if (resp && typeof resp === 'object' && !Array.isArray(resp)) {
        const r = resp as Record<string, unknown>;
        responses[code] = {
          description: typeof r.description === 'string' ? r.description : '',
        };
        if (r.headers && typeof r.headers === 'object')
          responses[code].headers = r.headers as Record<string, unknown>;
        if (r.content && typeof r.content === 'object')
          responses[code].content = normalizeContentMap(r.content);
        if (r.links && typeof r.links === 'object')
          responses[code].links = r.links as Record<string, unknown>;
      }
    }
    result.responses = responses;
  }

  return result;
}

function normalizeContentMap(raw: unknown): Record<
  string,
  {
    schema?: NormalizedSchema;
    examples?: Record<string, unknown>;
    example?: unknown;
    encoding?: Record<string, unknown>;
  }
> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }

  const result: Record<
    string,
    {
      schema?: NormalizedSchema;
      examples?: Record<string, unknown>;
      example?: unknown;
      encoding?: Record<string, unknown>;
    }
  > = {};

  for (const [mediaType, mediaObj] of Object.entries(raw as Record<string, unknown>)) {
    if (mediaObj && typeof mediaObj === 'object' && !Array.isArray(mediaObj)) {
      const m = mediaObj as Record<string, unknown>;
      const entry: {
        schema?: NormalizedSchema;
        examples?: Record<string, unknown>;
        example?: unknown;
        encoding?: Record<string, unknown>;
      } = {};

      if (m.schema) {
        entry.schema = normalizeSchema(m.schema);
      }
      if (m.examples && typeof m.examples === 'object')
        entry.examples = m.examples as Record<string, unknown>;
      if ('example' in m) entry.example = m.example;
      if (m.encoding && typeof m.encoding === 'object')
        entry.encoding = m.encoding as Record<string, unknown>;

      result[mediaType] = entry;
    }
  }

  return result;
}

function normalizeParameter(raw: unknown): NormalizedParameter {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { name: '', in: 'query' } as NormalizedParameter;
  }

  const p = raw as Record<string, unknown>;

  if (typeof p.$ref === 'string') {
    return {
      name: '',
      in: 'query',
      $ref: p.$ref,
    } as NormalizedParameter;
  }

  const result: NormalizedParameter = {
    name: typeof p.name === 'string' ? p.name : '',
    in: ['query', 'path', 'header', 'cookie'].includes(p.in as string)
      ? (p.in as NormalizedParameter['in'])
      : 'query',
  };

  if (typeof p.description === 'string') result.description = p.description;
  if (p.required === true) result.required = true;
  if (p.deprecated === true) result.deprecated = true;
  if (p.schema) result.schema = normalizeSchema(p.schema);
  if (typeof p.style === 'string') result.style = p.style;
  if (p.explode !== undefined) result.explode = p.explode as boolean;
  if (p.allowEmptyValue === true) result.allowEmptyValue = true;
  if ('example' in p) result.example = p.example;
  if (p.examples && typeof p.examples === 'object')
    result.examples = p.examples as Record<string, unknown>;

  return result;
}

interface NormalizedOperation {
  tags?: string[];
  summary?: string;
  description?: string;
  operationId?: string;
  parameters?: Array<NormalizedParameter>;
  requestBody?: {
    description?: string;
    content: Record<
      string,
      {
        schema?: NormalizedSchema;
        examples?: Record<string, unknown>;
        example?: unknown;
        encoding?: Record<string, unknown>;
      }
    >;
    required?: boolean;
  };
  responses: Record<
    string,
    {
      description: string;
      headers?: Record<string, unknown>;
      content?: Record<
        string,
        {
          schema?: NormalizedSchema;
          examples?: Record<string, unknown>;
          example?: unknown;
          encoding?: Record<string, unknown>;
        }
      >;
      links?: Record<string, unknown>;
    }
  >;
  deprecated?: boolean;
  security?: unknown[];
  servers?: unknown[];
}

interface NormalizedParameter {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  description?: string;
  required?: boolean;
  deprecated?: boolean;
  schema?: NormalizedSchema;
  style?: string;
  explode?: boolean;
  allowEmptyValue?: boolean;
  example?: unknown;
  examples?: Record<string, unknown>;
  $ref?: string;
}
