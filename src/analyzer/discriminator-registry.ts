import type { RefResolver } from '../parser/ref-resolver.js';
import type { ReferenceObject, SchemaObject } from '../types/openapi.js';
import { buildSchemaRenameMap, sanitizeTypeName } from '../utils/generator-helpers.js';
import { RESERVED_TYPE_NAMES } from '../utils/operation-naming.js';
import { escapeStringLiteral } from '../utils/string.js';
import { parseJsonPointer } from '../utils/url.js';

/**
 * Family-aware discriminator registry (plan D5) — the single knowledge source
 * for discriminator families the mapper seam will translate through:
 *
 * - One record per discriminator family (a component schema declaring
 *   `discriminator`), keyed by `familyId` (the base's raw component name).
 * - Variant entries keyed by the FULL `$ref` string (mapping values are exact
 *   ref strings) plus a derived rename-aware name index.
 * - Literals are stored PRE-ESCAPED (D8: `'` and `\` only) so the mapper never
 *   interpolates raw values into string literals.
 * - Implicit variants (oneOf/anyOf `$ref` members absent from `mapping`) carry
 *   the RAW last ref segment as their literal (D3 precedence: mapping key >
 *   own `const` > single-value `enum` > raw segment).
 *
 * Field budget (D5): every field below has a planned consumer in the seam
 * rewrite / Variant-union emission; fields left unconsumed get deleted there.
 * Rename-aware keying is mandatory: the name index goes through the same
 * `buildSchemaRenameMap` machinery `analyze()` uses (see the past-bug note at
 * schema-mapper.ts:75–78 — raw-name keying silently drops literal injection
 * for renamed subtypes).
 */

/** Rename-aware type-name derivation — the exact expression `analyze()` wires
 * into the mapper's `typeNameGenerator` (`renameMap.get(raw) ?? sanitized`).
 * Single source of truth so registry name keys can never diverge from the
 * names the mapper emits for the same `$ref`.
 */
export function renameAwareTypeName(renameMap: Map<string, string>, rawName: string): string {
  return renameMap.get(rawName) ?? sanitizeTypeName(rawName);
}

function isRefObject(obj: unknown): obj is ReferenceObject {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    !Array.isArray(obj) &&
    '$ref' in (obj as Record<string, unknown>)
  );
}

/** Decode the last segment of a `$ref` string into its raw component key (`~1`/`~0` unescaped). */
function rawRefSegment(refStr: string): string {
  const segments = refStr.startsWith('#') ? parseJsonPointer(refStr.slice(1)) : refStr.split('/');
  return segments[segments.length - 1] ?? refStr;
}

/** Encode a component key for embedding in a `#/components/schemas/…` ref string. */
function encodePointerSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

/**
 * A discriminator variant's own declared literal on the discriminator
 * property: `const` first, then a single-value `enum` (D3 steps 2–3).
 * Returns the string form; multi-value enums and absent props yield nothing.
 */
function resolveOwnDiscriminatorLiteral(
  resolved: SchemaObject | undefined,
  propertyName: string,
  resolver: RefResolver
): { value: string; source: 'const' | 'enum' } | undefined {
  if (!resolved) return undefined;
  let prop = resolved.properties?.[propertyName];
  if (prop === undefined) return undefined;
  if (isRefObject(prop)) {
    try {
      prop = resolver.resolveSchema(prop);
    } catch {
      return undefined;
    }
  }
  if (prop.const !== undefined) return { value: String(prop.const), source: 'const' };
  if (prop.enum !== undefined && prop.enum.length === 1) {
    return { value: String(prop.enum[0]), source: 'enum' };
  }
  return undefined;
}

/**
 * One discriminator variant target inside a family. Consumers (Task 3 seam /
 * Task 4 emission): `propertyName` → literal append + `Omit<M, quoteKey(P)>`
 * key + union wrapper; `literalValue` → the appended literal (pre-escaped —
 * render as `'${literalValue}'`); `isNamed` → bare-name vs inline-expansion
 * decision; `isUnion`/`isNullable` → spine `Omit` fallback decision (D2);
 * `familyId` → same-family spine detection (D1/D2); `refStr` → identity match
 * at the ref-translation seam; `typeName` → bare-name emission and the name
 * index.
 */
export interface DiscriminatorVariantEntry {
  /** Discriminator property name declared by the family base (e.g. `'$type'`). */
  propertyName: string;
  /** Pre-escaped literal (D8) — the mapping key, own const/enum value, or raw ref segment. No surrounding quotes. */
  literalValue: string;
  /** The rename-aware derived name is an emitted component schema (`∈ allSchemaNames`). */
  isNamed: boolean;
  /** The target's own resolved schema declares `oneOf`/`anyOf` (spine `Omit` would drop variant props — D2 fallback). */
  isUnion: boolean;
  /** The target's own resolved schema is nullable (3.0 `nullable: true` or a 3.1 type array containing `'null'`). */
  isNullable: boolean;
  /** Owning family id — the discriminator base's raw component name. */
  familyId: string;
  /** The exact `$ref` string that produced this entry (mapping value or oneOf/anyOf member ref). */
  refStr: string;
  /** Rename-aware type name for the ref (same derivation as the mapper's `typeNameGenerator`). */
  typeName: string;
}

