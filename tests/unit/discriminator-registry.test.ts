import { describe, expect, it, vi } from 'vitest';

import {
  buildDiscriminatorRegistry,
  type DiscriminatorRegistry,
} from '../../src/analyzer/discriminator-registry.js';
import { RefResolver } from '../../src/parser/ref-resolver.js';
import type { OpenAPIDocument, SchemaObject } from '../../src/types/openapi.js';
import { buildSchemaRenameMap, sanitizeTypeName } from '../../src/utils/generator-helpers.js';
import { RESERVED_TYPE_NAMES } from '../../src/utils/operation-naming.js';

/**
 * Mirror of analyze()'s exact registry wiring: same buildSchemaRenameMap
 * inputs, same allSchemaNames derivation. Tests must never construct a
 * parallel rename path — that is the documented past-bug discipline
 * (schema-mapper.ts:75–78).
 */
function buildRegistry(
  schemas: Record<string, SchemaObject>,
  warnSink: (message: string) => void = () => {}
): DiscriminatorRegistry {
  const doc: OpenAPIDocument = {
    openapi: '3.1.0',
    info: { title: 'Registry Test', version: '1.0.0' },
    components: { schemas },
  };
  const resolver = new RefResolver(doc);
  const names = Object.keys(schemas);
  const renameMap = buildSchemaRenameMap(names, RESERVED_TYPE_NAMES);
  const allSchemaNames = new Set(names.map((n) => renameMap.get(n) ?? sanitizeTypeName(n)));
  return buildDiscriminatorRegistry(schemas, resolver, renameMap, allSchemaNames, warnSink);
}

const objectSchema = (properties: Record<string, SchemaObject> = {}): SchemaObject => ({
  type: 'object',
  properties,
});

