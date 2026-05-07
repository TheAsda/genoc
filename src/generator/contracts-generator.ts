import { analyzePaths } from '../analyzer/path-analyzer.js';
import { SchemaMapper } from '../analyzer/schema-mapper.js';
import { RefResolver } from '../parser/ref-resolver.js';
import type { ContractEntry } from '../types/contracts.js';
import type {
  OpenAPIDocument,
  ReferenceObject,
  SchemaObject,
  SecuritySchemeObject,
  ServerVariableObject,
} from '../types/openapi.js';
import {
  RESERVED_TYPE_NAMES,
  buildSchemaRenameMap,
  sanitizeTypeName,
  toPascalCase,
  getOperationTypePrefix,
  makeHeader,
} from '../utils/generator-helpers.js';

function isBinaryContentType(ct: string): boolean {
  if (ct === 'application/octet-stream') return true;
  if (ct.startsWith('image/')) return true;
  if (ct.startsWith('video/')) return true;
  if (ct.startsWith('audio/')) return true;
  return false;
}

/**
 * If the schema is a $ref to a discriminated base type (or an array whose items
 * are), replace the type name with the {Base}Variant union type.
 */
function substituteDiscriminatedType(
  tsType: string,
  schema: unknown,
  discriminatorInfo: Map<string, { propertyName: string; mapping: Map<string, string> }>,
  renameMap: Map<string, string>
): string {
  const refSchema = schema as Record<string, unknown> | null;
  if (!refSchema || typeof refSchema !== 'object') return tsType;

  if (typeof refSchema.$ref === 'string') {
    const schemaName = sanitizeTypeName((refSchema.$ref as string).split('/').pop()!);
    if (schemaName && discriminatorInfo.has(schemaName)) {
      const renamed = renameMap.get(schemaName) ?? schemaName;
      return tsType.replace(new RegExp(`\\b${renamed}\\b`, 'g'), `${renamed}Variant`);
    }
  }

  if (refSchema.items && typeof refSchema.items === 'object') {
    const items = refSchema.items as Record<string, unknown>;
    if (typeof items.$ref === 'string') {
      const schemaName = sanitizeTypeName((items.$ref as string).split('/').pop()!);
      if (schemaName && discriminatorInfo.has(schemaName)) {
        const renamed = renameMap.get(schemaName) ?? schemaName;
        return tsType.replace(new RegExp(`\\b${renamed}\\b`, 'g'), `${renamed}Variant`);
      }
    }
  }

  return tsType;
}

function buildJsDoc(description?: string): string | undefined {
  if (!description) return undefined;
  return `/** ${description} */`;
}

function securitySchemeToTsType(scheme: SecuritySchemeObject): string {
  const parts: string[] = [`type: "${scheme.type}"`];

  if (scheme.description) {
    parts.push(`description: "${scheme.description}"`);
  }

  if (scheme.type === 'apiKey') {
    if (scheme.name) parts.push(`name: "${scheme.name}"`);
    if (scheme.in) parts.push(`in: "${scheme.in}"`);
  }

  if (scheme.type === 'http') {
    if (scheme.scheme) parts.push(`scheme: "${scheme.scheme}"`);
    if (scheme.bearerFormat) parts.push(`bearerFormat: "${scheme.bearerFormat}"`);
  }

  if (scheme.type === 'oauth2' && scheme.flows) {
    const flowParts: string[] = [];
    const flows = scheme.flows;
    if (flows.implicit) {
      flowParts.push(`implicit: ${oAuth2FlowToTs(flows.implicit, true)}`);
    }
    if (flows.password) {
      flowParts.push(`password: ${oAuth2FlowToTs(flows.password, false)}`);
    }
    if (flows.clientCredentials) {
      flowParts.push(`clientCredentials: ${oAuth2FlowToTs(flows.clientCredentials, false)}`);
    }
    if (flows.authorizationCode) {
      flowParts.push(`authorizationCode: ${oAuth2FlowToTs(flows.authorizationCode, true)}`);
    }
    parts.push(`flows: { ${flowParts.join('; ')} }`);
  }

  if (scheme.type === 'openIdConnect' && scheme.openIdConnectUrl) {
    parts.push(`openIdConnectUrl: "${scheme.openIdConnectUrl}"`);
  }

  return `{ ${parts.join('; ')} }`;
}

