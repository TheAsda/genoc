import { RefResolver } from '../parser/ref-resolver.js';
import type { TypeMappingResult } from '../types/contracts.js';
import type { SchemaObject, ReferenceObject } from '../types/openapi.js';
import { formatToBrandTypeName } from '../utils/case.js';
import { buildTypeJsDoc, sanitizeTypeName } from '../utils/generator-helpers.js';
import { escapeStringLiteral, quoteKey } from '../utils/string.js';
import { parseJsonPointer } from '../utils/url.js';
import type { DiscriminatorRegistry, DiscriminatorVariantEntry } from './discriminator-registry.js';

/** Indentation contract for multi-line types — 2-space unit pinned from the generated ServerParams interface; binding for downstream generators. */
const INDENT_UNIT = '  ';

function indentBy(level: number): string {
  return INDENT_UNIT.repeat(level);
}

/**
 * Callback to customize how $ref strings are converted to TypeScript type names.
 */
export type TypeNameGenerator = (refString: string) => string;

/**
 * Default: extracts the last segment of the JSON pointer.
 * "#/components/schemas/User" -> "User"
 */
function defaultTypeNameGenerator(refString: string): string {
  const segments = refString.split('/');
  const rawSegment = segments[segments.length - 1] || 'unknown';
  return sanitizeTypeName(rawSegment);
}

function isRefObject(obj: unknown): boolean {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    !Array.isArray(obj) &&
    '$ref' in (obj as Record<string, unknown>)
  );
}

function isComplexType(tsType: string): boolean {
  return (
    tsType.includes(' ') || tsType.includes('{') || tsType.includes('|') || tsType.includes('&')
  );
}

function needsParens(tsType: string): boolean {
  return tsType.includes(' | ') || tsType.includes(' & ');
}

/**
 * Whether the rendered type has a top-level `|` (depth 0, outside any
 * brackets/braces and outside string literals). Unlike the substring check
 * in `needsParens`, nested unions inside `{...}`, `<...>` or `'...'` do not
 * trigger it — this is the guard for appending `& {...}` onto a type whose
 * tail could otherwise capture the append (`X | null & {...}` loses the
 * literal to `null`).
 */
function hasTopLevelUnion(tsType: string): boolean {
  let depth = 0;
  let inString = false;
  for (let i = 0; i < tsType.length; i++) {
    const ch = tsType[i];
    if (ch === '\\') {
      i++;
      continue;
    }
    if (ch === "'") {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '(' || ch === '{' || ch === '[' || ch === '<') depth++;
    else if (ch === ')' || ch === '}' || ch === ']' || ch === '>') depth--;
    else if (depth === 0 && ch === '|' && tsType[i - 1] === ' ' && tsType[i + 1] === ' ') {
      return true;
    }
  }
  return false;
}

/** Decode the last segment of a `$ref` string into its raw component key (`~1`/`~0` unescaped). */
function decodedLastRefSegment(refStr: string): string {
  const segments = refStr.startsWith('#') ? parseJsonPointer(refStr.slice(1)) : refStr.split('/');
  return segments[segments.length - 1] ?? refStr;
}

/** Encode a component key for embedding in a `#/components/schemas/…` ref string. */
function encodePointerSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

/**
 * Same-family definition spine: set while mapping a discriminator mapping
 * target's OWN named definition (mapSchema with the target's name). Direct
 * combinator members of that definition see it; nested property/item refs do
 * not (D1/D2/D4 scoping).
 */
interface SpineContext {
  familyId: string;
  propertyName: string;
  literalValue: string;
}

function spineForEntry(entry: DiscriminatorVariantEntry): SpineContext {
  return {
    familyId: entry.familyId,
    propertyName: entry.propertyName,
    literalValue: entry.literalValue,
  };
}

/**
 * A variant's own declared discriminant on the discriminator property:
 * `const` first, then a single-value `enum` (D3). Multi-value enums and
 * absent props yield nothing.
 */
