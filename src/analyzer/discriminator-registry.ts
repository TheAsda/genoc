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
 * Field budget (D5): audited — every remaining field has a live consumer in
 * production (seam / Variant-union emission) or in the registry unit tests.
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
 * One discriminator variant target inside a family. Consumers: `propertyName`
 * → literal append + `Omit<M, quoteKey(P)>` key + union wrapper;
 * `literalValue` → the appended literal (pre-escaped — render as
 * `'${literalValue}'`); `isNamed` → bare-name vs inline-expansion decision;
 * `isUnion`/`isNullable` → spine `Omit` fallback decision (D2); `familyId` →
 * same-family spine detection (D1/D2); `refStr` → identity match at the
 * ref-translation seam; `typeName` → bare-name emission and the name index.
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
  /** The exact `$ref` string that produced this entry (mapping value, oneOf/anyOf member ref, canonical base ref, or implicit allOf child ref). */
  refStr: string;
  /** Rename-aware type name for the ref (same derivation as the mapper's `typeNameGenerator`). */
  typeName: string;
  /**
   * True for the family base's own entry — the base participates in its own
   * family union (self-mapped, or no `oneOf`/`anyOf` of its own). Consumers:
   * same-family-spine base-ref translation routes through the entry seam
   * (`Omit<Base, P>`), and the mapper skips the `{ P: string }` placeholder on
   * the base's own definition because the literal replaces it.
   */
  isBaseMember: boolean;
}