function oAuth2FlowToTs(
  flow: {
    authorizationUrl?: string;
    tokenUrl?: string;
    refreshUrl?: string;
    scopes: Record<string, string>;
  },
  hasAuthUrl: boolean
): string {
  const entries: string[] = [];
  if (hasAuthUrl && flow.authorizationUrl) {
    entries.push(`authorizationUrl: "${flow.authorizationUrl}"`);
  }
  if (flow.tokenUrl) {
    entries.push(`tokenUrl: "${flow.tokenUrl}"`);
  }
  if (flow.refreshUrl) {
    entries.push(`refreshUrl: "${flow.refreshUrl}"`);
  }
  const scopeEntries = Object.entries(flow.scopes)
    .map(([k, v]) => `"${k}": "${v}"`)
    .join('; ');
  entries.push(`scopes: { ${scopeEntries} }`);
  return `{ ${entries.join('; ')} }`;
}

/**
 * Sort ContractEntry list so that referenced types appear before referrers.
 * Uses DFS-based topological sort; cycles are broken by skipping.
 */
function topologicalSort(entries: ContractEntry[], allNames: Set<string>): ContractEntry[] {
  if (entries.length <= 1) return entries;

  const nameToIndex = new Map<string, number>();
  entries.forEach((e, i) => nameToIndex.set(e.name, i));

  const graph = new Map<number, Set<number>>();
  for (let i = 0; i < entries.length; i++) {
    const deps = new Set<number>();
    const def = entries[i].definition;
    for (const name of allNames) {
      if (name === entries[i].name) continue;
      if (new RegExp(`\\b${name}\\b`).test(def)) {
        const depIdx = nameToIndex.get(name);
        if (depIdx !== undefined) {
          deps.add(depIdx);
        }
      }
    }
    graph.set(i, deps);
  }

  const sorted: ContractEntry[] = [];
  const visited = new Set<number>();
  const inStack = new Set<number>();

  function visit(idx: number): void {
    if (visited.has(idx)) return;
    if (inStack.has(idx)) return;
    inStack.add(idx);
    const deps = graph.get(idx);
    if (deps) {
      for (const dep of deps) {
        visit(dep);
      }
    }
    inStack.delete(idx);
    visited.add(idx);
    sorted.push(entries[idx]);
  }

  for (let i = 0; i < entries.length; i++) {
    visit(i);
  }

  return sorted;
}

/**
 * Generate the complete `*.contracts.ts` file content as a string.
 *
 * Sections produced:
 * 1. Header comment
 * 2. Schema types from `components/schemas`
 * 3. Query parameter types per operation
 * 4. Header parameter types per operation
 * 5. Request body types per operation
 * 6. Response / error types per operation
 * 7. ApiError class
 * 7b. UnspecifiedApiError class
 */