function ownDeclaredDiscriminant(propSchema: SchemaObject | undefined): string | undefined {
  if (!propSchema) return undefined;
  if (propSchema.const !== undefined) return String(propSchema.const);
  if (propSchema.enum !== undefined && propSchema.enum.length === 1) {
    return String(propSchema.enum[0]);
  }
  return undefined;
}

/**
 * SchemaMapper converts OpenAPI 3.1 Schema Objects to TypeScript type strings.
 *
 * Handles primitives, objects, arrays, enums, combinators (allOf/oneOf/anyOf),
 * references, nullable types, and readOnly/writeOnly context filtering.
 */
export class SchemaMapper {
  private readonly resolver: RefResolver;
  private readonly typeNameGenerator: TypeNameGenerator;
  private readonly discriminatorTargets: Map<
    string,
    { propertyName: string; literalValue: string }
  >;
  private readonly emittedNames: Set<string>;
  private readonly discriminatorRegistry: DiscriminatorRegistry | undefined;
  private readonly brandedTypes: Map<string, { name: string; format: string; baseType: string }> =
    new Map();
  private nullableWarned = false;
  private readonly warnSink: (message: string) => void;

  constructor(
    resolver: RefResolver,
    typeNameGenerator?: TypeNameGenerator,
    discriminatorTargets?: Map<string, { propertyName: string; literalValue: string }>,
    emittedNames?: Set<string>,
    warnSink?: (message: string) => void,
    discriminatorRegistry?: DiscriminatorRegistry
  ) {
    // NOTE: discriminatorTargets must be keyed by names produced by the SAME
    // (rename-aware) typeNameGenerator that resolves $refs. Passing targets
    // keyed by raw schema names means renamed subtypes silently lose their
    // `& { prop: 'literal' }` intersection in the generated output.
    // When discriminatorRegistry is provided it is the SINGLE discriminator
    // knowledge source (D1–D10 seam); the legacy targets map only drives
    // registry-less constructions until the old paths are deleted.
    this.resolver = resolver;
    this.typeNameGenerator = typeNameGenerator ?? defaultTypeNameGenerator;
    this.discriminatorTargets = discriminatorTargets ?? new Map();
    this.emittedNames = emittedNames ?? new Set();
    this.discriminatorRegistry = discriminatorRegistry;
    this.warnSink =
      warnSink ??
      ((message) => {
        process.stderr.write(message);
      });
  }

  getBrandedTypes(): Map<string, { name: string; format: string; baseType: string }> {
    return this.brandedTypes;
  }

  /**
   * Convert an OpenAPI Schema Object to a TypeScript type string.
   *
   * @param schema - The schema to convert
   * @param name - Optional name for the schema (produces object literal type for objects)
   * @param context - Optional context for readOnly/writeOnly filtering
   * @returns TypeMappingResult with tsType string and imports array
   */
  mapSchema(
    schema: SchemaObject | ReferenceObject,
    name?: string,
    context?: 'request' | 'response'
  ): TypeMappingResult {
    if (typeof schema === 'boolean') {
      return { tsType: schema ? 'unknown' : 'never', imports: [] };
    }

    const visited = new Set<SchemaObject>();

    if (this.discriminatorRegistry && name !== undefined) {
      const entry = this.discriminatorRegistry.byName.get(name);
      const spine = entry ? spineForEntry(entry) : undefined;
      const result = this.mapInternal(schema, name, context, visited, 0, spine);
      if (entry) {
        return this.appendDiscriminatorLiteral(result, entry.propertyName, entry.literalValue);
      }
      return result;
    }

    const result = this.mapInternal(schema, name, context, visited, 0, undefined);

    if (name && this.discriminatorTargets.has(name)) {
      const target = this.discriminatorTargets.get(name)!;
      return this.appendDiscriminatorLiteral(
        result,
        target.propertyName,
        escapeStringLiteral(target.literalValue)
      );
    }

    return result;
  }

