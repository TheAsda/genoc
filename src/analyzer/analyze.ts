import { RefResolver } from '../parser/ref-resolver.js';
import type { ContractEntry } from '../types/contracts.js';
import type { OpenAPIDocument, ReferenceObject, SchemaObject } from '../types/openapi.js';
import {
  buildSchemaRenameMap,
  buildTypeJsDoc,
  sanitizeJsDocText,
  sanitizeTypeName,
} from '../utils/generator-helpers.js';
import { operationEmissions, RESERVED_TYPE_NAMES } from '../utils/operation-naming.js';
import { analyzePaths, type AnalyzedParameter } from './path-analyzer.js';
import { SchemaMapper } from './schema-mapper.js';
import type {
  AnalyzedSpec,
  AnalyzeOptions,
  BrandedTypeDeclaration,
  FileUploadPropertyFact,
  FinishedOperation,
  TypeDeclaration,
} from './types.js';

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
export function buildDescriptionJsDoc(description: string | undefined): string {
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
 * Analyze an OpenAPI document into the finished model every renderer consumes:
 * schema→TS-type translation (rename machinery, discriminator discovery, the
 * schema mapper) runs here exactly once, producing render-ready type text.
 *
 * @param doc - The parsed and validated OpenAPI document
 * @param opts - Optional resolver override and method naming strategy
 * @returns The AnalyzedSpec model consumed by all generators
 */
export function analyze(doc: OpenAPIDocument, opts: AnalyzeOptions = {}): AnalyzedSpec {
  const resolver = opts.resolver ?? new RefResolver(doc);
  const strategy = opts.strategy ?? 'path-based';

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
  const schemaTypes: TypeDeclaration[] = sortedSchemas.map((entry) => ({
    name: entry.name,
    definition: entry.definition,
    jsDoc: entry.jsDoc,
  }));

  for (const [, info] of discriminatorInfo) {
    const subtypeNames = Array.from(info.mapping.values());
    if (subtypeNames.length === 0) continue;
    const unionType = subtypeNames.join(' | ');
    const renamedBase = renameMap.get(info.rawName) ?? sanitizeTypeName(info.rawName);
    schemaTypes.push({
      name: `${renamedBase}Variant`,
      definition: `export type ${renamedBase}Variant = ${unionType};`,
    });
    allSchemaNames.add(`${renamedBase}Variant`);
  }

  const analyzedOperations = analyzePaths(doc, resolver, strategy);
  const operations: FinishedOperation[] = [];
  for (const op of analyzedOperations) {
    operations.push({
      ...op,
      contractsLines: [] as string[],
      fileUploadProperties: [] as FileUploadPropertyFact[],
    });
  }

  const hasFileUpload = operations.some((op) => op.requestBody?.isMultipart);

  // Sections 2-4: Operation-derived types. Presence decisions and type
  // names come from the emission inventory (operationEmissions); the
  // finished lines are assembled here so renderers never re-translate.

  for (const op of operations) {
    const emissions = operationEmissions(op);
    const opLines: string[] = [];

    // Section 2: Query parameter types
    if (emissions.query) {
      opLines.push(
        `export type ${emissions.query} = ${buildParamTypeBody(op.queryParams, mapper)};`
      );
    }

    // Section 2b: Header parameter types
    if (emissions.headers) {
      opLines.push(
        `export type ${emissions.headers} = ${buildParamTypeBody(op.headerParams, mapper)};`
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
        let kind: FileUploadPropertyFact['kind'];
        if (resolved.format === 'binary') {
          tsType = 'FileInput';
          kind = 'file';
        } else if (resolved.type === 'array' && resolved.items?.format === 'binary') {
          tsType = 'FileInput[]';
          kind = 'file-array';
        } else {
          tsType = 'string';
          kind = 'field';
        }
        op.fileUploadProperties.push({ name, required: requiredSet.has(name), kind });
        const jsDoc = buildTypeJsDoc(resolved);
        if (jsDoc !== '') {
          propLines.push(...indentJsDocBlock(jsDoc));
        }
        propLines.push(`${INDENT_UNIT}${name}${optional}: ${tsType};`);
      }
      if (propLines.length > 0) {
        opLines.push(
          attachTypeJsDoc(
            bodyJsDoc,
            `export type ${emissions.body} = {\n${propLines.join('\n')}\n};`
          )
        );
      } else {
        opLines.push(
          attachTypeJsDoc(bodyJsDoc, `export type ${emissions.body} = Record<string, never>;`)
        );
      }
    } else if (op.requestBody?.schema) {
      if (op.requestBody.isBinary) {
        opLines.push(attachTypeJsDoc(bodyJsDoc, `export type ${emissions.body} = Blob;`));
      } else {
        const result = mapper.mapSchema(op.requestBody.schema, undefined, 'request');
        opLines.push(
          attachTypeJsDoc(bodyJsDoc, `export type ${emissions.body} = ${result.tsType};`)
        );
      }
    }

    // Section 4: Response types
    const successResponses = op.responses.filter((r) => r.isSuccess);
    const errorResponses = op.responses.filter((r) => !r.isSuccess && r.statusCode !== 'default');
    const defaultResponse = op.responses.find((r) => !r.isSuccess && r.statusCode === 'default');

    // Success type
    if (emissions.response) {
      const types = successResponses.map((r) => {
        if (r.isBinary) {
          r.finishedType = 'StreamResponse';
          return 'StreamResponse';
        }
        if (r.schema) {
          const result = mapper.mapSchema(r.schema, undefined, 'response').tsType;
          const substituted = substituteDiscriminatedType(
            result,
            r.schema,
            discriminatorInfo,
            renameMap
          );
          r.finishedType = substituted;
          return substituted;
        }
        r.finishedType = r.tsType;
        return r.tsType;
      });
      const successType = types.length === 1 ? types[0] : types.join(' | ');
      // Type-level JSDoc from the lowest-numbered 2xx response (the analyzer
      // returns success responses in ascending status order).
      const responseJsDoc = buildDescriptionJsDoc(successResponses[0].description);
      opLines.push(
        attachTypeJsDoc(responseJsDoc, `export type ${emissions.response} = ${successType};`)
      );
    }

    // Error types per status (inventory pairs 1:1 with errorResponses by
    // construction: same filter, same order)
    for (let i = 0; i < errorResponses.length; i++) {
      const err = errorResponses[i];
      const errorTypeName = emissions.statusErrors[i].name;
      let errorTsType: string;
      if (err.isBinary) {
        errorTsType = 'StreamResponse';
      } else if (err.schema) {
        errorTsType = mapper.mapSchema(err.schema, undefined, 'response').tsType;
      } else {
        errorTsType = err.tsType;
      }
      err.finishedType = errorTsType;
      opLines.push(`export type ${errorTypeName} = ${errorTsType};`);
    }

    // Default response error type
    if (emissions.defaultError) {
      let defaultTsType: string;
      if (defaultResponse?.isBinary) {
        defaultTsType = 'StreamResponse';
      } else if (defaultResponse?.schema) {
        defaultTsType = mapper.mapSchema(defaultResponse.schema, undefined, 'response').tsType;
      } else {
        defaultTsType = 'unknown';
      }
      if (defaultResponse) {
        defaultResponse.finishedType = defaultTsType;
      }
      opLines.push(`export type ${emissions.defaultError} = ${defaultTsType};`);
    }

    // Error union
    if (emissions.errorsUnion) {
      const unionParts = emissions.statusErrors.map((e) => `ApiError<${e.status}, ${e.name}>`);
      opLines.push(`export type ${emissions.errorsUnion} = ${unionParts.join(' | ')};`);
    }

    op.contractsLines = opLines;
  }

  // Branded types snapshot after every mapSchema call has run, mirroring the
  // pre-refactor read position at the end of generateContracts.
  const brandedTypes: BrandedTypeDeclaration[] = Array.from(mapper.getBrandedTypes().values());

  return {
    specVersion: doc.openapi,
    operations,
    schemaTypes,
    brandedTypes,
    hasFileUpload,
    // transitional — translated to finished types in T3
    securitySchemes: doc.components?.securitySchemes,
    // transitional — translated to finished types in T3
    servers: doc.servers,
  };
}