export function generateContracts(doc: OpenAPIDocument, resolver: RefResolver): string {
  const schemaNameList = doc.components?.schemas ? Object.keys(doc.components.schemas) : [];
  const renameMap = buildSchemaRenameMap(schemaNameList, RESERVED_TYPE_NAMES);

  for (const [original, renamed] of renameMap) {
    // TODO: Replace with structured logging solution
    // oxlint-disable-next-line no-console
    console.warn(
      `Warning: Schema "${original}" collides with a built-in type and was renamed to "${renamed}".`
    );
  }

  const renamingTypeGenerator = (refString: string): string => {
    const segments = refString.split('/');
    const rawSegment = segments[segments.length - 1] || 'unknown';
    const lastSegment = sanitizeTypeName(rawSegment);
    return renameMap.get(lastSegment) ?? lastSegment;
  };

  const discriminatorInfo = new Map<
    string,
    {
      propertyName: string;
      mapping: Map<string, string>;
    }
  >();

  if (doc.components?.schemas) {
    for (const [name, schema] of Object.entries(doc.components.schemas)) {
      const resolved = resolver.resolve<SchemaObject>(schema as SchemaObject | ReferenceObject);
      if (resolved.discriminator) {
        const mapping = new Map<string, string>();
        if (resolved.discriminator.mapping) {
          for (const [key, ref] of Object.entries(resolved.discriminator.mapping)) {
            const targetName = sanitizeTypeName(ref.split('/').pop() || key);
            const renamedTarget = renameMap.get(targetName) ?? targetName;
            mapping.set(key, renamedTarget);
          }
        }
        discriminatorInfo.set(sanitizeTypeName(name), {
          propertyName: resolved.discriminator.propertyName,
          mapping,
        });
      }
    }
  }

  const discriminatorTargets = new Map<string, { propertyName: string; literalValue: string }>();
  for (const [, info] of discriminatorInfo) {
    for (const [mappingKey, schemaName] of info.mapping) {
      discriminatorTargets.set(schemaName, {
        propertyName: info.propertyName,
        literalValue: mappingKey,
      });
    }
  }

  const allSchemaNames = new Set<string>();
  if (doc.components?.schemas) {
    for (const name of Object.keys(doc.components.schemas)) {
      allSchemaNames.add(sanitizeTypeName(name));
    }
  }

  const mapper = new SchemaMapper(
    resolver,
    renamingTypeGenerator,
    discriminatorTargets,
    allSchemaNames
  );
  const lines: string[] = [];

  lines.push(makeHeader(doc.openapi));

  // Section 1: Schema types
  const schemaEntries: ContractEntry[] = [];

  if (doc.components?.schemas) {
    for (const [name, schema] of Object.entries(doc.components.schemas)) {
      const sanitizedName = sanitizeTypeName(name);
      const renamedName = renameMap.get(sanitizedName) ?? sanitizedName;
      const result = mapper.mapSchema(schema, sanitizedName);
      const resolved = resolver.resolve<SchemaObject>(schema as SchemaObject | ReferenceObject);

      const definition = `export type ${renamedName} = ${result.tsType};`;

      schemaEntries.push({
        name: renamedName,
        kind: 'type',
        definition,
        jsDoc: buildJsDoc(resolved.description),
      });
    }
  }

  const sortedSchemas = topologicalSort(schemaEntries, allSchemaNames);

  for (const entry of sortedSchemas) {
    lines.push('');
    if (entry.jsDoc) {
      lines.push(entry.jsDoc);
    }
    lines.push(entry.definition);
  }

  for (const [baseName, info] of discriminatorInfo) {
    const subtypeNames = Array.from(info.mapping.values());
    if (subtypeNames.length === 0) continue;
    const unionType = subtypeNames.join(' | ');
    const renamedBase = renameMap.get(sanitizeTypeName(baseName)) ?? sanitizeTypeName(baseName);
    lines.push('');
    lines.push(`export type ${renamedBase}Variant = ${unionType};`);
    allSchemaNames.add(`${renamedBase}Variant`);
  }

  // Section 1b: Security scheme types
  const securitySchemes = doc.components?.securitySchemes;
  if (securitySchemes && Object.keys(securitySchemes).length > 0) {
    const securityTypeNames: string[] = [];

    for (const [schemeName, scheme] of Object.entries(securitySchemes)) {
      const typeName = `${toPascalCase(schemeName)}Auth`;
      const tsType = securitySchemeToTsType(scheme);
      if (scheme.description) {
        lines.push('');
        lines.push(buildJsDoc(scheme.description)!);
      }
      lines.push('');
      lines.push(`export type ${typeName} = ${tsType};`);
      securityTypeNames.push(typeName);
    }

    if (securityTypeNames.length > 1) {
      lines.push('');
      lines.push(`export type SecuritySchemes = ${securityTypeNames.join(' | ')};`);
    }
  }

  // Section 1c: Server variable types
  if (doc.servers) {
    for (let serverIdx = 0; serverIdx < doc.servers.length; serverIdx++) {
      const server = doc.servers[serverIdx];
      if (!server.variables || Object.keys(server.variables).length === 0) {
        continue;
      }

      const typeName = doc.servers.length === 1 ? 'ServerParams' : `Server${serverIdx + 1}Params`;

      const props: string[] = [];
      for (const [varName, variable] of Object.entries(server.variables)) {
        const sv = variable as ServerVariableObject;
        const jsDocParts: string[] = [];
        if (sv.description) {
          jsDocParts.push(sv.description);
        }
        if (sv.default !== undefined) {
          jsDocParts.push(`@default ${sv.default}`);
        }

        let tsType: string;
        if (sv.enum && sv.enum.length > 0) {
          tsType = sv.enum.map((v: string) => `"${v}"`).join(' | ');
        } else {
          tsType = 'string';
        }

        const jsDoc = jsDocParts.length > 0 ? `  /** ${jsDocParts.join(' ')} */` : null;
        if (jsDoc) {
          props.push(jsDoc);
        }
        props.push(`  ${varName}: ${tsType};`);
      }

      lines.push('');
      if (server.url) {
        lines.push(`/** Server: ${server.url} */`);
      }
      lines.push(`export interface ${typeName} {`);
      for (const prop of props) {
        lines.push(prop);
      }
      lines.push('}');
    }
  }

  const operations = analyzePaths(doc, resolver);
  const hasFileUpload = operations.some((op) => op.requestBody?.isMultipart);

  if (hasFileUpload) {
    lines.push('');
    lines.push('export interface FileInput {');
    lines.push('  data: Blob;');
    lines.push('  filename: string;');
    lines.push('}');
  }

  // Sections 2-4: Operation-derived types

  for (const op of operations) {
    const prefix = getOperationTypePrefix(op);
    const opLines: string[] = [];

    // Section 2: Query parameter types
    if (op.queryParams.length > 0) {
      const props = op.queryParams.map((param) => {
        const paramSchema = param.schema ?? { type: 'string' };
        const result = mapper.mapSchema(paramSchema);
        const optional = param.required ? '' : '?';
        const key = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(param.name) ? param.name : `"${param.name}"`;
        return `${key}${optional}: ${result.tsType}`;
      });
      opLines.push(`export type ${prefix}Query = { ${props.join('; ')}; };`);
    }

    // Section 2b: Header parameter types
    if (op.headerParams.length > 0) {
      const props = op.headerParams.map((param) => {
        const paramSchema = param.schema ?? { type: 'string' };
        const result = mapper.mapSchema(paramSchema);
        const optional = param.required ? '' : '?';
        const key = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(param.name) ? param.name : `"${param.name}"`;
        return `${key}${optional}: ${result.tsType}`;
      });
      opLines.push(`export type ${prefix}Headers = { ${props.join('; ')}; };`);
    }

    // Section 3: Request body types
    if (op.requestBody?.isMultipart && op.requestBody.schema) {
      const schema = resolver.resolveSchema(op.requestBody.schema);
      const requiredSet = new Set(schema.required ?? []);
      const props = Object.entries(schema.properties ?? {}).map(([name, propSchema]) => {
        const resolved = resolver.resolveSchema(propSchema as SchemaObject | ReferenceObject);
        const optional = requiredSet.has(name) ? '' : '?';
        let tsType: string;
        if (resolved.format === 'binary') {
          tsType = 'FileInput';
        } else if (resolved.type === 'array' && resolved.items?.format === 'binary') {
          tsType = 'FileInput[]';
        } else {
          tsType = 'string';
        }
        return `${name}${optional}: ${tsType}`;
      });
      if (props.length > 0) {
        opLines.push(`export type ${prefix}Body = { ${props.join('; ')}; };`);
      } else {
        opLines.push(`export type ${prefix}Body = Record<string, never>;`);
      }
    } else if (op.requestBody?.schema) {
      const hasBinaryContentType = op.requestBody.contentTypes.some(isBinaryContentType);
      if (hasBinaryContentType) {
        opLines.push(`export type ${prefix}Body = Blob;`);
      } else {
        const result = mapper.mapSchema(op.requestBody.schema, undefined, 'request');
        opLines.push(`export type ${prefix}Body = ${result.tsType};`);
      }
    }

    // Section 4: Response types
    const successResponses = op.responses.filter((r) => r.isSuccess);
    const errorResponses = op.responses.filter((r) => !r.isSuccess && r.statusCode !== 'default');
    const defaultResponse = op.responses.find((r) => !r.isSuccess && r.statusCode === 'default');

    // Success type
    if (successResponses.length > 0) {
      const types = successResponses.map((r) => {
        if (r.isBinary) return 'StreamResponse';
        if (r.schema) {
          const result = mapper.mapSchema(r.schema, undefined, 'response').tsType;
          return substituteDiscriminatedType(result, r.schema, discriminatorInfo, renameMap);
        }
        return r.tsType;
      });
      const successType = types.length === 1 ? types[0] : types.join(' | ');
      opLines.push(`export type ${prefix}Response = ${successType};`);
    }

    // Error types per status
    const errorTypes: { status: string; typeName: string }[] = [];
    for (const err of errorResponses) {
      const errorTypeName = `${prefix}Error${err.statusCode}`;
      let errorTsType: string;
      if (err.isBinary) {
        errorTsType = 'StreamResponse';
      } else if (err.schema) {
        errorTsType = mapper.mapSchema(err.schema, undefined, 'response').tsType;
      } else {
        errorTsType = err.tsType;
      }
      opLines.push(`export type ${errorTypeName} = ${errorTsType};`);
      errorTypes.push({ status: err.statusCode, typeName: errorTypeName });
    }

    // Default response error type
    if (defaultResponse) {
      const defaultTypeName = `${prefix}DefaultError`;
      let defaultTsType: string;
      if (defaultResponse.isBinary) {
        defaultTsType = 'StreamResponse';
      } else if (defaultResponse.schema) {
        defaultTsType = mapper.mapSchema(defaultResponse.schema, undefined, 'response').tsType;
      } else {
        defaultTsType = 'unknown';
      }
      opLines.push(`export type ${defaultTypeName} = ${defaultTsType};`);
    }

    // Error union
    if (errorTypes.length > 0) {
      const unionParts = errorTypes.map((e) => `ApiError<${e.status}, ${e.typeName}>`);
      opLines.push(`export type ${prefix}Errors = ${unionParts.join(' | ')};`);
    }

    if (opLines.length > 0) {
      for (const line of opLines) {
        lines.push('');
        lines.push(line);
      }
    }
  }

  // Emit branded type definitions after header, before everything else
  const brandedTypes = mapper.getBrandedTypes();
  if (brandedTypes.size > 0) {
    const brandLines: string[] = [];
    for (const brand of brandedTypes.values()) {
      brandLines.push(
        `export type ${brand.name} = ${brand.baseType} & { readonly __format?: '${brand.format}' };`
      );
    }
    lines.splice(1, 0, '', ...brandLines);
  }

  // Always emit StreamResponse class (used by Requester type)
  lines.push('');
  lines.push('export class StreamResponse {');
  lines.push('  constructor(');
  lines.push('    public readonly data: ReadableStream<Uint8Array>,');
  lines.push('    public readonly filename?: string,');
  lines.push('    public readonly headers: Record<string, string> = {},');
  lines.push('  ) {}');
  lines.push('}');

  lines.push('');
  lines.push(`export function streamResponse(
  data: ReadableStream<Uint8Array>,
  filename?: string,
  headers?: Record<string, string>,
): StreamResponse {
  return new StreamResponse(data, filename, headers ?? {});
}`);

  // ErrorResponse class
  lines.push('');
  lines.push(`export class ErrorResponse {
  constructor(
    public readonly status: number,
    public readonly data: unknown,
    public readonly headers: Record<string, string>,
    public readonly message?: string,
  ) {}
}`);

  // errorResponse() helper
  lines.push('');
  lines.push(`export function errorResponse(
  status: number,
  data: unknown,
  headers?: Record<string, string>,
  message?: string,
): ErrorResponse {
  return new ErrorResponse(status, data, headers ?? {}, message);
}`);

  // RequesterFailError class
  lines.push('');
  lines.push(`export class RequesterFailError extends Error {
  constructor(
    public readonly cause: unknown,
  ) {
    super(\`Request failed: \${cause instanceof Error ? cause.message : String(cause)}\`);
    this.name = "RequesterFailError";
  }
}`);

  // Section 5: ApiError class
  lines.push('');
  lines.push(`export class ApiError<TStatus extends number, TData> extends Error {
  constructor(
    public readonly status: TStatus,
    public readonly data: TData,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}`);

  // Section 5b: UnspecifiedApiError class
  lines.push('');
  lines.push(`export class UnspecifiedApiError extends ApiError<number, unknown> {
  constructor(
    status: number,
    data: unknown,
    message: string,
  ) {
    super(status, data, message);
    this.name = "UnspecifiedApiError";
  }
}`);

  const needsDefaultApiError = operations.some((op) =>
    op.responses.some((r) => !r.isSuccess && r.statusCode === 'default')
  );

  if (needsDefaultApiError) {
    lines.push('');
    lines.push(`export class DefaultApiError<TData> extends Error {
  constructor(
    public readonly status: number,
    public readonly data: TData,
    message: string,
  ) {
    super(message);
    this.name = "DefaultApiError";
  }
}`);
  }

  return lines.join('\n');
}