  /**
   * Append the discriminator literal intersection exactly ONCE (site 2),
   * parenthesizing a top-level union so `X | null & {...}` cannot bind the
   * literal to the last union member only (D9).
   */
  private appendDiscriminatorLiteral(
    result: TypeMappingResult,
    propertyName: string,
    literalValue: string
  ): TypeMappingResult {
    const appendage = ` & { ${quoteKey(propertyName)}: '${literalValue}' }`;
    const tsType = hasTopLevelUnion(result.tsType)
      ? `(${result.tsType})${appendage}`
      : `${result.tsType}${appendage}`;
    return { tsType, imports: result.imports };
  }

  private getBrandTypeName(format: string | undefined, openApiType: string): string | null {
    if (!format || format.trim() === '') return null;
    if (format === 'binary' || format === 'byte') return null;
    const brandName = formatToBrandTypeName(format, openApiType);
    if (this.emittedNames.has(brandName)) return null;
    return brandName;
  }

  private mapInternal(
    schema: SchemaObject | ReferenceObject,
    name: string | undefined,
    context: 'request' | 'response' | undefined,
    visited: Set<SchemaObject>,
    indent: number,
    spine: SpineContext | undefined
  ): TypeMappingResult {
    if (isRefObject(schema)) {
      const refStr = (schema as unknown as { $ref: string }).$ref;
      const refName = this.typeNameGenerator(refStr);

      if (this.discriminatorRegistry) {
        return this.translateRefThroughSeam(refStr, refName, context, visited, indent, spine);
      }

      let resolved: SchemaObject | undefined;
      try {
        resolved = this.resolver.resolveSchema(schema as SchemaObject);
      } catch {
        // unresolvable — skip discriminator detection
      }

      if (resolved) {
        const discInfo = this.resolveDiscriminatorInfo(resolved, refStr);
        if (discInfo) {
          const expanded = this.mapInternal(
            resolved,
            undefined,
            context,
            visited,
            indent,
            undefined
          );
          return this.appendDiscriminatorLiteral(
            expanded,
            discInfo.propertyName,
            escapeStringLiteral(discInfo.literalValue)
          );
        }
      }

      return { tsType: refName, imports: [refName] };
    }

    const s = schema as SchemaObject;

    if (visited.has(s)) {
      if (name) {
        return { tsType: name, imports: [] };
      }
      return { tsType: 'unknown', imports: [] };
    }
    visited.add(s);

    // TODO: Remove deprecated nullable warning and handling when OpenAPI 3.1 support is complete
    // The 'nullable' property is deprecated in OpenAPI 3.1 in favor of type arrays like ["string", "null"]
    // This warning should be removed once full type array support is implemented
    if (s.nullable === true && !this.nullableWarned) {
      this.warnSink(
        'Warning: \'nullable\' is deprecated in OpenAPI 3.1. Use \'type: ["string", "null"]\' instead.'
      );
      this.nullableWarned = true;
    }

    if (s.enum !== undefined && s.enum.length > 0) {
      let tsType = this.mapEnumValues(s.enum);
      if (s.nullable === true) {
        tsType = `${tsType} | null`;
      }
      return { tsType, imports: [] };
    }

    if (s.allOf !== undefined && s.allOf.length > 0) {
      const result = this.mapCombinator(s.allOf, '&', context, visited, indent, spine);
      if (s.nullable === true) {
        return {
          tsType: needsParens(result.tsType)
            ? `(${result.tsType}) | null`
            : `${result.tsType} | null`,
          imports: result.imports,
        };
      }
      return result;
    }

    if (s.oneOf !== undefined && s.oneOf.length > 0) {
      const result = s.discriminator
        ? this.mapDiscriminatedUnion(s.oneOf, s.discriminator, context, visited, indent, spine)
        : this.mapCombinator(s.oneOf, '|', context, visited, indent, spine);
      if (s.nullable === true) {
        return {
          tsType: needsParens(result.tsType)
            ? `(${result.tsType}) | null`
            : `${result.tsType} | null`,
          imports: result.imports,
        };
      }
      return result;
    }

    if (s.anyOf !== undefined && s.anyOf.length > 0) {
      const result = s.discriminator
        ? this.mapDiscriminatedUnion(s.anyOf, s.discriminator, context, visited, indent, spine)
        : this.mapCombinator(s.anyOf, '|', context, visited, indent, spine);
      if (s.nullable === true) {
        return {
          tsType: needsParens(result.tsType)
            ? `(${result.tsType}) | null`
            : `${result.tsType} | null`,
          imports: result.imports,
        };
      }
      return result;
    }

    if (s.type === undefined) {
      return { tsType: 'unknown', imports: [] };
    }

    if (Array.isArray(s.type)) {
      const nonNull = s.type.filter((t) => t !== 'null');
      const hasNull = s.type.includes('null');
      if (nonNull.length === 0) {
        return { tsType: 'null', imports: [] };
      }
      const baseResult = this.mapInternal(
        { ...s, type: nonNull[0] } as SchemaObject,
        name,
        context,
        new Set(visited),
        indent,
        spine
      );
      if (hasNull) {
        return {
          tsType: `${baseResult.tsType} | null`,
          imports: baseResult.imports,
        };
      }
      return baseResult;
    }

    switch (s.type) {
      case 'string': {
        const brandName = this.getBrandTypeName(s.format, 'string');
        if (brandName) {
          this.brandedTypes.set(`${s.format!}:string`, {
            name: brandName,
            format: s.format!,
            baseType: 'string',
          });
          return {
            tsType: s.nullable === true ? `${brandName} | null` : brandName,
            imports: [brandName],
          };
        }
        return {
          tsType: s.nullable === true ? 'string | null' : 'string',
          imports: [],
        };
      }
      case 'number':
      case 'integer': {
        const brandName = this.getBrandTypeName(s.format, s.type);
        if (brandName) {
          this.brandedTypes.set(`${s.format!}:number`, {
            name: brandName,
            format: s.format!,
            baseType: 'number',
          });
          return {
            tsType: s.nullable === true ? `${brandName} | null` : brandName,
            imports: [brandName],
          };
        }
        return {
          tsType: s.nullable === true ? 'number | null' : 'number',
          imports: [],
        };
      }
      case 'boolean':
        return {
          tsType: s.nullable === true ? 'boolean | null' : 'boolean',
          imports: [],
        };
      case 'null':
        return { tsType: 'null', imports: [] };
      case 'array':
        return this.mapArray(s, context, visited, indent);
      case 'object':
        return this.mapObject(s, name, context, visited, indent, spine);
      default:
        return { tsType: 'unknown', imports: [] };
    }
  }

