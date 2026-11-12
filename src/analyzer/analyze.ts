import { RefResolver } from '../parser/ref-resolver.js';
import type { ContractEntry } from '../types/contracts.js';
import type {
  OpenAPIDocument,
  ReferenceObject,
  SchemaObject,
  SecurityRequirementObject,
  SecuritySchemeObject,
  ServerObject,
  ServerVariableObject,
} from '../types/openapi.js';
import {
  buildSchemaRenameMap,
  buildTypeJsDoc,
  sanitizeJsDocText,
  sanitizeTypeName,
  toPascalCase,
} from '../utils/generator-helpers.js';
import { operationEmissions, RESERVED_TYPE_NAMES } from '../utils/operation-naming.js';
import { escapeStringLiteral } from '../utils/string.js';
import { buildDiscriminatorRegistry, renameAwareTypeName } from './discriminator-registry.js';
import {
  analyzePathsDetailed,
  collectFormProperties,
  findBinaryFieldNames,
  schemaContainsBinary,
  type AnalyzedParameter,
} from './path-analyzer.js';
import { SchemaMapper } from './schema-mapper.js';
import type {
  AnalyzedSecurityCall,
  AnalyzedSpec,
  AnalyzeOptions,
  BrandedTypeDeclaration,
  FileUploadPropertyFact,
  FinishedOperation,
  SecuritySchemeTypeDeclaration,
  ServerTypeDeclaration,
  TypeDeclaration,
} from './types.js';

/**
 * Indent unit matching `INDENT_UNIT` in schema-mapper.ts (2 spaces, pinned by
 * the mapper's golden tests). Kept local to avoid modifying the mapper module.
 */
const INDENT_UNIT = '  ';

/**
 * Shared warning channel for analyze() and the discriminator registry —
 * the same sink the mapper defaults to.
 */
function writeWarning(message: string): void {
  process.stderr.write(message);
}

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

/** Schema used for parameters declared without a `schema` (typed as `string`). */
function defaultedParamSchema(param: AnalyzedParameter): SchemaObject {
  return param.schema ?? { type: 'string' };
}

const STRING_SERIALIZABLE_MEMBER =
  /^(string|number|boolean|null|true|false|'[^']*'|-?\d+(?:\.\d+)?)$/;

/**
 * Whether a finished path-param type can be serialized inline with `String()`:
 * every union member must be a primitive with a defined string form, or a
 * string/number literal (literal unions like `'fast' | 'slow'` are kept).
 * Named component types count when their own mapped definition resolves
 * (transitively, cycle-safe) to such members — so `$ref` path params to
 * primitive aliases keep their named type. Anything else — objects, arrays,
 * named non-primitive `$ref` types — falls back to a `string` signature (the
 * pre-typed-path-params behavior), because there is no defined string
 * serialization for such values.
 */
