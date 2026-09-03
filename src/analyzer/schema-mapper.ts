import { RefResolver } from '../parser/ref-resolver.js';
import type { TypeMappingResult } from '../types/contracts.js';
import type { SchemaObject, ReferenceObject } from '../types/openapi.js';
import { formatToBrandTypeName } from '../utils/case.js';
import { buildTypeJsDoc, sanitizeTypeName } from '../utils/generator-helpers.js';
import { quoteKey } from '../utils/string.js';

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
  private readonly reservedNames: Set<string>;
  private readonly brandedTypes: Map<string, { name: string; format: string; baseType: string }> =
    new Map();
  private static nullableWarned = false;

  constructor(
    resolver: RefResolver,
    typeNameGenerator?: TypeNameGenerator,
    discriminatorTargets?: Map<string, { propertyName: string; literalValue: string }>,
    reservedNames?: Set<string>
  ) {
    // NOTE: discriminatorTargets must be keyed by names produced by the SAME
    // (rename-aware) typeNameGenerator that resolves $refs. Passing targets
    // keyed by raw schema names means renamed subtypes silently lose their
    // `& { prop: 'literal' }` intersection in the generated output.
    this.resolver = resolver;
    this.typeNameGenerator = typeNameGenerator ?? defaultTypeNameGenerator;
    this.discriminatorTargets = discriminatorTargets ?? new Map();
    this.reservedNames = reservedNames ?? new Set();
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
    const result = this.mapInternal(schema, name, context, visited, 0);

    if (name && this.discriminatorTargets.has(name)) {
      const target = this.discriminatorTargets.get(name)!;
      result.tsType += ` & { ${quoteKey(target.propertyName)}: '${target.literalValue}' }`;
    }

    return result;
  }

  private getBrandTypeName(format: string | undefined, openApiType: string): string | null {
    if (!format || format.trim() === '') return null;
    if (format === 'binary' || format === 'byte') return null;
    const brandName = formatToBrandTypeName(format, openApiType);
    if (this.reservedNames.has(brandName)) return null;
    return brandName;
  }

  private mapInternal(
    schema: SchemaObject | ReferenceObject,
    name: string | undefined,
    context: 'request' | 'response' | undefined,
    visited: Set<SchemaObject>,
    indent: number
  ): TypeMappingResult {
    if (isRefObject(schema)) {
      const refStr = (schema as unknown as { $ref: string }).$ref;
      const refName = this.typeNameGenerator(refStr);

      let resolved: SchemaObject | undefined;
      try {
        resolved = this.resolver.resolveSchema(schema as SchemaObject);
      } catch {
        // unresolvable — skip discriminator detection
      }

      if (resolved) {
        const discInfo = this.resolveDiscriminatorInfo(resolved, refStr);
        if (discInfo) {
          const expanded = this.mapInternal(resolved, undefined, context, visited, indent);
          expanded.tsType += ` & { ${quoteKey(discInfo.propertyName)}: '${discInfo.literalValue}' }`;
          return expanded;
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
    if (s.nullable === true && !SchemaMapper.nullableWarned) {
      // TODO: Replace with structured logging solution
      // oxlint-disable-next-line no-console
      console.warn(
        'Warning: \'nullable\' is deprecated in OpenAPI 3.1. Use \'type: ["string", "null"]\' instead.'
      );
      SchemaMapper.nullableWarned = true;
    }

    if (s.enum !== undefined && s.enum.length > 0) {
      let tsType = this.mapEnumValues(s.enum);
      if (s.nullable === true) {
        tsType = `${tsType} | null`;
      }
      return { tsType, imports: [] };
    }

    if (s.allOf !== undefined && s.allOf.length > 0) {
      const result = this.mapCombinator(s.allOf, '&', context, visited, indent);
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
        ? this.mapDiscriminatedUnion(s.oneOf, s.discriminator, context, visited, indent)
        : this.mapCombinator(s.oneOf, '|', context, visited, indent);
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
        ? this.mapDiscriminatedUnion(s.anyOf, s.discriminator, context, visited, indent)
        : this.mapCombinator(s.anyOf, '|', context, visited, indent);
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
        indent
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
        return this.mapObject(s, name, context, visited, indent);
      default:
        return { tsType: 'unknown', imports: [] };
    }
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
        if (typeof v === 'string') return `'${v}'`;
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
    indent: number
  ): TypeMappingResult {
    const results = schemas.map((s) => this.mapInternal(s, undefined, context, visited, indent));

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
    indent: number
  ): TypeMappingResult {
    const propertyName = discriminator.propertyName;
    const mapping = discriminator.mapping;

    const allImports: string[] = [];
    const parts: string[] = [];

    for (const schema of schemas) {
      const discriminantValue = this.resolveDiscriminantValue(schema, propertyName, mapping);
      const variantResult = this.mapInternal(schema, undefined, context, visited, indent);
      allImports.push(...variantResult.imports);

      const quotedProp = quoteKey(propertyName);
      parts.push(`({ ${quotedProp}: '${discriminantValue}' } & ${variantResult.tsType})`);
    }

    return { tsType: parts.join(' | '), imports: allImports };
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

    const itemResult = this.mapInternal(schema.items, undefined, context, visited, indent);
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
    indent: number
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
      const propResult = this.mapInternal(propSchema, undefined, context, visited, indent + 1);
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
        indent + 1
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
        tsType: `${result.tsType} | null`,
        imports: result.imports,
      };
    }
    return result;
  }
}