  /**
   * The single ref-translation seam (site 1). When the mapper carries a
   * discriminator registry, EVERY `$ref` resolves through here:
   *
   * - a discriminator BASE becomes `{Base}Variant` at all sites except
   *   inside a same-family member's own definition spine, where it stays
   *   the bare base name (structural inheritance, no circularity — D1);
   * - a same-family mapping target inside a spine becomes `Omit<M, 'P'>`,
   *   falling back to inline expansion WITHOUT the literal when M is a
   *   union, nullable, unnamed or non-object (D2/D4);
   * - a mapping target at any other site is its bare name — the literal is
   *   injected exactly once, at the target's own named definition.
   */
  private translateRefThroughSeam(
    refStr: string,
    refName: string,
    context: 'request' | 'response' | undefined,
    visited: Set<SchemaObject>,
    indent: number,
    spine: SpineContext | undefined
  ): TypeMappingResult {
    const registry = this.discriminatorRegistry!;
    const canonical = this.canonicalSchemasRef(refStr);

    const baseFamily = registry.baseRefs.get(refStr) ?? registry.baseRefs.get(canonical);
    if (baseFamily) {
      if (spine && spine.familyId === baseFamily.familyId) {
        return { tsType: baseFamily.baseTypeName, imports: [baseFamily.baseTypeName] };
      }
      return { tsType: baseFamily.variantUnionName, imports: [baseFamily.variantUnionName] };
    }

    const entry = registry.byRef.get(refStr) ?? registry.byRef.get(canonical);
    if (entry) {
      if (spine && spine.familyId === entry.familyId) {
        return this.mapSameFamilySpineRef(entry, context, visited, indent);
      }
      if (entry.isNamed) {
        return { tsType: entry.typeName, imports: [entry.typeName] };
      }
      // Unnamed target at a leaf site: expand inline and append the literal
      // here — the target has no named definition to carry it.
      const resolved = this.tryResolveRef(entry.refStr);
      if (resolved) {
        const expanded = this.mapInternal(
          resolved,
          undefined,
          context,
          visited,
          indent,
          spineForEntry(entry)
        );
        return this.appendDiscriminatorLiteral(expanded, entry.propertyName, entry.literalValue);
      }
      return { tsType: entry.typeName, imports: [entry.typeName] };
    }

    return { tsType: refName, imports: [refName] };
  }

