import { parseJsonPointer } from '../../../utils/url.js';
import type { ValidationResult } from '../../validators.js';
import type { NormalizedSpec, NormalizedSchema } from '../normalized-spec.js';
import type { VersionStrategy } from '../version-strategy.js';

const MAX_REF_DEPTH = 10;

/**
 * Version strategy for OpenAPI 3.1.x specifications.
 *
 * OpenAPI 3.1 is aligned with JSON Schema 2020-12 and supports:
 * - Type arrays (e.g., `type: ["string", "null"]`)
 * - Sibling properties alongside `$ref`
 * - `exclusiveMinimum`/`exclusiveMaximum` as numbers
 * - `webhooks` at the top level
 */
export class V3_1_VersionStrategy implements VersionStrategy {
  version(): string {
    return '3.1';
  }

  matches(spec: unknown): boolean {
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
      return false;
    }
    const specObj = spec as Record<string, unknown>;
    const openapiVersion = specObj.openapi;
    if (typeof openapiVersion === 'string') {
      return openapiVersion.startsWith('3.1');
    }
    return false;
  }

  /**
   * Normalize a raw OpenAPI 3.1 specification to a consistent format.
   *
   * Schema normalization:
   * - `type: "string"` → `types: ["string"]`
   * - `type: ["string", "null"]` → `types: ["string"]`, `nullable: true`
   * - `example: value` → `examples: [value]` (defensive)
   * - `exclusiveMinimum`/`exclusiveMaximum` extracted as numbers
   * - `format: "binary"` → `fileUpload: { binary: true, base64: false }`
   * - `format: "byte"` → `fileUpload: { binary: false, base64: true }`
   */
  normalizeSpec(rawSpec: unknown): NormalizedSpec {
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
          paths[pathKey] = this.normalizePathItem(pathItem);
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
          components.schemas[name] = this.normalizeSchema(schema);
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
          webhooks[name] = this.normalizePathItem(pathItem);
        }
      }
    }

    return {
      openapi: typeof raw.openapi === 'string' ? raw.openapi : '3.1.0',
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

  validateSpec(spec: NormalizedSpec): ValidationResult {
    const errors: string[] = [];

    if (!spec.openapi || typeof spec.openapi !== 'string') {
      errors.push("OpenAPI specification must have an 'openapi' field with string value");
    } else if (!spec.openapi.startsWith('3.1')) {
      errors.push(`OpenAPI version must start with '3.1', got: ${spec.openapi}`);
    }

    if (!spec.info) {
      errors.push("OpenAPI specification must have an 'info' field with object value");
    } else {
      if (!spec.info.title) {
        errors.push("Info object must have a 'title' field with string value");
      }
      if (!spec.info.version) {
        errors.push("Info object must have a 'version' field with string value");
      }
    }

    if (!spec.paths && !spec.components && !spec.webhooks) {
      errors.push(
        "OpenAPI specification must have at least one of 'paths', 'components', or 'webhooks'"
      );
    }

    if (spec.paths) {
      if (typeof spec.paths !== 'object' || Array.isArray(spec.paths)) {
        errors.push("'paths' field must be an object");
      }
    }

    if (spec.components?.schemas) {
      if (typeof spec.components.schemas !== 'object' || Array.isArray(spec.components.schemas)) {
        errors.push("'components.schemas' must be an object");
      } else {
        for (const [key, schema] of Object.entries(spec.components.schemas)) {
          if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
            errors.push(`Schema '${key}' must be an object`);
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Resolve a $ref within the document. For OpenAPI 3.1, sibling properties
   * alongside `$ref` are preserved via shallow merge (siblings override target).
   */
  resolveRef(ref: string, doc: unknown, context?: unknown): unknown {
    const resolving = new Set<string>();
    const resolved = this.resolveRefInternal(ref, doc, resolving, 0);

    if (context && typeof context === 'object' && !Array.isArray(context)) {
      const ctx = context as Record<string, unknown>;
      const siblings: Record<string, unknown> = {};
      let hasSiblings = false;

      for (const [key, value] of Object.entries(ctx)) {
        if (key !== '$ref') {
          siblings[key] = value;
          hasSiblings = true;
        }
      }

      if (
        hasSiblings &&
        resolved !== null &&
        resolved !== undefined &&
        typeof resolved === 'object' &&
        !Array.isArray(resolved)
      ) {
        return {
          ...(resolved as Record<string, unknown>),
          ...siblings,
        };
      }
    }

    return resolved;
  }

  getSupportedFeatures(): string[] {
    return ['typeArrays', 'webhooks', 'nullable', 'jsonSchema202012'];
  }
  private resolveRefInternal(
    ref: string,
    doc: unknown,
    resolving: Set<string>,
    depth: number
  ): unknown {
    if (ref.startsWith('http://') || ref.startsWith('https://')) {
      throw new Error(`External $ref resolution is not supported: ${ref}`);
    }

    if (!ref.startsWith('#')) {
      throw new Error(`External $ref resolution is not supported: ${ref}`);
    }

    if (depth >= MAX_REF_DEPTH) {
      throw new Error(`Maximum $ref depth (${MAX_REF_DEPTH}) exceeded: ${ref}`);
    }

    if (resolving.has(ref)) {
      const cyclePath = [...resolving, ref].join(' -> ');
      throw new Error(`Circular $ref detected: ${cyclePath}`);
    }

    resolving.add(ref);

    const pointer = ref.slice(1);
    const segments = parseJsonPointer(pointer);

    let current: unknown = doc;
    for (const segment of segments) {
      if (current === null || current === undefined) {
        throw new Error(`$ref "${ref}" could not be resolved: segment "${segment}" not found`);
      }
      if (typeof current !== 'object') {
        throw new Error(
          `$ref "${ref}" could not be resolved: segment "${segment}" is not an object`
        );
      }
      if (Array.isArray(current)) {
        const index = Number(segment);
        if (Number.isNaN(index)) {
          throw new Error(
            `$ref "${ref}" could not be resolved: "${segment}" is not a valid array index`
          );
        }
        current = (current as unknown[])[index];
      } else {
        current = (current as Record<string, unknown>)[segment];
      }
    }

    if (current === undefined) {
      throw new Error(`$ref "${ref}" could not be resolved`);
    }

    if (
      current !== null &&
      typeof current === 'object' &&
      !Array.isArray(current) &&
      '$ref' in (current as Record<string, unknown>)
    ) {
      const chainedRef = (current as Record<string, unknown>).$ref as string;
      return this.resolveRefInternal(chainedRef, doc, new Set(resolving), depth + 1);
    }

    return current;
  }

  private normalizeSchema(schema: unknown): NormalizedSchema {
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
        description: typeof s.description === 'string' ? s.description : undefined,
      };
    }

    let types: string[] = [];
    let nullable = false;

    if (Array.isArray(s.type)) {
      const typeArr = s.type as string[];
      if (typeArr.includes('null')) {
        nullable = true;
        types = typeArr.filter((t) => t !== 'null');
      } else {
        types = [...typeArr];
      }
    } else if (typeof s.type === 'string') {
      types = [s.type];
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

    const exclusiveMinimum =
      typeof s.exclusiveMinimum === 'number' ? s.exclusiveMinimum : undefined;
    const exclusiveMaximum =
      typeof s.exclusiveMaximum === 'number' ? s.exclusiveMaximum : undefined;

    let fileUpload: NormalizedSchema['fileUpload'];
    if (typeof s.format === 'string') {
      if (s.format === 'binary') {
        fileUpload = { binary: true, base64: false };
      } else if (s.format === 'byte') {
        fileUpload = { binary: false, base64: true };
      }
    }

    const properties = this.normalizePropertyMap(s.properties);
    const items = s.items ? this.normalizeSchema(s.items) : undefined;

    const allOf = Array.isArray(s.allOf)
      ? s.allOf.map((item: unknown) => this.normalizeSchema(item))
      : undefined;
    const oneOf = Array.isArray(s.oneOf)
      ? s.oneOf.map((item: unknown) => this.normalizeSchema(item))
      : undefined;
    const anyOf = Array.isArray(s.anyOf)
      ? s.anyOf.map((item: unknown) => this.normalizeSchema(item))
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
      additionalProperties = this.normalizeSchema(s.additionalProperties);
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

  private normalizePropertyMap(raw: unknown): Record<string, NormalizedSchema> | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return undefined;
    }
    const entries = Object.entries(raw as Record<string, unknown>);
    if (entries.length === 0) return undefined;
    const result: Record<string, NormalizedSchema> = {};
    for (const [key, val] of entries) {
      result[key] = this.normalizeSchema(val);
    }
    return result;
  }

  private normalizePathItem(
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
      result.parameters = (pi.parameters as unknown[]).map((p) => this.normalizeParameter(p));
    }

    for (const method of httpMethods) {
      const op = pi[method];
      if (op && typeof op === 'object' && !Array.isArray(op)) {
        result[method] = this.normalizeOperation(op);
      }
    }

    return result as NormalizedSpec['paths'] extends Record<string, infer T> ? T : never;
  }

  private normalizeOperation(raw: unknown): NormalizedOperation {
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
      result.parameters = (o.parameters as unknown[]).map((p) => this.normalizeParameter(p));
    }

    if (o.requestBody && typeof o.requestBody === 'object' && !Array.isArray(o.requestBody)) {
      const rb = o.requestBody as Record<string, unknown>;
      result.requestBody = {
        content: this.normalizeContentMap(rb.content),
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
            responses[code].content = this.normalizeContentMap(r.content);
          if (r.links && typeof r.links === 'object')
            responses[code].links = r.links as Record<string, unknown>;
        }
      }
      result.responses = responses;
    }

    return result;
  }

  private normalizeContentMap(raw: unknown): Record<
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
          entry.schema = this.normalizeSchema(m.schema);
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

  private normalizeParameter(raw: unknown): NormalizedParameter {
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
    if (p.schema) result.schema = this.normalizeSchema(p.schema);
    if (typeof p.style === 'string') result.style = p.style;
    if (p.explode !== undefined) result.explode = p.explode as boolean;
    if (p.allowEmptyValue === true) result.allowEmptyValue = true;
    if ('example' in p) result.example = p.example;
    if (p.examples && typeof p.examples === 'object')
      result.examples = p.examples as Record<string, unknown>;

    return result;
  }
}

// Re-export the interface types used internally for operation/parameter shapes
// These mirror NormalizedOperation and NormalizedParameter from normalized-spec.ts
// but are not exported from that module, so we use structural typing.

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
}
