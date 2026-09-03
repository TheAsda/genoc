import { analyzePaths, type AnalyzedParameter } from '../analyzer/path-analyzer.js';
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
  DEFAULT_RUNTIME_IMPORT_PATH,
  buildTypeJsDoc,
  sanitizeJsDocText,
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
    const rawName = (refSchema.$ref as string).split('/').pop()!;
    const schemaName = sanitizeTypeName(rawName);
    if (schemaName && discriminatorInfo.has(schemaName)) {
      const renamed = renameMap.get(rawName) ?? schemaName;
      return tsType.replace(new RegExp(`\\b${renamed}\\b`, 'g'), `${renamed}Variant`);
    }
  }

  if (refSchema.items && typeof refSchema.items === 'object') {
    const items = refSchema.items as Record<string, unknown>;
    if (typeof items.$ref === 'string') {
      const rawName = (items.$ref as string).split('/').pop()!;
      const schemaName = sanitizeTypeName(rawName);
      if (schemaName && discriminatorInfo.has(schemaName)) {
        const renamed = renameMap.get(rawName) ?? schemaName;
        return tsType.replace(new RegExp(`\\b${renamed}\\b`, 'g'), `${renamed}Variant`);
      }
    }
  }

  return tsType;
}

/**
 * Indent unit matching `INDENT_UNIT` in schema-mapper.ts (2 spaces, pinned by
 * the mapper's golden tests). Kept local to avoid modifying the mapper module.
 */
const INDENT_UNIT = '  ';

/**
 * Build a description-only type-level JSDoc comment for operation-derived
 * types (body / response). Returns '' when the description is absent or
 * whitespace-only so callers can skip emission entirely.
 */
function buildDescriptionJsDoc(description: string | undefined): string {
  if (description === undefined) return '';
  const sanitized = sanitizeJsDocText(description);
  return sanitized === '' ? '' : `/** ${sanitized} */`;
}

/**
 * Prefix a type definition with its JSDoc block (single- or multi-line),
 * keeping the comment directly above the `export type` line.
 */
function attachTypeJsDoc(jsDoc: string, definition: string): string {
  return jsDoc === '' ? definition : `${jsDoc}\n${definition}`;
}

/**
 * Indent every line of a JSDoc block by one indent unit so property comments
 * line up exactly with their property line (mapper indentation contract).
 */
function indentJsDocBlock(jsDoc: string): string[] {
  return jsDoc.split('\n').map((line) => `${INDENT_UNIT}${line}`);
}

/**
 * Build the JSDoc block for a query/header parameter property using the
 * pinned parameter merge rule: parameter-level description / deprecated /
 * example win over the schema's; default, title and examples come from the
 * schema only (carried by the spread).
 */
function buildParamPropertyJsDoc(param: AnalyzedParameter, schema: SchemaObject): string {
  return buildTypeJsDoc({
    ...schema,
    description: param.description ?? schema.description,
    deprecated: param.deprecated === true || schema.deprecated === true,
    example: param.example ?? schema.example,
  });
}

/**
 * Render a `${prefix}Query` / `${prefix}Headers` object body in the mapper's
 * multi-line format with per-property JSDoc from the parameter merge rule.
 */