  /**
   * D2/D4 spine rule for a same-family `$ref`. `Omit<M, 'P'>` strips the
   * sibling's own literal so the appender can re-add ours; the inline-strip
   * fallback covers the cases where `Omit` would silently drop data
   * (union target: `Omit<A|B,K>` drops variant props; nullable target:
   * `Omit<M|null,K>` collapses to `{}`; unnamed/non-object target).
   */
  private mapSameFamilySpineRef(
    entry: DiscriminatorVariantEntry,
    context: 'request' | 'response' | undefined,
    visited: Set<SchemaObject>,
    indent: number
  ): TypeMappingResult {
    const resolved = this.tryResolveRef(entry.refStr);
    if (entry.isNamed && !entry.isUnion && !entry.isNullable && this.isObjectIshSchema(resolved)) {
      const key = `'${escapeStringLiteral(entry.propertyName)}'`;
      return { tsType: `Omit<${entry.typeName}, ${key}>`, imports: [entry.typeName] };
    }
    if (resolved) {
      return this.mapInternal(resolved, undefined, context, visited, indent, spineForEntry(entry));
    }
    return { tsType: entry.typeName, imports: [entry.typeName] };
  }

  /** Normalize a `#/components/schemas/…` ref to its canonically-encoded form (`a/b` ↔ `a~1b`). */
  private canonicalSchemasRef(refStr: string): string {
    if (!refStr.startsWith('#/components/schemas/')) return refStr;
    return `#/components/schemas/${encodePointerSegment(decodedLastRefSegment(refStr))}`;
  }

  private tryResolveRef(refStr: string): SchemaObject | undefined {
    try {
      return this.resolver.resolveSchema({ $ref: refStr } as SchemaObject);
    } catch {
      return undefined;
    }
  }

  private isObjectIshSchema(s: SchemaObject | undefined): boolean {
    if (!s) return false;
    if (s.type === 'object') return true;
    if (Array.isArray(s.type)) return s.type.includes('object');
    if (s.allOf !== undefined && s.allOf.length > 0) return true;
    return s.type === undefined && s.properties !== undefined;
  }

  private resolveDiscriminatorInfo(
    schema: SchemaObject,
    refStr: string
  ): { propertyName: string; literalValue: string } | undefined {
    const schemaName = this.typeNameGenerator(refStr);
    const target = this.discriminatorTargets.get(schemaName);
    if (target) return target;

    if (!schema.allOf || schema.allOf.length === 0) return undefined;

    for (const item of schema.allOf) {
      if (isRefObject(item)) {
        const resolved = this.resolver.resolveSchema(item as SchemaObject);
        if (resolved.discriminator) {
          const disc = resolved.discriminator;
          if (disc.mapping) {
            for (const [value, ref] of Object.entries(disc.mapping)) {
              if (ref === refStr) {
                return { propertyName: disc.propertyName, literalValue: value };
              }
            }
          }
        }
      }
    }
    return undefined;
  }

  private mapEnumValues(values: unknown[]): string {
    return values
      .map((v) => {
        if (typeof v === 'string') return `'${escapeStringLiteral(v)}'`;
        if (typeof v === 'number') return String(v);
        if (typeof v === 'boolean') return String(v);
        if (v === null) return 'null';
        return 'unknown';
      })
      .join(' | ');
  }