describe('discriminator registry', () => {
  describe('family grouping', () => {
    it('keeps two families in one spec separate, each entry carrying its familyId', () => {
      const registry = buildRegistry({
        BasePet: {
          ...objectSchema(),
          discriminator: {
            propertyName: '$type',
            mapping: { Cat: '#/components/schemas/Cat' },
          },
        },
        Cat: objectSchema({ meow: { type: 'string' } }),
        BaseArtifact: {
          ...objectSchema(),
          discriminator: {
            propertyName: 'kind',
            mapping: { Bulletin: '#/components/schemas/BulletinArtifact' },
          },
        },
        BulletinArtifact: objectSchema({ title: { type: 'string' } }),
      });

      expect(registry.families.size).toBe(2);

      const petFamily = registry.families.get('BasePet');
      const artifactFamily = registry.families.get('BaseArtifact');
      expect(petFamily?.propertyName).toBe('$type');
      expect(artifactFamily?.propertyName).toBe('kind');

      const cat = petFamily?.entriesByRef.get('#/components/schemas/Cat');
      const bulletin = artifactFamily?.entriesByRef.get('#/components/schemas/BulletinArtifact');
      expect(cat?.familyId).toBe('BasePet');
      expect(bulletin?.familyId).toBe('BaseArtifact');
      expect(cat?.propertyName).toBe('$type');
      expect(bulletin?.propertyName).toBe('kind');
    });

    it('exposes the base through baseRefs keyed by canonical refStr', () => {
      const registry = buildRegistry({
        Pet: {
          ...objectSchema(),
          discriminator: { propertyName: 'type', mapping: {} },
        },
      });

      const family = registry.baseRefs.get('#/components/schemas/Pet');
      expect(family?.familyId).toBe('Pet');
      expect(family?.baseTypeName).toBe('Pet');
      expect(family?.variantUnionName).toBe('PetVariant');
    });

    it('returns an empty registry when no schema declares a discriminator', () => {
      const registry = buildRegistry({
        User: objectSchema({ id: { type: 'string' } }),
        Audit: objectSchema({ at: { type: 'string' } }),
      });

      expect(registry.families.size).toBe(0);
      expect(registry.byRef.size).toBe(0);
      expect(registry.byName.size).toBe(0);
      expect(registry.baseRefs.size).toBe(0);
    });
  });

  describe('refStr and rename-aware name lookup', () => {
    it('resolves entries by full refStr and by plain renamed name', () => {
      const registry = buildRegistry({
        BaseThing: {
          ...objectSchema(),
          discriminator: {
            propertyName: '$type',
            mapping: { Full: '#/components/schemas/UpdateThing' },
          },
        },
        UpdateThing: objectSchema({ name: { type: 'string' } }),
      });

      const byRef = registry.byRef.get('#/components/schemas/UpdateThing');
      const byName = registry.byName.get('UpdateThing');
      expect(byRef).toBeDefined();
      expect(byName).toBe(byRef);
      expect(byRef?.literalValue).toBe('Full');
      expect(byRef?.typeName).toBe('UpdateThing');
    });

    it('keys the name index by renamed names when sanitized schema names collide', () => {
      // "User-Dto" and "User[Dto]" both sanitize to "UserDto"; the rename
      // machinery gives the second one "UserDtoModel". The name index must
      // resolve BOTH through their final emitted names.
      const registry = buildRegistry({
        'User-Dto': objectSchema({ a: { type: 'string' } }),
        'User[Dto]': objectSchema({ b: { type: 'string' } }),
        BaseUser: {
          ...objectSchema(),
          discriminator: {
            propertyName: 'role',
            mapping: {
              Dash: '#/components/schemas/User-Dto',
              Bracket: '#/components/schemas/User[Dto]',
            },
          },
        },
      });

      const family = registry.families.get('BaseUser');
      const dash = family?.entriesByRef.get('#/components/schemas/User-Dto');
      const bracket = family?.entriesByRef.get('#/components/schemas/User[Dto]');

      expect(dash?.typeName).toBe('UserDto');
      expect(bracket?.typeName).toBe('UserDtoModel');
      expect(registry.byName.get('UserDto')).toBe(dash);
      expect(registry.byName.get('UserDtoModel')).toBe(bracket);
    });
  });

  describe('implicit variants (oneOf/anyOf without mapping)', () => {
    it('registers unmapped oneOf $ref members with the RAW last ref segment as literal', () => {
      const registry = buildRegistry({
        Shape: {
          oneOf: [
            { $ref: '#/components/schemas/my-variant' },
            { $ref: '#/components/schemas/plain' },
          ],
          discriminator: { propertyName: 'shape' },
        },
        'my-variant': objectSchema({ x: { type: 'number' } }),
        plain: objectSchema({ y: { type: 'number' } }),
      });

      const family = registry.families.get('Shape');
      const implicit = family?.entriesByRef.get('#/components/schemas/my-variant');
      expect(implicit?.literalValue).toBe('my-variant'); // raw, NOT "MyVariant"
      expect(implicit?.typeName).toBe('MyVariant'); // type name still sanitized
      expect(implicit?.isNamed).toBe(true);
      expect(family?.variantUnionMembers).toEqual(['MyVariant', 'plain']);
    });

    it('prefers own const over the raw segment (D3: mapping > const > enum > raw)', () => {
      const registry = buildRegistry({
        Shape: {
          oneOf: [{ $ref: '#/components/schemas/Cat' }],
          discriminator: { propertyName: 'shape' },
        },
        Cat: objectSchema({ shape: { const: 'kitty' } }),
      });

      const cat = registry.families.get('Shape')?.entriesByRef.get('#/components/schemas/Cat');
      expect(cat?.literalValue).toBe('kitty');
    });

    it('prefers a single-value enum over the raw segment', () => {
      const registry = buildRegistry({
        Shape: {
          oneOf: [{ $ref: '#/components/schemas/Dog' }],
          discriminator: { propertyName: 'shape' },
        },
        Dog: objectSchema({ shape: { type: 'string', enum: ['hound'] } }),
      });

      const dog = registry.families.get('Shape')?.entriesByRef.get('#/components/schemas/Dog');
      expect(dog?.literalValue).toBe('hound');
    });

    it('ignores multi-value enums and falls back to the raw segment', () => {
      const registry = buildRegistry({
        Shape: {
          oneOf: [{ $ref: '#/components/schemas/Bird' }],
          discriminator: { propertyName: 'shape' },
        },
        Bird: objectSchema({ shape: { type: 'string', enum: ['hawk', 'dove'] } }),
      });

      const bird = registry.families.get('Shape')?.entriesByRef.get('#/components/schemas/Bird');
      expect(bird?.literalValue).toBe('Bird');
    });

    it('treats anyOf $ref members as implicit variants too', () => {
      const registry = buildRegistry({
        Result: {
          anyOf: [{ $ref: '#/components/schemas/Ok' }, { $ref: '#/components/schemas/Err' }],
          discriminator: { propertyName: 'status' },
        },
        Ok: objectSchema(),
        Err: objectSchema(),
      });

      const family = registry.families.get('Result');
      expect(family?.entriesByRef.size).toBe(2);
      expect(family?.variantUnionMembers).toEqual(['Ok', 'Err']);
    });

    it('does not re-register a oneOf member already covered by the mapping', () => {
      const registry = buildRegistry({
        Shape: {
          oneOf: [{ $ref: '#/components/schemas/Circle' }],
          discriminator: {
            propertyName: 'shape',
            mapping: { Round: '#/components/schemas/Circle' },
          },
        },
        Circle: objectSchema({ r: { type: 'number' } }),
      });

      const circle = registry.families
        .get('Shape')
        ?.entriesByRef.get('#/components/schemas/Circle');
      expect(circle?.literalValue).toBe('Round'); // mapping key wins over raw segment
      expect(registry.families.get('Shape')?.entriesByRef.size).toBe(1);
    });
  });

  describe('literal escaping (D8)', () => {
    it('stores mapping keys with quotes and backslashes pre-escaped', () => {
      const registry = buildRegistry({
        Base: {
          ...objectSchema(),
          discriminator: {
            propertyName: 'kind',
            mapping: {
              "it's": '#/components/schemas/Quoted',
              'back\\slash': '#/components/schemas/Slashed',
              '3': '#/components/schemas/Numberish',
            },
          },
        },
        Quoted: objectSchema(),
        Slashed: objectSchema(),
        Numberish: objectSchema(),
      });

      const family = registry.families.get('Base');
      expect(family?.entriesByRef.get('#/components/schemas/Quoted')?.literalValue).toBe("it\\'s");
      expect(family?.entriesByRef.get('#/components/schemas/Slashed')?.literalValue).toBe(
        'back\\\\slash'
      );
      expect(family?.entriesByRef.get('#/components/schemas/Numberish')?.literalValue).toBe('3');
    });

    it('escapes own-const literals of implicit variants', () => {
      const registry = buildRegistry({
        Shape: {
          oneOf: [{ $ref: '#/components/schemas/Odd' }],
          discriminator: { propertyName: 'shape' },
        },
        Odd: objectSchema({ shape: { const: "wei'rd" } }),
      });

      const odd = registry.families.get('Shape')?.entriesByRef.get('#/components/schemas/Odd');
      expect(odd?.literalValue).toBe("wei\\'rd");
    });
  });

  describe('mapping-key conflict warning (D3)', () => {
    it('keeps the mapping key and warns when the target declares a conflicting own literal', () => {
      const warnSink = vi.fn();
      const registry = buildRegistry(
        {
          Base: {
            ...objectSchema(),
            discriminator: {
              propertyName: 'kind',
              mapping: { Full: '#/components/schemas/Thing' },
            },
          },
          Thing: objectSchema({ kind: { const: 'wrong-literal' } }),
        },
        warnSink
      );

      const thing = registry.families.get('Base')?.entriesByRef.get('#/components/schemas/Thing');
      expect(thing?.literalValue).toBe('Full');
      expect(warnSink).toHaveBeenCalledTimes(1);
      expect(warnSink.mock.calls[0][0]).toContain('"Full"');
      expect(warnSink.mock.calls[0][0]).toContain('"wrong-literal"');
    });

    it('does not warn when the own literal matches the mapping key', () => {
      const warnSink = vi.fn();
      const registry = buildRegistry(
        {
          Base: {
            ...objectSchema(),
            discriminator: {
              propertyName: 'kind',
              mapping: { Full: '#/components/schemas/Thing' },
            },
          },
          Thing: objectSchema({ kind: { const: 'Full' } }),
        },
        warnSink
      );

      const thing = registry.families.get('Base')?.entriesByRef.get('#/components/schemas/Thing');
      expect(thing?.literalValue).toBe('Full');
      expect(warnSink).not.toHaveBeenCalled();
    });
  });

  describe('variant union naming (D6)', () => {
    it('renames the {Base}Variant union when a user schema already owns that name', () => {
      const registry = buildRegistry({
        Thing: {
          ...objectSchema(),
          discriminator: {
            propertyName: '$type',
            mapping: { Full: '#/components/schemas/UpdateThing' },
          },
        },
        UpdateThing: objectSchema(),
        ThingVariant: objectSchema({ owned: { type: 'boolean' } }), // user schema, collides
      });

      const family = registry.families.get('Thing');
      expect(family?.variantUnionName).toBe('ThingVariantModel');
      expect(family?.variantUnionMembers).toEqual(['UpdateThing']);
    });

    it('keeps the plain {Base}Variant name when no collision exists', () => {
      const registry = buildRegistry({
        Pet: {
          ...objectSchema(),
          discriminator: {
            propertyName: 'type',
            mapping: { Cat: '#/components/schemas/Cat', Dog: '#/components/schemas/Dog' },
          },
        },
        Cat: objectSchema(),
        Dog: objectSchema(),
      });

      expect(registry.families.get('Pet')?.variantUnionName).toBe('PetVariant');
    });

    it('dedupes union members when mapping values and oneOf refs overlap', () => {
      const registry = buildRegistry({
        Shape: {
          oneOf: [{ $ref: '#/components/schemas/Circle' }, { $ref: '#/components/schemas/Square' }],
          discriminator: {
            propertyName: 'shape',
            mapping: { Round: '#/components/schemas/Circle' },
          },
        },
        Circle: objectSchema(),
        Square: objectSchema(),
      });

      expect(registry.families.get('Shape')?.variantUnionMembers).toEqual(['Circle', 'Square']);
    });
  });

  describe('entry flags', () => {
    it('marks entries isNamed only when the derived name is an emitted schema', () => {
      const registry = buildRegistry({
        Base: {
          ...objectSchema(),
          discriminator: {
            propertyName: 'kind',
            mapping: {
              Known: '#/components/schemas/Known',
              Ghost: '#/components/schemas/Ghost', // not in components
            },
          },
        },
        Known: objectSchema(),
      });

      const known = registry.families.get('Base')?.entriesByRef.get('#/components/schemas/Known');
      const ghost = registry.families.get('Base')?.entriesByRef.get('#/components/schemas/Ghost');
      expect(known?.isNamed).toBe(true);
      expect(ghost?.isNamed).toBe(false);
      expect(ghost?.isUnion).toBe(false); // unresolvable → flags degrade to false
      expect(ghost?.isNullable).toBe(false);
    });

    it('sets isUnion when the target itself declares oneOf or anyOf', () => {
      const registry = buildRegistry({
        Base: {
          ...objectSchema(),
          discriminator: {
            propertyName: 'kind',
            mapping: {
              Multi: '#/components/schemas/Multi',
              Alt: '#/components/schemas/Alt',
              Plain: '#/components/schemas/Plain',
            },
          },
        },
        Multi: {
          oneOf: [objectSchema({ a: { type: 'string' } }), objectSchema({ b: { type: 'string' } })],
        },
        Alt: {
          anyOf: [objectSchema({ c: { type: 'string' } })],
        },
        Plain: objectSchema(),
      });

      const family = registry.families.get('Base');
      expect(family?.entriesByRef.get('#/components/schemas/Multi')?.isUnion).toBe(true);
      expect(family?.entriesByRef.get('#/components/schemas/Alt')?.isUnion).toBe(true);
      expect(family?.entriesByRef.get('#/components/schemas/Plain')?.isUnion).toBe(false);
    });

    it('sets isNullable for 3.0 nullable targets and 3.1 null-bearing type arrays', () => {
      const registry = buildRegistry({
        Base: {
          ...objectSchema(),
          discriminator: {
            propertyName: 'kind',
            mapping: {
              Legacy: '#/components/schemas/Legacy',
              Modern: '#/components/schemas/Modern',
              Strict: '#/components/schemas/Strict',
            },
          },
        },
        Legacy: { ...objectSchema(), nullable: true },
        Modern: { type: ['object', 'null'], properties: {} },
        Strict: objectSchema(),
      });

      const family = registry.families.get('Base');
      expect(family?.entriesByRef.get('#/components/schemas/Legacy')?.isNullable).toBe(true);
      expect(family?.entriesByRef.get('#/components/schemas/Modern')?.isNullable).toBe(true);
      expect(family?.entriesByRef.get('#/components/schemas/Strict')?.isNullable).toBe(false);
    });
  });

  describe('base ref encoding', () => {
    it('JSON-pointer-encodes base names containing / and ~', () => {
      const registry = buildRegistry({
        'a/b': {
          ...objectSchema(),
          discriminator: { propertyName: 'kind' },
        },
      });

      const family = registry.families.get('a/b');
      expect(family?.baseRefStr).toBe('#/components/schemas/a~1b');
      expect(registry.baseRefs.get('#/components/schemas/a~1b')).toBe(family);
    });
  });
});