function buildParamTypeBody(params: AnalyzedParameter[], mapper: SchemaMapper): string {
  const lines: string[] = [];
  for (const param of params) {
    const paramSchema = param.schema ?? { type: 'string' };
    const result = mapper.mapSchema(paramSchema);
    const optional = param.required ? '' : '?';
    const key = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(param.name) ? param.name : `"${param.name}"`;
    const jsDoc = buildParamPropertyJsDoc(param, paramSchema);
    if (jsDoc !== '') {
      lines.push(...indentJsDocBlock(jsDoc));
    }
    lines.push(`${INDENT_UNIT}${key}${optional}: ${result.tsType};`);
  }
  return `{\n${lines.join('\n')}\n}`;
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
 * Build the import + re-export block for the shared runtime classes.
 * Generated code re-uses the genoc runtime as the single source of truth
 * for class identity, so `instanceof` checks work across module boundaries.
 */
function buildRuntimeReexport(runtimeImportPath: string): string[] {
  return [
    '',
    `import { ApiError, StreamResponse } from '${runtimeImportPath}';`,
    'export {',
    '  ApiError,',
    '  UnspecifiedApiError,',
    '  DefaultApiError,',
    '  RequesterFailError,',
    '  StreamResponse,',
    '  ErrorResponse,',
    `} from '${runtimeImportPath}';`,
  ];
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
 * 7. Runtime re-export block (shared classes from the genoc runtime package)
 */
export function generateContracts(
  doc: OpenAPIDocument,
  resolver: RefResolver,
  runtimeImportPath: string = DEFAULT_RUNTIME_IMPORT_PATH
): string {
  const schemaNameList = doc.components?.schemas ? Object.keys(doc.components.schemas) : [];
  const renameMap = buildSchemaRenameMap(schemaNameList, RESERVED_TYPE_NAMES);

  for (const [original, renamed] of renameMap) {
    // TODO: Replace with structured logging solution
    // oxlint-disable-next-line no-console
    console.warn(
      `Warning: Schema "${original}" collides with a built-in type or another schema and was renamed to "${renamed}".`
    );
  }

  const renamingTypeGenerator = (refString: string): string => {
    const segments = refString.split('/');
    const rawSegment = segments[segments.length - 1] || 'unknown';
    return renameMap.get(rawSegment) ?? sanitizeTypeName(rawSegment);
  };

  const discriminatorInfo = new Map<
    string,
    {
      rawName: string;
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
            const rawTarget = ref.split('/').pop() || key;
            const renamedTarget = renameMap.get(rawTarget) ?? sanitizeTypeName(rawTarget);
            mapping.set(key, renamedTarget);
          }
        }
        discriminatorInfo.set(sanitizeTypeName(name), {
          rawName: name,
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
      allSchemaNames.add(renameMap.get(name) ?? sanitizeTypeName(name));
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

  const runtimeReexport = buildRuntimeReexport(runtimeImportPath);
  lines.push(...runtimeReexport);

  // Section 1: Schema types
  const schemaEntries: ContractEntry[] = [];

  if (doc.components?.schemas) {
    for (const [name, schema] of Object.entries(doc.components.schemas)) {
      const renamedName = renameMap.get(name) ?? sanitizeTypeName(name);
      const result = mapper.mapSchema(schema, renamedName);
      const resolved = resolver.resolve<SchemaObject>(schema as SchemaObject | ReferenceObject);

      const definition = `export type ${renamedName} = ${result.tsType};`;

      schemaEntries.push({
        name: renamedName,
        kind: 'type',
        definition,
        jsDoc: buildTypeJsDoc(resolved) || undefined,
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

  for (const [, info] of discriminatorInfo) {
    const subtypeNames = Array.from(info.mapping.values());
    if (subtypeNames.length === 0) continue;
    const unionType = subtypeNames.join(' | ');
    const renamedBase = renameMap.get(info.rawName) ?? sanitizeTypeName(info.rawName);
    lines.push('');
    lines.push(`export type ${renamedBase}Variant = ${unionType};`);
    allSchemaNames.add(`${renamedBase}Variant`);
  }

  // Section 1b: Security scheme types
  const securitySchemes = doc.components?.securitySchemes;
  if (securitySchemes && Object.keys(securitySchemes).length > 0) {
    const securityTypeNames: string[] = [];

    for (const [schemeName, scheme] of Object.entries(securitySchemes)) {
      const typeName = `${sanitizeTypeName(toPascalCase(schemeName))}Auth`;
      const tsType = securitySchemeToTsType(scheme);
      const schemeJsDoc = buildDescriptionJsDoc(scheme.description);
      if (schemeJsDoc !== '') {
        lines.push('');
        lines.push(schemeJsDoc);
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
          const description = sanitizeJsDocText(sv.description);
          if (description !== '') {
            jsDocParts.push(description);
          }
        }
        if (sv.default !== undefined) {
          jsDocParts.push(`@default ${sanitizeJsDocText(String(sv.default))}`);
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
      opLines.push(`export type ${prefix}Query = ${buildParamTypeBody(op.queryParams, mapper)};`);
    }

    // Section 2b: Header parameter types
    if (op.headerParams.length > 0) {
      opLines.push(
        `export type ${prefix}Headers = ${buildParamTypeBody(op.headerParams, mapper)};`
      );
    }

    // Section 3: Request body types
    const bodyJsDoc = op.requestBody ? buildDescriptionJsDoc(op.requestBody.description) : '';

    if (op.requestBody?.isMultipart && op.requestBody.schema) {
      const schema = resolver.resolveSchema(op.requestBody.schema);
      const requiredSet = new Set(schema.required ?? []);
      const propLines: string[] = [];
      for (const [name, propSchema] of Object.entries(schema.properties ?? {})) {
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
        const jsDoc = buildTypeJsDoc(resolved);
        if (jsDoc !== '') {
          propLines.push(...indentJsDocBlock(jsDoc));
        }
        propLines.push(`${INDENT_UNIT}${name}${optional}: ${tsType};`);
      }
      if (propLines.length > 0) {
        opLines.push(
          attachTypeJsDoc(bodyJsDoc, `export type ${prefix}Body = {\n${propLines.join('\n')}\n};`)
        );
      } else {
        opLines.push(
          attachTypeJsDoc(bodyJsDoc, `export type ${prefix}Body = Record<string, never>;`)
        );
      }
    } else if (op.requestBody?.schema) {
      const hasBinaryContentType = op.requestBody.contentTypes.some(isBinaryContentType);
      if (hasBinaryContentType) {
        opLines.push(attachTypeJsDoc(bodyJsDoc, `export type ${prefix}Body = Blob;`));
      } else {
        const result = mapper.mapSchema(op.requestBody.schema, undefined, 'request');
        opLines.push(attachTypeJsDoc(bodyJsDoc, `export type ${prefix}Body = ${result.tsType};`));
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
      // Type-level JSDoc from the lowest-numbered 2xx response (the analyzer
      // returns success responses in ascending status order).
      const responseJsDoc = buildDescriptionJsDoc(successResponses[0].description);
      opLines.push(
        attachTypeJsDoc(responseJsDoc, `export type ${prefix}Response = ${successType};`)
      );
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
    lines.splice(1 + runtimeReexport.length, 0, '', ...brandLines);
  }

  return lines.join('\n');
}