  private mapCombinator(
    schemas: (SchemaObject | ReferenceObject)[],
    kind: '&' | '|',
    context: 'request' | 'response' | undefined,
    visited: Set<SchemaObject>,
    indent: number,
    spine: SpineContext | undefined
  ): TypeMappingResult {
    const results = schemas.map((s) =>
      this.mapInternal(s, undefined, context, visited, indent, spine)
    );

    const allImports: string[] = [];
    for (const r of results) {
      allImports.push(...r.imports);
    }

    const separator = kind === '&' ? ' & ' : ' | ';
    const parts = results.map((r) => {
      if (kind === '&' && r.tsType.includes(' | ')) {
        return `(${r.tsType})`;
      }
      return r.tsType;
    });

    return { tsType: parts.join(separator), imports: allImports };
  }

  private mapDiscriminatedUnion(
    schemas: (SchemaObject | ReferenceObject)[],
    discriminator: NonNullable<SchemaObject['discriminator']>,
    context: 'request' | 'response' | undefined,
    visited: Set<SchemaObject>,
    indent: number,
    spine: SpineContext | undefined
  ): TypeMappingResult {
    const propertyName = discriminator.propertyName;
    const mapping = discriminator.mapping;

    const allImports: string[] = [];
    const parts: string[] = [];

    for (const schema of schemas) {
      if (this.discriminatorRegistry && isRefObject(schema)) {
        const refStr = (schema as unknown as { $ref: string }).$ref;
        const canonical = this.canonicalSchemasRef(refStr);
        const entry =
          this.discriminatorRegistry.byRef.get(refStr) ??
          this.discriminatorRegistry.byRef.get(canonical);
        // D7: registered family variants are bare names — their named
        // definitions already carry the literal exactly once. An explicit
        // mapping defines the family's membership: when one exists, a
        // oneOf member absent from it is foreign (wrapper + warn below);
        // without a mapping every oneOf ref is an implicit member (D3).
        const mappedRef =
          mapping !== undefined &&
          (Object.values(mapping).includes(refStr) || Object.values(mapping).includes(canonical));
        if (entry && entry.propertyName === propertyName && (mapping === undefined || mappedRef)) {
          if (entry.isNamed) {
            allImports.push(entry.typeName);
            parts.push(entry.typeName);
            continue;
          }
          const resolved = this.tryResolveRef(entry.refStr);
          if (resolved) {
            const expanded = this.mapInternal(
              resolved,
              undefined,
              context,
              visited,
              indent,
              spineForEntry(entry)
            );
            allImports.push(...expanded.imports);
            parts.push(
              this.appendDiscriminatorLiteral(expanded, propertyName, entry.literalValue).tsType
            );
            continue;
          }
        }
        // Foreign (non-family) ref: keep the literal wrapper and warn —
        // nothing guarantees the target declares its own discriminant.
        this.warnSink(
          `Warning: discriminated union member "${refStr}" is not registered in a discriminator family; keeping the inline '{ ${propertyName}: <literal> } &' wrapper.\n`
        );
      }

      const discriminantValue = this.discriminatorRegistry
        ? this.resolveRegistryDiscriminantValue(schema, propertyName, mapping)
        : this.resolveDiscriminantValue(schema, propertyName, mapping);
      const variantResult = this.mapInternal(
        schema,
        undefined,
        context,
        visited,
        indent,
        this.discriminatorRegistry ? undefined : spine
      );
      allImports.push(...variantResult.imports);

      const quotedProp = quoteKey(propertyName);
      parts.push(`({ ${quotedProp}: '${discriminantValue}' } & ${variantResult.tsType})`);
    }

    return { tsType: parts.join(' | '), imports: allImports };
  }