/**
 * One discriminator family: a component schema declaring `discriminator`
 * (`familyId` = its raw component name). Consumers: `baseRefStr` → base-ref
 * detection at the seam (D1: `$ref` to the base emits `variantUnionName`
 * outside same-family spines); `variantUnionName` / `variantUnionMembers` →
 * the always-emit `{Base}Variant` union (D6); `entriesByRef` → family
 * construction substrate and per-family lookups.
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
}

/**
 * The discriminator registry built once per `analyze()` run. Consumers:
 * `byRef`/`byName` for variant-target lookup at the ref-translation seam;
 * `baseRefs` for D1 base-ref translation; `families` for same-family spine
 * scoping (entry `familyId` → family) and the `{Base}Variant` union emission.
 * Flat lookups are first-wins across families (spec order) — ambiguous
 * cross-family targets stay reachable through their per-family maps.
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

  // Implicit allOf children (issue #93): a schema whose `allOf` references a
  // family base DIRECTLY is a variant of that family even when `mapping` and
  // the base's own oneOf/anyOf leave it out. Index childName → the set of
  // canonical `#/components/schemas/…` refs it allOfs, once, up front —
  // grandchildren (allOf a child, not the base) stay out by construction.
  const allOfBasesByChild = new Map<string, Set<string>>();
  for (const [childName, childSchema] of Object.entries(schemas)) {
    let childResolved: SchemaObject;
    try {
      childResolved = resolver.resolve<SchemaObject>(childSchema as SchemaObject | ReferenceObject);
    } catch {
      continue;
    }
    if (!childResolved.allOf) continue;
    const bases = new Set<string>();
    for (const member of childResolved.allOf) {
      if (!isRefObject(member) || !member.$ref.startsWith('#/components/schemas/')) continue;
      bases.add(`#/components/schemas/${encodePointerSegment(rawRefSegment(member.$ref))}`);
    }
    if (bases.size > 0) allOfBasesByChild.set(childName, bases);
  }

  // Pass 1 — discover families; per family, register the base's own entry
  // when it joins its family (self-mapped, or no oneOf/anyOf of its own),
  // then mapping entries (D3: mapping key wins), then implicit oneOf/anyOf
  // variants absent from the mapping (literal = own const > single-value
  // enum > RAW ref segment), then implicit allOf children absent from both.
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
    };

    // Base membership (#93): a CONCRETE base (no oneOf/anyOf of its own) is a
    // variant of its own family even when `mapping` omits it — with no other
    // members the family would otherwise reference an empty union. A base
    // listed in its own mapping joins too (its key wins the literal, D3).
    // Insertion order matters: the base entry lands FIRST so union members
    // read `{Base} | <mapped…> | <implicit…>`.
    const baseHasOwnUnion = (resolved.oneOf?.length ?? 0) > 0 || (resolved.anyOf?.length ?? 0) > 0;
    const selfMappingKey = disc.mapping
      ? Object.entries(disc.mapping).find(([, refStr]) => refStr === family.baseRefStr)?.[0]
      : undefined;
    if (selfMappingKey !== undefined || !baseHasOwnUnion) {
      const ownBaseLiteral = resolveOwnDiscriminatorLiteral(resolved, disc.propertyName, resolver);
      if (
        selfMappingKey !== undefined &&
        ownBaseLiteral !== undefined &&
        ownBaseLiteral.value !== selfMappingKey
      ) {
        warn(
          `Warning: Discriminator mapping key "${selfMappingKey}" for "${family.baseRefStr}" conflicts with its own declared ${ownBaseLiteral.source} literal "${ownBaseLiteral.value}"; the mapping key wins.\n`
        );
      }
      family.entriesByRef.set(family.baseRefStr, {
        propertyName: disc.propertyName,
        // Base literal precedence: self-mapping key > own const/enum > raw
        // component name (the runtime value, NOT the sanitized type name).
        literalValue: escapeStringLiteral(selfMappingKey ?? ownBaseLiteral?.value ?? name),
        isNamed: true, // the base is by definition an emitted component schema
        isUnion: baseHasOwnUnion,
        isNullable:
          resolved.nullable === true ||
          (Array.isArray(resolved.type) ? resolved.type.includes('null') : false),
        isBaseMember: true,
        familyId,
        refStr: family.baseRefStr,
        typeName: family.baseTypeName,
      });
    }

    const mappedRefStrs = new Set<string>();
    if (disc.mapping) {
      for (const [mappingKey, refStr] of Object.entries(disc.mapping)) {
        if (mappedRefStrs.has(refStr)) continue; // two keys → same target: first key wins
        mappedRefStrs.add(refStr);
        if (family.entriesByRef.has(refStr)) continue; // base self-mapping — the base entry already carries it
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
          isBaseMember: false,
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
      if (mappedRefStrs.has(refStr) || family.entriesByRef.has(refStr)) continue; // already registered
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
        isBaseMember: false,
        familyId,
        refStr,
        typeName: renameAwareTypeName(renameMap, rawSegment),
      };
      family.entriesByRef.set(refStr, entry);
    }

    // Implicit allOf children (#93): direct `allOf` refs to the base count as
    // variants even when `mapping` leaves them out; anything already present
    // (mapping target, implicit oneOf/anyOf ref, the base itself) is skipped,
    // so children land in component order after the mapped/implicit members.
    for (const [childName, bases] of allOfBasesByChild) {
      if (!bases.has(family.baseRefStr)) continue;
      const childRefStr = `#/components/schemas/${encodePointerSegment(childName)}`;
      if (family.entriesByRef.has(childRefStr)) continue;
      const target = resolveTargetSchema(resolver, childRefStr);
      const own = resolveOwnDiscriminatorLiteral(target, disc.propertyName, resolver);
      const entry: DiscriminatorVariantEntry = {
        propertyName: disc.propertyName,
        // Same D3 fallback chain as unmapped oneOf/anyOf variants.
        literalValue: escapeStringLiteral(own?.value ?? childName),
        isNamed: allSchemaNames.has(renameAwareTypeName(renameMap, childName)),
        isUnion: (target?.oneOf?.length ?? 0) > 0 || (target?.anyOf?.length ?? 0) > 0,
        isNullable:
          target?.nullable === true ||
          (Array.isArray(target?.type) ? target.type.includes('null') : false),
        isBaseMember: false,
        familyId,
        refStr: childRefStr,
        typeName: renameAwareTypeName(renameMap, childName),
      };
      family.entriesByRef.set(childRefStr, entry);
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