/**
 * One discriminator family: a component schema declaring `discriminator`
 * (`familyId` = its raw component name). Consumers (Task 3/4):
 * `baseRefStr` → base-ref detection at the seam (D1: `$ref` to the base
 * emits `variantUnionName` outside same-family spines); `variantUnionName` /
 * `variantUnionMembers` → the always-emit `{Base}Variant` union (D6);
 * `entriesByRef` / `entriesByName` → family-scoped lookups.
 */
export interface DiscriminatorFamily {
  /** Raw component name of the discriminator base — the family id. */
  familyId: string;
  /** Rename-aware emitted type name of the base. */
  baseTypeName: string;
  /** Canonical ref of the base component (`#/components/schemas/<encoded key>`). */
  baseRefStr: string;
  /** Discriminator property name (`discriminator.propertyName`). */
  propertyName: string;
  /** Collision-safe `{Base}Variant` union name (D6 — via the reserved-name machinery). */
  variantUnionName: string;
  /** Union member type names (rename-aware, deduped; mapping order, then unmapped oneOf/anyOf refs). */
  variantUnionMembers: string[];
  /** Family entries keyed by the FULL `$ref` string (mapping value or oneOf/anyOf member ref). */
  entriesByRef: Map<string, DiscriminatorVariantEntry>;
  /** Derived rename-aware name index (typeName → entry). */
  entriesByName: Map<string, DiscriminatorVariantEntry>;
}

/**
 * The discriminator registry built once per `analyze()` run. Consumers
 * (Task 3 seam): `byRef`/`byName` for variant-target lookup at the
 * ref-translation seam; `baseRefs` for D1 base-ref translation; `families`
 * for same-family spine scoping (entry `familyId` → family). Flat lookups
 * are first-wins across families (spec order) — ambiguous cross-family
 * targets stay reachable through their per-family maps.
 */
export interface DiscriminatorRegistry {
  /** Families keyed by familyId (raw base component name), in spec order. */
  families: Map<string, DiscriminatorFamily>;
  /** Flat lookup: full refStr → entry (first-wins across families). */
  byRef: Map<string, DiscriminatorVariantEntry>;
  /** Flat lookup: rename-aware type name → entry (first-wins across families). */
  byName: Map<string, DiscriminatorVariantEntry>;
  /** Canonical base refStr → family, for D1 base-ref translation. */
  baseRefs: Map<string, DiscriminatorFamily>;
}

/** Resolve a mapping/oneOf ref target for flag facts; unresolvable refs degrade to undefined (mapper-style try/catch). */
function resolveTargetSchema(resolver: RefResolver, refStr: string): SchemaObject | undefined {
  try {
    return resolver.resolveSchema({ $ref: refStr });
  } catch {
    return undefined;
  }
}

/**
 * Build the family-aware discriminator registry from the component schemas.
 *
 * Inputs must be the SAME `renameMap` / `allSchemaNames` `analyze()` derives
 * (the rename-aware keying discipline) — pass `buildSchemaRenameMap`'s output
 * and the emitted-name set, never a parallel sanitization. Pure with respect
 * to the document: no mutation of the schemas; warnings (D3 mapping-key
 * conflicts) go to `warnSink`.
 */