  /**
   * D3 literal precedence for registry-mode wrapper literals (inline variant
   * schemas and foreign refs): mapping key > own `const` on the discriminant
   * property > single-value `enum` > RAW last ref segment (the runtime
   * value, NOT the sanitized type name). Values are escaped for a
   * single-quoted TS string.
   */
  private resolveRegistryDiscriminantValue(
    schema: SchemaObject | ReferenceObject,
    propertyName: string,
    mapping: Record<string, string> | undefined
  ): string {
    if (mapping && isRefObject(schema)) {
      const refStr = (schema as unknown as { $ref: string }).$ref;
      for (const [value, ref] of Object.entries(mapping)) {
        if (ref === refStr) return escapeStringLiteral(value);
      }
    }

    const resolved = isRefObject(schema)
      ? this.tryResolveRef((schema as unknown as { $ref: string }).$ref)
      : (schema as SchemaObject);

    const propSchema = resolved?.properties?.[propertyName];
    if (propSchema && propSchema.const !== undefined) {
      return escapeStringLiteral(String(propSchema.const));
    }
    if (propSchema && propSchema.enum !== undefined && propSchema.enum.length === 1) {
      return escapeStringLiteral(String(propSchema.enum[0]));
    }

    if (isRefObject(schema)) {
      const refStr = (schema as unknown as { $ref: string }).$ref;
      return escapeStringLiteral(decodedLastRefSegment(refStr));
    }

    return 'unknown';
  }

  private resolveDiscriminantValue(
    schema: SchemaObject | ReferenceObject,
    propertyName: string,
    mapping: Record<string, string> | undefined
  ): string {
    // Try explicit mapping first
    if (mapping && isRefObject(schema)) {
      const refStr = (schema as unknown as { $ref: string }).$ref;
      for (const [value, ref] of Object.entries(mapping)) {
        if (ref === refStr) return value;
      }
    }

    // Infer from const on the discriminator property
    const resolved = isRefObject(schema)
      ? this.resolver.resolve<SchemaObject>(schema as unknown as ReferenceObject)
      : (schema as SchemaObject);

    const propSchema = resolved.properties?.[propertyName];
    if (propSchema && propSchema.const !== undefined) {
      return String(propSchema.const);
    }

    // Fallback: use the type name from $ref
    if (isRefObject(schema)) {
      const refStr = (schema as unknown as { $ref: string }).$ref;
      return this.typeNameGenerator(refStr);
    }

    return 'unknown';
  }

  private mapArray(
    schema: SchemaObject,
    context: 'request' | 'response' | undefined,
    visited: Set<SchemaObject>,
    indent: number
  ): TypeMappingResult {
    if (!schema.items) {
      return {
        tsType: schema.nullable === true ? 'unknown[] | null' : 'unknown[]',
        imports: [],
      };
    }

    const itemResult = this.mapInternal(
      schema.items,
      undefined,
      context,
      visited,
      indent,
      undefined
    );
    const tsType = isComplexType(itemResult.tsType)
      ? `Array<${itemResult.tsType}>`
      : `${itemResult.tsType}[]`;

    return {
      tsType: schema.nullable === true ? `${tsType} | null` : tsType,
      imports: itemResult.imports,
    };
  }

  /**
   * Render the per-property JSDoc comment lines for an object property.
   *
   * Metadata comes from the property's own schema node; for a `$ref` property
   * the resolved target's own node metadata is used (one level only — never
   * recursed), so self-referential schemas cannot loop here.
   */
  private renderPropertyJsDoc(
    propSchema: SchemaObject | ReferenceObject,
    indentLevel: number
  ): string[] {
    let metaSchema: SchemaObject;
    if (isRefObject(propSchema)) {
      try {
        metaSchema = this.resolver.resolveSchema(propSchema as SchemaObject);
      } catch {
        return [];
      }
    } else {
      metaSchema = propSchema as SchemaObject;
    }

    const block = buildTypeJsDoc(metaSchema);
    if (block === '') return [];
    const ind = indentBy(indentLevel);
    return block.split('\n').map((line) => `${ind}${line}`);
  }