function isInlineSerializableType(
  tsType: string,
  namedMappedTypes: ReadonlyMap<string, string>,
  seen: ReadonlySet<string> = new Set()
): boolean {
  return tsType.split('|').every((member) => {
    const token = member.trim();
    if (STRING_SERIALIZABLE_MEMBER.test(token)) return true;
    const namedDefinition = namedMappedTypes.get(token);
    if (namedDefinition === undefined || seen.has(token)) return false;
    const nextSeen = new Set(seen).add(token);
    return isInlineSerializableType(namedDefinition, namedMappedTypes, nextSeen);
  });
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
    const paramSchema = defaultedParamSchema(param);
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
 * Build the `key: "value"` fragments of a security scheme object — shared by
 * the contracts TYPE renderer (`'; '` separator) and the client CONST value
 * renderer (`', '` separator).
 */
function schemeParts(scheme: SecuritySchemeObject, separator: string): string[] {
  const parts: string[] = [`type: '${escapeStringLiteral(scheme.type)}'`];

  if (scheme.description) {
    parts.push(`description: '${escapeStringLiteral(scheme.description)}'`);
  }

  if (scheme.type === 'apiKey') {
    if (scheme.name) parts.push(`name: '${escapeStringLiteral(scheme.name)}'`);
    if (scheme.in) parts.push(`in: '${escapeStringLiteral(scheme.in)}'`);
  }

  if (scheme.type === 'http') {
    if (scheme.scheme) parts.push(`scheme: '${escapeStringLiteral(scheme.scheme)}'`);
    if (scheme.bearerFormat) {
      parts.push(`bearerFormat: '${escapeStringLiteral(scheme.bearerFormat)}'`);
    }
  }

  if (scheme.type === 'oauth2' && scheme.flows) {
    const flowParts: string[] = [];
    const flows = scheme.flows;
    if (flows.implicit) {
      flowParts.push(`implicit: ${oAuth2FlowToTs(flows.implicit, true, separator)}`);
    }
    if (flows.password) {
      flowParts.push(`password: ${oAuth2FlowToTs(flows.password, false, separator)}`);
    }
    if (flows.clientCredentials) {
      flowParts.push(
        `clientCredentials: ${oAuth2FlowToTs(flows.clientCredentials, false, separator)}`
      );
    }
    if (flows.authorizationCode) {
      flowParts.push(
        `authorizationCode: ${oAuth2FlowToTs(flows.authorizationCode, true, separator)}`
      );
    }
    parts.push(`flows: { ${flowParts.join(separator)} }`);
  }

  if (scheme.type === 'openIdConnect' && scheme.openIdConnectUrl) {
    parts.push(`openIdConnectUrl: '${escapeStringLiteral(scheme.openIdConnectUrl)}'`);
  }

  return parts;
}

function securitySchemeToTsType(scheme: SecuritySchemeObject): string {
  return `{ ${schemeParts(scheme, '; ').join('; ')} }`;
}

/** The scheme object as a value expression — client-file consts (`as const`). */
function securitySchemeConstExpression(scheme: SecuritySchemeObject): string {
  return `{ ${schemeParts(scheme, ', ').join(', ')} } as const`;
}

function oAuth2FlowToTs(
  flow: {
    authorizationUrl?: string;
    tokenUrl?: string;
    refreshUrl?: string;
    scopes: Record<string, string>;
  },
  hasAuthUrl: boolean,
  separator: string
): string {
  const entries: string[] = [];
  if (hasAuthUrl && flow.authorizationUrl) {
    entries.push(`authorizationUrl: '${escapeStringLiteral(flow.authorizationUrl)}'`);
  }
  if (flow.tokenUrl) {
    entries.push(`tokenUrl: '${escapeStringLiteral(flow.tokenUrl)}'`);
  }
  if (flow.refreshUrl) {
    entries.push(`refreshUrl: '${escapeStringLiteral(flow.refreshUrl)}'`);
  }
  const scopeEntries = Object.entries(flow.scopes)
    .map(([k, v]) => `'${escapeStringLiteral(k)}': '${escapeStringLiteral(v)}'`)
    .join(separator);
  entries.push(`scopes: { ${scopeEntries} }`);
  return `{ ${entries.join(separator)} }`;
}

/**
 * Translate `components.securitySchemes` into finished `{Name}Auth` type
 * declarations: sanitize + PascalCase the key, number collisions, render the
 * object type text, the client-file const, and the description JSDoc. Spec
 * key order preserved; `$ref` entries resolved through the resolver.
 */
function analyzeSecuritySchemes(
  securitySchemes: Record<string, SecuritySchemeObject | ReferenceObject> | undefined,
  resolver: RefResolver
): SecuritySchemeTypeDeclaration[] {
  const entries: SecuritySchemeTypeDeclaration[] = [];
  if (!securitySchemes || Object.keys(securitySchemes).length === 0) {
    return entries;
  }

  const usedSecurityTypeNames = new Set<string>();
  const usedConstNames = new Set<string>();

  for (const [schemeName, rawScheme] of Object.entries(securitySchemes)) {
    const scheme = resolver.resolve<SecuritySchemeObject>(rawScheme);
    const pascal = sanitizeTypeName(toPascalCase(schemeName));

    const baseTypeName = `${pascal}Auth`;
    let typeName = baseTypeName;
    let n = 2;
    while (usedSecurityTypeNames.has(typeName)) {
      typeName = `${baseTypeName}${n}`;
      n += 1;
    }
    usedSecurityTypeNames.add(typeName);

    const baseConstName = `${pascal.charAt(0).toLowerCase()}${pascal.slice(1)}Scheme`;
    let constName = baseConstName;
    n = 2;
    while (usedConstNames.has(constName)) {
      constName = `${baseConstName}${n}`;
      n += 1;
    }
    usedConstNames.add(constName);

    entries.push({
      schemeName,
      name: typeName,
      tsType: securitySchemeToTsType(scheme),
      jsDoc: buildDescriptionJsDoc(scheme.description),
      constName,
      constExpression: securitySchemeConstExpression(scheme),
    });
  }

  return entries;
}

/**
 * Resolve effective `security` requirements into per-call facts: each spec
 * requirement object becomes one AND-list of `{ schemeName, scopes }` calls,
 * `{}` becoming the empty (anonymous-access) alternative. Scheme names are
 * passed through unfiltered; the client generator degrades gracefully if a
 * name has no scheme (unreachable in practice — validation rejects unknown
 * names before analysis runs).
 */
function analyzeSecurityRequirements(
  requirements: SecurityRequirementObject[]
): AnalyzedSecurityCall[][] {
  return requirements.map((requirement) =>
    Object.entries(requirement).map(([schemeName, scopes]) => ({ schemeName, scopes }))
  );
}

/**
 * Translate `doc.servers` into finished server variable interface
 * declarations, one per server that declares variables. Names are index-aware
 * over ALL servers (`ServerParams` for a single-server document,
 * `Server{i}Params` otherwise), so variable-less servers still occupy an
 * index. Property lines carry their JSDoc and indentation.
 */
function analyzeServers(servers: ServerObject[] | undefined): ServerTypeDeclaration[] {
  const entries: ServerTypeDeclaration[] = [];
  if (!servers) return entries;

  for (let serverIdx = 0; serverIdx < servers.length; serverIdx++) {
    const server = servers[serverIdx];
    if (!server.variables || Object.keys(server.variables).length === 0) {
      continue;
    }

    const typeName = servers.length === 1 ? 'ServerParams' : `Server${serverIdx + 1}Params`;

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

    entries.push({
      name: typeName,
      url: server.url,
      propertyLines: props,
    });
  }

  return entries;
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
/**
 * Raw ref name when a schema is exactly a `#/components/schemas/…` `$ref`
 * (e.g. a multipart body whose whole schema is a component reference).
 */
function wholeBodySchemaRefName(schema: SchemaObject | ReferenceObject): string | undefined {
  if (!('$ref' in schema)) return undefined;
  const ref = schema.$ref;
  const prefix = '#/components/schemas/';
  return typeof ref === 'string' && ref.startsWith(prefix)
    ? ref.slice(prefix.length) || undefined
    : undefined;
}

/**
 * Occurrences of a `$ref` pointer anywhere in the raw document — any owner
 * counts (other operations, sibling content types, other components,
 * recursive self-references).
 */
function countRefOccurrences(node: unknown, pointer: string): number {
  if (Array.isArray(node)) {
    let count = 0;
    for (const item of node) count += countRefOccurrences(item, pointer);
    return count;
  }
  if (node !== null && typeof node === 'object') {
    const record = node as Record<string, unknown>;
    let count = record['$ref'] === pointer ? 1 : 0;
    for (const value of Object.values(record)) count += countRefOccurrences(value, pointer);
    return count;
  }
  return 0;
}

interface FormBodyPlan {
  /** FormData append facts, one per (allOf-merged) top-level form field. */
  facts: FileUploadPropertyFact[];
  /** Rendered object literal text (`{ … }`); null when the walk found no fields. */
  objectText: string | null;
}

/**
 * Shared multipart form walk: builds the append facts and the form-mapped
 * object literal (binary → `FileInput`, array-of-binary → `FileInput[]`,
 * non-file fields via the schema mapper so `$ref`s keep their named types).
 * Used both for flattened inline body types and for rendering the component
 * definition a whole-body `$ref` body reuses.
 */
function buildFormBodyPlan(
  schema: SchemaObject | ReferenceObject,
  resolver: RefResolver,
  mapper: SchemaMapper
): FormBodyPlan {
  const { properties, required: requiredSet } = collectFormProperties(schema, resolver);
  const propLines: string[] = [];
  const facts: FileUploadPropertyFact[] = [];
  for (const [name, propSchema] of properties) {
    const resolved = resolver.resolveSchema(propSchema);
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
      // Non-file fields keep their schema type: a `$ref` property maps to
      // the referenced named type (not a collapsed `string`), arrays and
      // primitives keep their own shapes. Only string-valued fields
      // (incl. `$ref`s resolving to `type: string` and string enums) are
      // appended directly; everything else is JSON-serialized by the
      // client, so the fact records it as `json-field`.
      tsType = mapper.mapSchema(propSchema, undefined, 'request').tsType;
      kind = resolved.type === 'string' ? 'field' : 'json-field';
    }
    facts.push({ name, required: requiredSet.has(name), kind });
    const jsDoc = buildTypeJsDoc(resolved);
    if (jsDoc !== '') {
      propLines.push(...indentJsDocBlock(jsDoc));
    }
    propLines.push(`${INDENT_UNIT}${name}${optional}: ${tsType};`);
  }
  return {
    facts,
    objectText: propLines.length > 0 ? `{\n${propLines.join('\n')}\n}` : null,
  };
}

/**
 * The renamed component type a whole-body `$ref` multipart body reuses,
 * when that component passed the override eligibility checks; `undefined`
 * when the body keeps its flattened inline form.
 */
function aliasedFormSchemaName(
  schema: SchemaObject | ReferenceObject,
  renameMap: Map<string, string>,
  overrides: Map<string, string>
): string | undefined {
  const refName = wholeBodySchemaRefName(schema);
  if (refName === undefined) return undefined;
  const renamed = renameMap.get(refName) ?? sanitizeTypeName(refName);
  return overrides.has(renamed) ? renamed : undefined;
}

export function analyze(doc: OpenAPIDocument, opts: AnalyzeOptions = {}): AnalyzedSpec {
  const resolver = opts.resolver ?? new RefResolver(doc);
  const strategy = opts.strategy ?? 'path-based';
  const warn = opts.warnSink ?? writeWarning;

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
    return renameAwareTypeName(renameMap, rawSegment);
  };

  const allSchemaNames = new Set<string>();
  if (doc.components?.schemas) {
    for (const name of Object.keys(doc.components.schemas)) {
      allSchemaNames.add(renameMap.get(name) ?? sanitizeTypeName(name));
    }
  }

  // Family-aware discriminator registry (plan D5) — the single knowledge
  // source for discriminator translation: the mapper's ref-translation seam
  // consumes it, and the always-emitted `{Base}Variant` unions below are
  // emitted from it.
  const discriminatorRegistry = buildDiscriminatorRegistry(
    doc.components?.schemas,
    resolver,
    renameMap,
    allSchemaNames,
    warn
  );

  const mapper = new SchemaMapper(resolver, {
    typeNameGenerator: renamingTypeGenerator,
    emittedNames: allSchemaNames,
    discriminatorRegistry,
    effectiveVersion: opts?.effectiveVersion,
  });

  const { operations: analyzedOperations, requestBodySchemas } = analyzePathsDetailed(
    doc,
    resolver,
    strategy
  );

  // Whole-body `$ref` multipart bodies reuse the referenced component type
  // instead of emitting a flattened copy beside it: the component's own
  // definition is rendered through the same form-field walk (binary →
  // `FileInput`, non-file `$ref`s keep their named types), so the body type
  // becomes `PostXBody = PostRequest` and the component stays referenced
  // instead of being orphaned by its flattened twin.
  const multipartSchemaOverrides = new Map<string, string>();
  const overriddenSchemaRawTypes = new Map<string, string>();
  const componentSchemaNames = new Set<string>();
  if (doc.components?.schemas) {
    for (let opIdx = 0; opIdx < analyzedOperations.length; opIdx++) {
      const rawBody = requestBodySchemas[opIdx];
      if (rawBody === undefined || !analyzedOperations[opIdx].requestBody?.isMultipart) continue;
      const refName = wholeBodySchemaRefName(rawBody);
      if (refName === undefined || !(refName in doc.components.schemas)) continue;
      const renamed = renameMap.get(refName) ?? sanitizeTypeName(refName);
      // Single-consumer rule: any other `$ref` to this schema — another
      // operation, a sibling content type, another component, a recursive
      // self-reference — still needs the raw schema mapping, so that body
      // keeps its flattened form. Discriminator family members are excluded
      // because their definitions carry family-specific rendering.
      if (
        discriminatorRegistry.byName.has(renamed) ||
        countRefOccurrences(doc, `#/components/schemas/${refName}`) !== 1
      ) {
        continue;
      }
      const plan = buildFormBodyPlan(rawBody, resolver, mapper);
      if (plan.objectText !== null && !multipartSchemaOverrides.has(renamed)) {
        multipartSchemaOverrides.set(renamed, plan.objectText);
      }
    }
  }

  // Section 1: Schema types
  const schemaEntries: ContractEntry[] = [];

  // Mapped definition text per renamed component name — lets the path-param
  // inline-serializability check resolve named types to their primitives.
  const namedMappedTypes = new Map<string, string>();

  if (doc.components?.schemas) {
    for (const [name, schema] of Object.entries(doc.components.schemas)) {
      const renamedName = renameMap.get(name) ?? sanitizeTypeName(name);
      componentSchemaNames.add(renamedName);
      const rawResult = mapper.mapSchema(schema, renamedName);
      namedMappedTypes.set(renamedName, rawResult.tsType);
      const resolved = resolver.resolve<SchemaObject>(schema as SchemaObject | ReferenceObject);

      // Override-eligible multipart containers render their definition
      // through the form-field walk; the raw mapping is kept for the
      // orphan-pruning pass below.
      const overrideText = multipartSchemaOverrides.get(renamedName);
      if (overrideText !== undefined) {
        overriddenSchemaRawTypes.set(renamedName, rawResult.tsType);
      }
      const definition = `export type ${renamedName} = ${overrideText ?? rawResult.tsType};`;

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

  // Variant unions are emitted from the registry (D6): ALWAYS (mapping
  // values ∪ implicit oneOf/anyOf refs, deduped by rename-aware name) and
  // under collision-safe names so a user schema named `{Base}Variant`
  // cannot collide with the generated union.
  for (const family of discriminatorRegistry.families.values()) {
    if (family.variantUnionMembers.length === 0) continue;
    schemaTypes.push({
      name: family.variantUnionName,
      definition: `export type ${family.variantUnionName} = ${family.variantUnionMembers.join(' | ')};`,
    });
    allSchemaNames.add(family.variantUnionName);
  }

  const operations: FinishedOperation[] = [];
  for (const op of analyzedOperations) {
    // Path params render as flat method arguments, so each carries its
    // finished signature type. A raw `$ref` schema maps to the named contract
    // type (the same raw-schema travel pattern as request bodies and
    // responses — the contracts renderer emits the named type from the
    // component table); the mapper's import facts feed the client file's
    // `import type` list. Inline schemas map the resolved schema with
    // `format` stripped: path params are typed by their base primitive
    // (boolean, number, literal unions) and format brands don't flow into
    // signatures.
    const pathParamTypeNames = new Set<string>();
    for (const param of op.pathParams) {
      const raw = param.rawSchema;
      if (raw !== undefined && '$ref' in raw) {
        const result = mapper.mapSchema(raw);
        if (isInlineSerializableType(result.tsType, namedMappedTypes)) {
          param.finishedType = result.tsType;
          for (const name of result.imports) {
            pathParamTypeNames.add(name);
          }
        } else {
          // Inline-serialization constraint: a `$ref` to an object/array
          // schema (or any non-primitive named type) has no defined string
          // form, so the parameter falls back to `string` and the named
          // type is not imported into the client file.
          param.finishedType = 'string';
        }
        continue;
      }
      const schema = defaultedParamSchema(param);
      const tracerSchema = schema.format === undefined ? schema : { ...schema, format: undefined };
      const mapped = mapper.mapSchema(tracerSchema).tsType;
      param.finishedType = isInlineSerializableType(mapped, namedMappedTypes) ? mapped : 'string';
    }
    if (pathParamTypeNames.size > 0) {
      op.pathParamTypeNames = [...pathParamTypeNames];
    }
    const effectiveSecurity = op.security ?? doc.security;
    operations.push({
      ...op,
      contractsLines: [] as string[],
      securityRequirements:
        effectiveSecurity === undefined ? [] : analyzeSecurityRequirements(effectiveSecurity),
    });
  }

  const hasFileUpload = operations.some((op) => op.requestBody?.isMultipart);

  // Sections 2-4: Operation-derived types. Presence decisions and type
  // names come from the emission inventory (operationEmissions); the
  // finished lines are assembled here so renderers never re-translate.

  for (let opIdx = 0; opIdx < operations.length; opIdx++) {
    const op = operations[opIdx];
    // Raw request body schema, parallel to `operations` (analyzer-internal
    // translation input; presence mirrors requestBody.hasSchema).
    const rawBodySchema = requestBodySchemas[opIdx];
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

    // A urlencoded body declaring `format: binary` fields cannot transport
    // them — the generated client would silently type the files as plain
    // strings. Warn and name the offending fields (merged through allOf).
    if (
      op.requestBody?.contentTypes[0] === 'application/x-www-form-urlencoded' &&
      rawBodySchema !== undefined &&
      schemaContainsBinary(rawBodySchema, resolver)
    ) {
      const fieldNames = findBinaryFieldNames(rawBodySchema, resolver);
      const fieldList =
        fieldNames.length > 0
          ? ` declaring binary fields (${fieldNames.map((n) => `"${n}"`).join(', ')})`
          : ' declaring binary data';
      warn(
        `Warning: the request body of ${op.method.toUpperCase()} ${op.path} uses content type "application/x-www-form-urlencoded"${fieldList}, but urlencoded form data cannot transport binary files. File uploads require "multipart/form-data"; the generated client types these fields as plain strings.\n`
      );
    }

    // Section 3: Request body types
    const bodyJsDoc = op.requestBody ? buildDescriptionJsDoc(op.requestBody.description) : '';

    if (op.requestBody?.isMultipart && rawBodySchema !== undefined) {
      // Form fields come from the allOf-merged walk (shared with the
      // whole-body `$ref` override above): a body declaring its fields via
      // `allOf` members (resolving `$ref`s) previously produced an empty
      // property walk — `Record<string, never>` and dropped appends.
      const plan = buildFormBodyPlan(rawBodySchema, resolver, mapper);
      op.fileUploadProperties = plan.facts;
      // A whole-body `$ref` to an override-eligible component reuses the
      // component type instead of emitting a flattened twin beside it.
      const aliasName = aliasedFormSchemaName(rawBodySchema, renameMap, multipartSchemaOverrides);
      if (aliasName !== undefined) {
        opLines.push(attachTypeJsDoc(bodyJsDoc, `export type ${emissions.body} = ${aliasName};`));
      } else if (plan.objectText !== null) {
        opLines.push(
          attachTypeJsDoc(bodyJsDoc, `export type ${emissions.body} = ${plan.objectText};`)
        );
      } else {
        opLines.push(
          attachTypeJsDoc(bodyJsDoc, `export type ${emissions.body} = Record<string, never>;`)
        );
      }
    } else if (op.requestBody?.hasSchema && rawBodySchema !== undefined) {
      if (op.requestBody.isBinary) {
        opLines.push(attachTypeJsDoc(bodyJsDoc, `export type ${emissions.body} = Blob;`));
      } else {
        const result = mapper.mapSchema(rawBodySchema, undefined, 'request');
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
          const tsType = mapper.mapSchema(r.schema, undefined, 'response').tsType;
          r.finishedType = tsType;
          return tsType;
        }
        r.finishedType = r.isVoid ? 'void' : 'unknown';
        return r.finishedType;
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
        errorTsType = 'unknown';
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

  // Multipart overrides can orphan types: replacing a container's raw
  // definition with its form-mapped one drops the references the raw text
  // carried (e.g. a `$ref`-ed binary field now renders as `FileInput`). Those
  // override-orphaned component types are pruned — transitively, since
  // removing one can orphan what it referenced — while anything still
  // referenced by the final output is kept. Standalone component schemas
  // that were already unreferenced before the override stay emitted.
  if (multipartSchemaOverrides.size > 0) {
    const refsOf = (text: string): Set<string> => {
      const identifiers = text.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) ?? [];
      return new Set(identifiers.filter((id) => componentSchemaNames.has(id)));
    };
    const defByName = new Map(schemaTypes.map((entry) => [entry.name, entry.definition]));
    const opTexts = operations.map((finished) => finished.contractsLines.join('\n'));
    const isReferenced = (name: string): boolean => {
      for (const [owner, definition] of defByName) {
        if (owner !== name && refsOf(definition).has(name)) return true;
      }
      for (const text of opTexts) {
        if (refsOf(text).has(name)) return true;
      }
      return false;
    };

    const removed = new Set<string>();
    const queue: string[] = [];
    const enqueue = (name: string): void => {
      if (!removed.has(name)) {
        removed.add(name);
        queue.push(name);
      }
    };
    for (const raw of overriddenSchemaRawTypes.values()) {
      for (const name of refsOf(raw)) enqueue(name);
    }
    while (queue.length > 0) {
      const name = queue.shift();
      if (name === undefined) continue;
      const definition = defByName.get(name);
      if (definition === undefined) continue;
      for (const next of refsOf(definition)) enqueue(next);
    }
    // Safety net: never remove a type the final output still references.
    for (const name of removed) {
      if (isReferenced(name)) removed.delete(name);
    }
    if (removed.size > 0) {
      const kept = schemaTypes.filter((entry) => !removed.has(entry.name));
      schemaTypes.length = 0;
      schemaTypes.push(...kept);
    }
  }

  // Branded types snapshot after every mapSchema call has run, mirroring the
  // pre-refactor read position at the end of generateContracts.
  const brandedTypes: BrandedTypeDeclaration[] = Array.from(mapper.getBrandedTypes().values());

  const securitySchemeTypes = analyzeSecuritySchemes(doc.components?.securitySchemes, resolver);
  const serverTypes = analyzeServers(doc.servers);

  return {
    specVersion: doc.openapi,
    operations,
    schemaTypes,
    brandedTypes,
    hasFileUpload,
    securitySchemeTypes,
    serverTypes,
  };
}