export function buildDiscriminatorRegistry(
  schemas: Record<string, SchemaObject> | undefined,
  resolver: RefResolver,
  renameMap: Map<string, string>,
  allSchemaNames: ReadonlySet<string>,
  warnSink?: (message: string) => void
): DiscriminatorRegistry {
  const warn =
    warnSink ??
    ((message: string) => {
      process.stderr.write(message);
    });

  const registry: DiscriminatorRegistry = {
    families: new Map(),
    byRef: new Map(),
    byName: new Map(),
    baseRefs: new Map(),
  };
  if (!schemas) return registry;

  // Pass 1 — discover families; per family, register mapping entries first
  // (D3: mapping key wins), then implicit oneOf/anyOf variants absent from
  // the mapping (literal = own const > single-value enum > RAW ref segment).
  for (const [name, schema] of Object.entries(schemas)) {
    const resolved = resolver.resolve<SchemaObject>(schema as SchemaObject | ReferenceObject);
    const disc = resolved.discriminator;
    if (!disc) continue;

    const familyId = name;
    const family: DiscriminatorFamily = {
      familyId,
      baseTypeName: renameAwareTypeName(renameMap, name),
      baseRefStr: `#/components/schemas/${encodePointerSegment(name)}`,
      propertyName: disc.propertyName,
      variantUnionName: '',
      variantUnionMembers: [],
      entriesByRef: new Map(),
      entriesByName: new Map(),
    };

    const mappedRefStrs = new Set<string>();
    if (disc.mapping) {
      for (const [mappingKey, refStr] of Object.entries(disc.mapping)) {
        if (mappedRefStrs.has(refStr)) continue; // two keys → same target: first key wins
        mappedRefStrs.add(refStr);
        const target = resolveTargetSchema(resolver, refStr);
        const own = resolveOwnDiscriminatorLiteral(target, disc.propertyName, resolver);
        if (own !== undefined && own.value !== mappingKey) {
          warn(
            `Warning: Discriminator mapping key "${mappingKey}" for "${refStr}" conflicts with its own declared ${own.source} literal "${own.value}"; the mapping key wins.\n`
          );
        }
        const rawSegment = rawRefSegment(refStr);
        const entry: DiscriminatorVariantEntry = {
          propertyName: disc.propertyName,
          literalValue: escapeStringLiteral(mappingKey),
          isNamed: allSchemaNames.has(renameAwareTypeName(renameMap, rawSegment)),
          isUnion: (target?.oneOf?.length ?? 0) > 0 || (target?.anyOf?.length ?? 0) > 0,
          isNullable:
            target?.nullable === true ||
            (Array.isArray(target?.type) ? target.type.includes('null') : false),
          familyId,
          refStr,
          typeName: renameAwareTypeName(renameMap, rawSegment),
        };
        family.entriesByRef.set(refStr, entry);
      }
    }

    const implicitRefs: string[] = [];
    for (const member of [...(resolved.oneOf ?? []), ...(resolved.anyOf ?? [])]) {
      if (isRefObject(member)) implicitRefs.push(member.$ref);
    }
    for (const refStr of implicitRefs) {
      if (mappedRefStrs.has(refStr)) continue; // already registered via mapping
      const target = resolveTargetSchema(resolver, refStr);
      const own = resolveOwnDiscriminatorLiteral(target, disc.propertyName, resolver);
      const rawSegment = rawRefSegment(refStr);
      const entry: DiscriminatorVariantEntry = {
        propertyName: disc.propertyName,
        // D3 fallback chain for unmapped variants: own const > single-value
        // enum > RAW last ref segment (the runtime value, NOT the sanitized
        // type name).
        literalValue: escapeStringLiteral(own?.value ?? rawSegment),
        isNamed: allSchemaNames.has(renameAwareTypeName(renameMap, rawSegment)),
        isUnion: (target?.oneOf?.length ?? 0) > 0 || (target?.anyOf?.length ?? 0) > 0,
        isNullable:
          target?.nullable === true ||
          (Array.isArray(target?.type) ? target.type.includes('null') : false),
        familyId,
        refStr,
        typeName: renameAwareTypeName(renameMap, rawSegment),
      };
      family.entriesByRef.set(refStr, entry);
    }

    registry.families.set(familyId, family);
  }

  // Pass 2 — flat lookups + per-family name index + union members
  // (mapping order, then unmapped oneOf/anyOf refs; deduped by refStr and
  // by typeName — alias refs to one emitted name collapse).
  for (const family of registry.families.values()) {
    const memberNames: string[] = [];
    const seenNames = new Set<string>();
    for (const [refStr, entry] of family.entriesByRef) {
      if (!registry.byRef.has(refStr)) registry.byRef.set(refStr, entry);
      if (!family.entriesByName.has(entry.typeName))
        family.entriesByName.set(entry.typeName, entry);
      if (!registry.byName.has(entry.typeName)) registry.byName.set(entry.typeName, entry);
      if (!seenNames.has(entry.typeName)) {
        seenNames.add(entry.typeName);
        memberNames.push(entry.typeName);
      }
    }
    family.variantUnionMembers = memberNames;
    registry.baseRefs.set(family.baseRefStr, family);
  }

  // Pass 3 — collision-safe `{Base}Variant` union names (D6): candidates go
  // through the SAME reserved-name machinery as schemas, seeded with every
  // emitted schema name, so a user schema literally named `ThingVariant`
  // forces the generated union to `ThingVariantModel` (no duplicate export).
  const unionCandidates = [...registry.families.values()].map((f) => `${f.baseTypeName}Variant`);
  const unionRenames = buildSchemaRenameMap(
    unionCandidates,
    new Set([...RESERVED_TYPE_NAMES, ...allSchemaNames])
  );
  for (const family of registry.families.values()) {
    const candidate = `${family.baseTypeName}Variant`;
    family.variantUnionName = unionRenames.get(candidate) ?? candidate;
  }

  return registry;
}