  private mapObject(
    schema: SchemaObject,
    name: string | undefined,
    context: 'request' | 'response' | undefined,
    visited: Set<SchemaObject>,
    indent: number,
    spine: SpineContext | undefined
  ): TypeMappingResult {
    const properties = schema.properties ?? {};
    const requiredSet = new Set(schema.required ?? []);
    const propNames = Object.keys(properties);

    const filteredPropNames = propNames.filter((propName) => {
      const propSchema = properties[propName];
      const resolved = isRefObject(propSchema)
        ? this.resolver.resolve<SchemaObject>(propSchema as unknown as ReferenceObject)
        : propSchema;
      if (context === 'response' && resolved.writeOnly === true) return false;
      if (context === 'request' && resolved.readOnly === true) return false;
      return true;
    });

    // Inside a mapping target's own definition the discriminator property is
    // supplied by the single literal append — an own redeclaration (const or
    // enum) would intersect a conflicting literal and collapse to `never`.
    if (spine) {
      const ownDiscIndex = filteredPropNames.indexOf(spine.propertyName);
      if (ownDiscIndex !== -1) {
        const ownValue = ownDeclaredDiscriminant(properties[spine.propertyName]);
        if (ownValue !== undefined && escapeStringLiteral(ownValue) !== spine.literalValue) {
          this.warnSink(
            `Warning: Discriminator mapping key "${spine.literalValue}" for property "${spine.propertyName}" conflicts with the variant's own declared value "${ownValue}"; the mapping key wins.\n`
          );
        }
        filteredPropNames.splice(ownDiscIndex, 1);
      }
    }

    const ownIndent = indentBy(indent);
    const memberIndent = indentBy(indent + 1);

    const memberLines: string[] = [];
    const allImports: string[] = [];

    if (schema.discriminator) {
      const discPropName = schema.discriminator.propertyName;
      const discIndex = filteredPropNames.indexOf(discPropName);
      if (discIndex !== -1) {
        filteredPropNames.splice(discIndex, 1);
      }
      memberLines.push(`${memberIndent}"${discPropName}": string;`);
    }

    for (const propName of filteredPropNames) {
      const propSchema = properties[propName];
      const propResult = this.mapInternal(
        propSchema,
        undefined,
        context,
        visited,
        indent + 1,
        undefined
      );
      allImports.push(...propResult.imports);

      memberLines.push(...this.renderPropertyJsDoc(propSchema, indent + 1));

      const optional = requiredSet.has(propName) ? '' : '?';
      const quotedName = quoteKey(propName);
      memberLines.push(`${memberIndent}${quotedName}${optional}: ${propResult.tsType};`);
    }

    const additionalProps = schema.additionalProperties;
    let indexSignature: string | null = null;

    if (additionalProps === false) {
      void 0;
    } else if (additionalProps === true) {
      indexSignature = '[key: string]: unknown';
    } else if (additionalProps !== undefined && typeof additionalProps === 'object') {
      const addPropResult = this.mapInternal(
        additionalProps,
        undefined,
        context,
        visited,
        indent + 1,
        undefined
      );
      allImports.push(...addPropResult.imports);
      indexSignature = `[key: string]: ${addPropResult.tsType}`;
    }

    const hasProps = memberLines.length > 0;
    const hasIndex = indexSignature !== null;

    let result: TypeMappingResult;

    if (!hasProps && !hasIndex) {
      if (name) {
        result = { tsType: `{}`, imports: allImports };
      } else {
        result = { tsType: 'Record<string, unknown>', imports: allImports };
      }
    } else if (!hasProps && hasIndex) {
      const valueType = indexSignature!.replace('[key: string]: ', '');
      if (name) {
        result = {
          tsType: `{\n${memberIndent}${indexSignature!};\n${ownIndent}}`,
          imports: allImports,
        };
      } else {
        result = {
          tsType: `Record<string, ${valueType}>`,
          imports: allImports,
        };
      }
    } else {
      const propsBlock = `{\n${memberLines.join('\n')}\n${ownIndent}}`;
      if (hasIndex) {
        const indexBlock = `{\n${memberIndent}${indexSignature!};\n${ownIndent}}`;
        result = {
          tsType: `${propsBlock} & ${indexBlock}`,
          imports: allImports,
        };
      } else {
        result = {
          tsType: propsBlock,
          imports: allImports,
        };
      }
    }

    if (schema.nullable === true) {
      return {
        tsType: hasTopLevelUnion(result.tsType)
          ? `(${result.tsType}) | null`
          : `${result.tsType} | null`,
        imports: result.imports,
      };
    }
    return result;
  }
}
