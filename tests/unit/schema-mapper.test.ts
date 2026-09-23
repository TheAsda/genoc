import { describe, expect, it, vi } from 'vitest';

import { buildDiscriminatorRegistry } from '../../src/analyzer/discriminator-registry.js';
import { SchemaMapper } from '../../src/analyzer/schema-mapper.js';
import type { TypeNameGenerator } from '../../src/analyzer/schema-mapper.js';
import { RefResolver } from '../../src/parser/ref-resolver.js';
import type { OpenAPIDocument, SchemaObject } from '../../src/types/openapi.js';
import { buildSchemaRenameMap, sanitizeTypeName } from '../../src/utils/generator-helpers.js';
import { RESERVED_TYPE_NAMES } from '../../src/utils/operation-naming.js';

function createResolver(schemas?: Record<string, SchemaObject>): RefResolver {
  const doc: OpenAPIDocument = {
    openapi: '3.1.0',
    info: { title: 'Test', version: '1.0.0' },
    components: schemas ? { schemas } : undefined,
  };
  return new RefResolver(doc);
}

describe('SchemaMapper', () => {
  const resolver = createResolver();
  const mapper = new SchemaMapper(resolver);

  describe('primitive types', () => {
    it('maps { type: "string" } to "string"', () => {
      const result = mapper.mapSchema({ type: 'string' });
      expect(result.tsType).toBe('string');
      expect(result.imports).toEqual([]);
    });

    it('maps { type: "number" } to "number"', () => {
      const result = mapper.mapSchema({ type: 'number' });
      expect(result.tsType).toBe('number');
    });

    it('maps { type: "integer" } to "number"', () => {
      const result = mapper.mapSchema({ type: 'integer' });
      expect(result.tsType).toBe('number');
    });

    it('maps { type: "boolean" } to "boolean"', () => {
      const result = mapper.mapSchema({ type: 'boolean' });
      expect(result.tsType).toBe('boolean');
    });

    it('maps { type: "null" } to "null"', () => {
      const result = mapper.mapSchema({ type: 'null' });
      expect(result.tsType).toBe('null');
    });

    it('maps format: date-time to branded type DateTimeString', () => {
      const result = mapper.mapSchema({
        type: 'string',
        format: 'date-time',
      });
      expect(result.tsType).toBe('DateTimeString');
      expect(result.imports).toContain('DateTimeString');
    });
  });

  describe('enum types', () => {
    it('maps string enum to literal union', () => {
      const result = mapper.mapSchema({ enum: ['active', 'inactive'] });
      expect(result.tsType).toBe("'active' | 'inactive'");
    });

    it('maps numeric enum to literal union', () => {
      const result = mapper.mapSchema({ enum: [1, 2, 3] });
      expect(result.tsType).toBe('1 | 2 | 3');
    });

    it('maps mixed enum with null', () => {
      const result = mapper.mapSchema({ enum: ['a', null] });
      expect(result.tsType).toBe("'a' | null");
    });

    it('maps boolean enum', () => {
      const result = mapper.mapSchema({ enum: [true, false] });
      expect(result.tsType).toBe('true | false');
    });
  });

  describe('array types', () => {
    it('maps simple array to T[] syntax', () => {
      const result = mapper.mapSchema({
        type: 'array',
        items: { type: 'string' },
      });
      expect(result.tsType).toBe('string[]');
    });

    it('maps complex item types using Array<T>', () => {
      const result = mapper.mapSchema({
        type: 'array',
        items: {
          type: 'object',
          properties: { name: { type: 'string' } },
        },
      });
      expect(result.tsType).toBe('Array<{\n  name?: string;\n}>');
    });

    it('maps array without items to unknown[]', () => {
      const result = mapper.mapSchema({ type: 'array' });
      expect(result.tsType).toBe('unknown[]');
    });

    it('maps array of refs with imports', () => {
      const r = createResolver({
        User: { type: 'object', properties: { id: { type: 'string' } } },
      });
      const m = new SchemaMapper(r);
      const result = m.mapSchema({
        type: 'array',
        items: { $ref: '#/components/schemas/User' },
      });
      expect(result.tsType).toBe('User[]');
      expect(result.imports).toEqual(['User']);
    });
  });

  describe('object types', () => {
    it('maps anonymous object to inline type', () => {
      const result = mapper.mapSchema({
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'integer' },
        },
        required: ['name'],
      });
      expect(result.tsType).toBe('{\n  name: string;\n  age?: number;\n}');
      expect(result.imports).toEqual([]);
    });

    it('maps named object to interface definition', () => {
      const result = mapper.mapSchema(
        {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
          },
          required: ['id', 'name'],
        },
        'User'
      );
      expect(result.tsType).toBe('{\n  id: string;\n  name: string;\n}');
    });

    it('marks optional properties with ?', () => {
      const result = mapper.mapSchema({
        type: 'object',
        properties: {
          required_field: { type: 'string' },
          optional_field: { type: 'number' },
        },
        required: ['required_field'],
      });
      expect(result.tsType).toContain('required_field: string');
      expect(result.tsType).toContain('optional_field?: number');
    });

    it('quotes reserved-word property names', () => {
      const result = mapper.mapSchema({
        type: 'object',
        properties: {
          class: { type: 'string' },
          return: { type: 'number' },
          normalName: { type: 'boolean' },
        },
      });
      expect(result.tsType).toContain('"class"');
      expect(result.tsType).toContain('"return"');
      expect(result.tsType).toContain('normalName');
    });

    it('maps empty object without properties', () => {
      const result = mapper.mapSchema({ type: 'object' });
      expect(result.tsType).toBe('Record<string, unknown>');
    });
  });

  describe('$ref handling', () => {
    it('resolves $ref to type name and adds to imports', () => {
      const result = mapper.mapSchema({
        $ref: '#/components/schemas/User',
      });
      expect(result.tsType).toBe('User');
      expect(result.imports).toEqual(['User']);
    });

    it('uses custom typeNameGenerator when provided', () => {
      const customGen: TypeNameGenerator = (ref: string) => {
        const parts = ref.split('/');
        return `I${parts[parts.length - 1]}`;
      };
      const m = new SchemaMapper(resolver, { typeNameGenerator: customGen });
      const result = m.mapSchema({ $ref: '#/components/schemas/User' });
      expect(result.tsType).toBe('IUser');
      expect(result.imports).toEqual(['IUser']);
    });
  });

  describe('combinators', () => {
    it('maps allOf to intersection type', () => {
      const result = mapper.mapSchema({
        allOf: [
          { type: 'object', properties: { name: { type: 'string' } } },
          { type: 'object', properties: { age: { type: 'number' } } },
        ],
      });
      expect(result.tsType).toBe('{\n  name?: string;\n} & {\n  age?: number;\n}');
    });

    it('maps allOf with refs', () => {
      const r = createResolver({
        Base: { type: 'object', properties: { id: { type: 'string' } } },
      });
      const m = new SchemaMapper(r);
      const result = m.mapSchema({
        allOf: [
          { $ref: '#/components/schemas/Base' },
          { type: 'object', properties: { extra: { type: 'string' } } },
        ],
      });
      expect(result.tsType).toBe('Base & {\n  extra?: string;\n}');
      expect(result.imports).toEqual(['Base']);
    });

    it('maps oneOf to union type', () => {
      const result = mapper.mapSchema({
        oneOf: [{ type: 'string' }, { type: 'number' }],
      });
      expect(result.tsType).toBe('string | number');
    });

    it('maps anyOf to union type (same as oneOf)', () => {
      const result = mapper.mapSchema({
        anyOf: [{ type: 'string' }, { type: 'boolean' }],
      });
      expect(result.tsType).toBe('string | boolean');
    });

    it('wraps union parts in parens for intersection', () => {
      const result = mapper.mapSchema({
        allOf: [
          {
            oneOf: [{ type: 'string' }, { type: 'number' }],
          },
          { type: 'object', properties: { extra: { type: 'boolean' } } },
        ],
      });
      expect(result.tsType).toContain('(string | number) &');
    });
  });

  describe('nullable types', () => {
    it('maps type: ["string", "null"] to string | null', () => {
      const result = mapper.mapSchema({
        type: ['string', 'null'],
      } as SchemaObject);
      expect(result.tsType).toBe('string | null');
    });

    it('maps nullable: true to T | null', () => {
      const result = mapper.mapSchema({
        type: 'string',
        nullable: true,
      });
      expect(result.tsType).toBe('string | null');
    });

    it('handles nullable on objects', () => {
      const result = mapper.mapSchema({
        type: 'object',
        properties: { name: { type: 'string' } },
        nullable: true,
      });
      expect(result.tsType).toBe('{\n  name?: string;\n} | null');
    });

    it('handles nullable on arrays', () => {
      const result = mapper.mapSchema({
        type: 'array',
        items: { type: 'string' },
        nullable: true,
      });
      expect(result.tsType).toBe('string[] | null');
    });

    it('handles nullable on enum', () => {
      const result = mapper.mapSchema({
        enum: ['a', 'b'],
        nullable: true,
      });
      expect(result.tsType).toBe("'a' | 'b' | null");
    });
  });

  describe('empty and boolean schemas', () => {
    it('maps empty schema {} to unknown', () => {
      const result = mapper.mapSchema({});
      expect(result.tsType).toBe('unknown');
    });

    it('maps boolean true to unknown', () => {
      const result = mapper.mapSchema(true as unknown as SchemaObject);
      expect(result.tsType).toBe('unknown');
    });

    it('maps boolean false to never', () => {
      const result = mapper.mapSchema(false as unknown as SchemaObject);
      expect(result.tsType).toBe('never');
    });
  });

  describe('additionalProperties', () => {
    it('adds [key: string]: unknown when additionalProperties: true', () => {
      const result = mapper.mapSchema({
        type: 'object',
        properties: { name: { type: 'string' } },
        additionalProperties: true,
      });
      expect(result.tsType).toBe('{\n  name?: string;\n} & {\n  [key: string]: unknown;\n}');
    });

    it('omits index signature when additionalProperties: false', () => {
      const result = mapper.mapSchema({
        type: 'object',
        properties: { name: { type: 'string' } },
        additionalProperties: false,
      });
      expect(result.tsType).toBe('{\n  name?: string;\n}');
    });

    it('adds typed index signature for schema additionalProperties', () => {
      const result = mapper.mapSchema({
        type: 'object',
        additionalProperties: { type: 'string' },
      });
      expect(result.tsType).toBe('Record<string, string>');
    });

    it('uses Record<string, T> for anonymous with typed additionalProperties', () => {
      const result = mapper.mapSchema({
        type: 'object',
        additionalProperties: { type: 'number' },
      });
      expect(result.tsType).toBe('Record<string, number>');
    });

    it('uses interface with index sig for named with typed additionalProperties', () => {
      const result = mapper.mapSchema(
        {
          type: 'object',
          additionalProperties: { type: 'string' },
        },
        'StringMap'
      );
      expect(result.tsType).toBe('{\n  [key: string]: string;\n}');
    });

    it('uses Record<string, unknown> for anonymous additionalProperties: true without props', () => {
      const result = mapper.mapSchema({
        type: 'object',
        additionalProperties: true,
      });
      expect(result.tsType).toBe('Record<string, unknown>');
    });
  });

  describe('readOnly/writeOnly context', () => {
    const schema: SchemaObject = {
      type: 'object',
      properties: {
        id: { type: 'string', readOnly: true },
        name: { type: 'string' },
        password: { type: 'string', writeOnly: true },
      },
      required: ['id', 'name', 'password'],
    };

    it('includes all properties when no context', () => {
      const result = mapper.mapSchema(schema);
      expect(result.tsType).toContain('id:');
      expect(result.tsType).toContain('name:');
      expect(result.tsType).toContain('password:');
    });

    it('response context: includes readOnly, omits writeOnly', () => {
      const result = mapper.mapSchema(schema, undefined, 'response');
      expect(result.tsType).toContain('id:');
      expect(result.tsType).toContain('name:');
      expect(result.tsType).not.toContain('password:');
    });

    it('request context: includes writeOnly, omits readOnly', () => {
      const result = mapper.mapSchema(schema, undefined, 'request');
      expect(result.tsType).not.toContain('id:');
      expect(result.tsType).toContain('name:');
      expect(result.tsType).toContain('password:');
    });

    it('named interface with context filtering', () => {
      const result = mapper.mapSchema(schema, 'UserDTO', 'response');
      expect(result.tsType).toContain('id: string');
      expect(result.tsType).toContain('name: string');
      expect(result.tsType).not.toContain('password');
    });
  });

  describe('circular reference detection', () => {
    it('handles $ref-based circular schemas without infinite loop', () => {
      const nodeSchema: SchemaObject = {
        type: 'object',
        properties: {
          value: { type: 'string' },
          children: {
            type: 'array',
            items: { $ref: '#/components/schemas/Node' },
          },
        },
        required: ['value'],
      };

      const r = createResolver({ Node: nodeSchema });
      const m = new SchemaMapper(r);
      const result = m.mapSchema(nodeSchema, 'Node');

      expect(result.tsType).toBe('{\n  value: string;\n  children?: Node[];\n}');
      expect(result.imports).toEqual(['Node']);
    });
  });

  describe('discriminator', () => {
    it('oneOf with discriminator and explicit mapping produces discriminated union', () => {
      const r = createResolver({
        Cat: {
          type: 'object',
          properties: {
            petType: { type: 'string' },
            name: { type: 'string' },
          },
        },
        Dog: {
          type: 'object',
          properties: {
            petType: { type: 'string' },
            bark: { type: 'string' },
          },
        },
      });
      const m = new SchemaMapper(r);
      const result = m.mapSchema({
        oneOf: [{ $ref: '#/components/schemas/Cat' }, { $ref: '#/components/schemas/Dog' }],
        discriminator: {
          propertyName: 'petType',
          mapping: {
            Cat: '#/components/schemas/Cat',
            Dog: '#/components/schemas/Dog',
          },
        },
      });
      expect(result.tsType).toBe("({ petType: 'Cat' } & Cat) | ({ petType: 'Dog' } & Dog)");
      expect(result.imports).toEqual(['Cat', 'Dog']);
    });

    it('oneOf with discriminator without mapping infers from const', () => {
      const r = createResolver({
        Cat: {
          type: 'object',
          properties: {
            petType: { const: 'cat' },
            name: { type: 'string' },
          },
        },
        Dog: {
          type: 'object',
          properties: {
            petType: { const: 'dog' },
            bark: { type: 'string' },
          },
        },
      });
      const m = new SchemaMapper(r);
      const result = m.mapSchema({
        oneOf: [{ $ref: '#/components/schemas/Cat' }, { $ref: '#/components/schemas/Dog' }],
        discriminator: {
          propertyName: 'petType',
        },
      });
      expect(result.tsType).toBe("({ petType: 'cat' } & Cat) | ({ petType: 'dog' } & Dog)");
      expect(result.imports).toEqual(['Cat', 'Dog']);
    });

    it('oneOf without discriminator produces plain union (unchanged)', () => {
      const r = createResolver({
        Cat: { type: 'object', properties: { name: { type: 'string' } } },
        Dog: { type: 'object', properties: { bark: { type: 'string' } } },
      });
      const m = new SchemaMapper(r);
      const result = m.mapSchema({
        oneOf: [{ $ref: '#/components/schemas/Cat' }, { $ref: '#/components/schemas/Dog' }],
      });
      expect(result.tsType).toBe('Cat | Dog');
      expect(result.imports).toEqual(['Cat', 'Dog']);
    });

    it('anyOf with discriminator produces discriminated union', () => {
      const r = createResolver({
        Cat: {
          type: 'object',
          properties: {
            petType: { const: 'cat' },
            name: { type: 'string' },
          },
        },
        Dog: {
          type: 'object',
          properties: {
            petType: { const: 'dog' },
            bark: { type: 'string' },
          },
        },
      });
      const m = new SchemaMapper(r);
      const result = m.mapSchema({
        anyOf: [{ $ref: '#/components/schemas/Cat' }, { $ref: '#/components/schemas/Dog' }],
        discriminator: {
          propertyName: 'petType',
        },
      });
      expect(result.tsType).toBe("({ petType: 'cat' } & Cat) | ({ petType: 'dog' } & Dog)");
      expect(result.imports).toEqual(['Cat', 'Dog']);
    });

    it('discriminator with three variants', () => {
      const r = createResolver({
        Cat: {
          type: 'object',
          properties: { petType: { const: 'cat' } },
        },
        Dog: {
          type: 'object',
          properties: { petType: { const: 'dog' } },
        },
        Bird: {
          type: 'object',
          properties: { petType: { const: 'bird' } },
        },
      });
      const m = new SchemaMapper(r);
      const result = m.mapSchema({
        oneOf: [
          { $ref: '#/components/schemas/Cat' },
          { $ref: '#/components/schemas/Dog' },
          { $ref: '#/components/schemas/Bird' },
        ],
        discriminator: {
          propertyName: 'petType',
        },
      });
      expect(result.tsType).toBe(
        "({ petType: 'cat' } & Cat) | ({ petType: 'dog' } & Dog) | ({ petType: 'bird' } & Bird)"
      );
      expect(result.imports).toEqual(['Cat', 'Dog', 'Bird']);
    });

    it('discriminator with nullable produces nullable discriminated union', () => {
      const r = createResolver({
        Cat: {
          type: 'object',
          properties: { petType: { const: 'cat' } },
        },
        Dog: {
          type: 'object',
          properties: { petType: { const: 'dog' } },
        },
      });
      const m = new SchemaMapper(r);
      const result = m.mapSchema({
        oneOf: [{ $ref: '#/components/schemas/Cat' }, { $ref: '#/components/schemas/Dog' }],
        discriminator: {
          propertyName: 'petType',
        },
        nullable: true,
      });
      expect(result.tsType).toBe(
        "(({ petType: 'cat' } & Cat) | ({ petType: 'dog' } & Dog)) | null"
      );
    });

    it('discriminator with reserved word propertyName quotes the key', () => {
      const r = createResolver({
        TypeA: {
          type: 'object',
          properties: { type: { const: 'a' } },
        },
        TypeB: {
          type: 'object',
          properties: { type: { const: 'b' } },
        },
      });
      const m = new SchemaMapper(r);
      const result = m.mapSchema({
        oneOf: [{ $ref: '#/components/schemas/TypeA' }, { $ref: '#/components/schemas/TypeB' }],
        discriminator: {
          propertyName: 'type',
        },
      });
      expect(result.tsType).toBe('({ "type": \'a\' } & TypeA) | ({ "type": \'b\' } & TypeB)');
    });

    it('discriminator falls back to type name when no mapping and no const', () => {
      const r = createResolver({
        Cat: { type: 'object', properties: { name: { type: 'string' } } },
        Dog: { type: 'object', properties: { bark: { type: 'string' } } },
      });
      const m = new SchemaMapper(r);
      const result = m.mapSchema({
        oneOf: [{ $ref: '#/components/schemas/Cat' }, { $ref: '#/components/schemas/Dog' }],
        discriminator: {
          propertyName: 'petType',
        },
      });
      expect(result.tsType).toBe("({ petType: 'Cat' } & Cat) | ({ petType: 'Dog' } & Dog)");
    });

    it('allOf subtype of discriminated base gets literal discriminator value', () => {
      const r = createResolver({
        Pet: {
          type: 'object',
          discriminator: {
            propertyName: '$type',
            mapping: {
              Cat: '#/components/schemas/Cat',
            },
          },
          properties: {
            $type: { type: 'string' },
            name: { type: 'string' },
          },
        },
        Cat: {
          allOf: [
            { $ref: '#/components/schemas/Pet' },
            {
              type: 'object',
              properties: {
                meow: { type: 'string' },
              },
            },
          ],
        },
      });
      const m = new SchemaMapper(r);
      const result = m.mapSchema({ $ref: '#/components/schemas/Cat' });
      expect(result.tsType).toContain("'Cat'");
      expect(result.tsType).toContain('meow');
    });

    it('discriminator property is added to base type when not in properties', () => {
      const petSchema: SchemaObject = {
        type: 'object',
        required: ['$type'],
        properties: {
          name: { type: 'string' },
        },
        discriminator: {
          propertyName: '$type',
        },
      };
      const r = createResolver({ Pet: petSchema });
      const m = new SchemaMapper(r);
      const result = m.mapSchema(petSchema);
      expect(result.tsType).toContain('"$type"');
    });

    it('discriminator property already in properties is preserved', () => {
      const baseSchema: SchemaObject = {
        type: 'object',
        properties: {
          $type: { type: 'string' },
          name: { type: 'string' },
        },
        discriminator: {
          propertyName: '$type',
        },
      };
      const r = createResolver({ Base: baseSchema });
      const m = new SchemaMapper(r);
      const result = m.mapSchema(baseSchema);
      const dollarTypeCount = (result.tsType.match(/"\$type"/g) || []).length;
      expect(dollarTypeCount).toBe(1);
    });

    it('non-discriminated allOf produces unchanged intersection', () => {
      const r = createResolver();
      const m = new SchemaMapper(r);
      const result = m.mapSchema({
        allOf: [
          {
            type: 'object',
            properties: { name: { type: 'string' } },
          },
          {
            type: 'object',
            properties: { age: { type: 'integer' } },
          },
        ],
      });
      expect(result.tsType).toContain('name');
      expect(result.tsType).toContain('age');
      expect(result.tsType).not.toContain('$type');
    });

    it('allOf subtype with multiple additional properties', () => {
      const r = createResolver({
        Pet: {
          type: 'object',
          discriminator: {
            propertyName: '$type',
            mapping: {
              Dog: '#/components/schemas/Dog',
            },
          },
          properties: {
            $type: { type: 'string' },
            name: { type: 'string' },
          },
        },
        Dog: {
          allOf: [
            { $ref: '#/components/schemas/Pet' },
            {
              type: 'object',
              properties: {
                breed: { type: 'string' },
                barkVolume: { type: 'integer' },
              },
            },
          ],
        },
      });
      const m = new SchemaMapper(r);
      const result = m.mapSchema({ $ref: '#/components/schemas/Dog' });
      expect(result.tsType).toContain("'Dog'");
      expect(result.tsType).toContain('breed');
      expect(result.tsType).toContain('barkVolume');
    });
  });

  describe('format branding', () => {
    it('brands string with date-time format', () => {
      const mapper = new SchemaMapper(createResolver());
      const result = mapper.mapSchema({ type: 'string', format: 'date-time' });
      expect(result.tsType).toBe('DateTimeString');
      expect(result.imports).toContain('DateTimeString');
      const brands = mapper.getBrandedTypes();
      expect(brands.size).toBe(1);
      expect([...brands.values()][0]).toEqual({
        name: 'DateTimeString',
        format: 'date-time',
        baseType: 'string',
      });
    });

    it('brands integer with int32 format', () => {
      const mapper = new SchemaMapper(createResolver());
      const result = mapper.mapSchema({ type: 'integer', format: 'int32' });
      expect(result.tsType).toBe('Int32Number');
      const brands = mapper.getBrandedTypes();
      expect(brands.size).toBe(1);
      expect([...brands.values()][0]).toEqual({
        name: 'Int32Number',
        format: 'int32',
        baseType: 'number',
      });
    });

    it('brands number with double format', () => {
      const mapper = new SchemaMapper(createResolver());
      const result = mapper.mapSchema({ type: 'number', format: 'double' });
      expect(result.tsType).toBe('DoubleNumber');
      expect(mapper.getBrandedTypes().size).toBe(1);
    });

    it('brands string with uuid format', () => {
      const mapper = new SchemaMapper(createResolver());
      const result = mapper.mapSchema({ type: 'string', format: 'uuid' });
      expect(result.tsType).toBe('UuidString');
      expect(result.imports).toContain('UuidString');
    });

    it('brands string with custom format', () => {
      const mapper = new SchemaMapper(createResolver());
      const result = mapper.mapSchema({ type: 'string', format: 'my-custom-format' });
      expect(result.tsType).toBe('MyCustomFormatString');
      const brands = mapper.getBrandedTypes();
      expect([...brands.values()][0]).toEqual({
        name: 'MyCustomFormatString',
        format: 'my-custom-format',
        baseType: 'string',
      });
    });

    it('does NOT brand binary format', () => {
      const mapper = new SchemaMapper(createResolver());
      const result = mapper.mapSchema({ type: 'string', format: 'binary' });
      expect(result.tsType).toBe('string');
      expect(mapper.getBrandedTypes().size).toBe(0);
    });

    it('does NOT brand byte format', () => {
      const mapper = new SchemaMapper(createResolver());
      const result = mapper.mapSchema({ type: 'string', format: 'byte' });
      expect(result.tsType).toBe('string');
      expect(mapper.getBrandedTypes().size).toBe(0);
    });

    it('does NOT brand empty format', () => {
      const mapper = new SchemaMapper(createResolver());
      const result = mapper.mapSchema({ type: 'string', format: '' });
      expect(result.tsType).toBe('string');
      expect(mapper.getBrandedTypes().size).toBe(0);
    });

    it('does NOT brand whitespace-only format', () => {
      const mapper = new SchemaMapper(createResolver());
      const result = mapper.mapSchema({ type: 'string', format: '  ' });
      expect(result.tsType).toBe('string');
      expect(mapper.getBrandedTypes().size).toBe(0);
    });

    it('does NOT brand when format is undefined', () => {
      const mapper = new SchemaMapper(createResolver());
      const result = mapper.mapSchema({ type: 'string' });
      expect(result.tsType).toBe('string');
      expect(mapper.getBrandedTypes().size).toBe(0);
    });

    it('handles nullable branded type', () => {
      const mapper = new SchemaMapper(createResolver());
      const result = mapper.mapSchema({ type: 'string', format: 'date-time', nullable: true });
      expect(result.tsType).toBe('DateTimeString | null');
      expect(result.imports).toContain('DateTimeString');
    });

    it('enum wins over format', () => {
      const mapper = new SchemaMapper(createResolver());
      const result = mapper.mapSchema({ type: 'string', format: 'email', enum: ['a@b.com'] });
      expect(result.tsType).toBe("'a@b.com'");
      expect(mapper.getBrandedTypes().size).toBe(0);
    });

    it('const does NOT prevent branding (no top-level const handler)', () => {
      const mapper = new SchemaMapper(createResolver());
      const result = mapper.mapSchema({ type: 'string', format: 'date-time', const: '2023-01-01' });
      expect(result.tsType).toBe('DateTimeString');
      expect(mapper.getBrandedTypes().size).toBe(1);
    });

    it('brands array items with format', () => {
      const mapper = new SchemaMapper(createResolver());
      const result = mapper.mapSchema({ type: 'array', items: { type: 'string', format: 'uuid' } });
      expect(result.tsType).toBe('UuidString[]');
      expect(result.imports).toContain('UuidString');
    });

    it('brands object properties with format', () => {
      const mapper = new SchemaMapper(createResolver());
      const result = mapper.mapSchema({
        type: 'object',
        properties: { createdAt: { type: 'string', format: 'date-time' } },
      });
      expect(result.tsType).toContain('createdAt?: DateTimeString');
      expect(result.imports).toContain('DateTimeString');
    });

    it('brands additionalProperties with format', () => {
      const mapper = new SchemaMapper(createResolver());
      const result = mapper.mapSchema({
        type: 'object',
        additionalProperties: { type: 'string', format: 'date-time' },
      });
      expect(result.tsType).toContain('Record<string, DateTimeString>');
      expect(result.imports).toContain('DateTimeString');
    });

    it('deduplicates same format+type combo', () => {
      const mapper = new SchemaMapper(createResolver());
      mapper.mapSchema({ type: 'string', format: 'date-time' });
      mapper.mapSchema({ type: 'string', format: 'date-time' });
      const brands = mapper.getBrandedTypes();
      expect(brands.size).toBe(1);
      expect(brands.has('date-time:string')).toBe(true);
    });

    it('skips branding when name collides with reserved name', () => {
      const mapper = new SchemaMapper(createResolver(), {
        emittedNames: new Set(['DateTimeString']),
      });
      const result = mapper.mapSchema({ type: 'string', format: 'date-time' });
      expect(result.tsType).toBe('string');
      expect(mapper.getBrandedTypes().size).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('returns unknown for unknown type string', () => {
      const result = mapper.mapSchema({
        type: 'customType' as string,
      } as SchemaObject);
      expect(result.tsType).toBe('unknown');
    });

    it('handles object with only some properties required', () => {
      const result = mapper.mapSchema(
        {
          type: 'object',
          properties: {
            a: { type: 'string' },
            b: { type: 'number' },
            c: { type: 'boolean' },
          },
          required: ['a'],
        },
        'Partial'
      );
      expect(result.tsType).toContain('a: string;');
      expect(result.tsType).toContain('b?: number;');
      expect(result.tsType).toContain('c?: boolean;');
    });

    it('handles named empty object', () => {
      const result = mapper.mapSchema({ type: 'object', additionalProperties: false }, 'Empty');
      expect(result.tsType).toBe('{}');
    });

    it('handles nested arrays', () => {
      const result = mapper.mapSchema({
        type: 'array',
        items: {
          type: 'array',
          items: { type: 'string' },
        },
      });
      expect(result.tsType).toBe('string[][]');
    });

    it('handles array of refs in named interface', () => {
      const r = createResolver({
        Item: { type: 'object', properties: { id: { type: 'string' } } },
      });
      const m = new SchemaMapper(r);
      const result = m.mapSchema(
        {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: { $ref: '#/components/schemas/Item' },
            },
          },
        },
        'Container'
      );
      expect(result.tsType).toBe('{\n  items?: Item[];\n}');
      expect(result.imports).toEqual(['Item']);
    });

    it('handles allOf with nullable', () => {
      const result = mapper.mapSchema({
        allOf: [
          { type: 'object', properties: { a: { type: 'string' } } },
          { type: 'object', properties: { b: { type: 'number' } } },
        ],
        nullable: true,
      });
      expect(result.tsType).toBe('({\n  a?: string;\n} & {\n  b?: number;\n}) | null');
    });

    it('handles type array with only null', () => {
      const result = mapper.mapSchema({
        type: ['null'],
      } as SchemaObject);
      expect(result.tsType).toBe('null');
    });

    it('handles additionalProperties with $ref', () => {
      const r = createResolver({
        Tag: { type: 'string', enum: ['a', 'b'] },
      });
      const m = new SchemaMapper(r);
      const result = m.mapSchema({
        type: 'object',
        additionalProperties: { $ref: '#/components/schemas/Tag' },
      });
      expect(result.tsType).toBe('Record<string, Tag>');
      expect(result.imports).toEqual(['Tag']);
    });
  });

  describe('multi-line object rendering and property JSDoc', () => {
    it('renders flat object multi-line at depth 0', () => {
      const result = mapper.mapSchema({
        type: 'object',
        properties: {
          a: { type: 'string' },
          b: { type: 'number' },
        },
      });
      expect(result.tsType).toBe('{\n  a?: string;\n  b?: number;\n}');
    });

    it('renders nested anonymous objects one indent deeper per level', () => {
      const result = mapper.mapSchema({
        type: 'object',
        properties: {
          outer: {
            type: 'object',
            properties: {
              inner: { type: 'string' },
            },
          },
        },
      });
      expect(result.tsType).toBe('{\n  outer?: {\n    inner?: string;\n  };\n}');
    });

    it('renders three levels of nesting with cumulative indentation', () => {
      const result = mapper.mapSchema({
        type: 'object',
        properties: {
          l1: {
            type: 'object',
            properties: {
              l2: {
                type: 'object',
                properties: {
                  l3: {
                    type: 'object',
                    properties: {
                      leaf: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      });
      expect(result.tsType).toBe(
        '{\n  l1?: {\n    l2?: {\n      l3?: {\n        leaf?: string;\n      };\n    };\n  };\n}'
      );
    });

    it('keeps required vs optional markers in multi-line rendering', () => {
      const result = mapper.mapSchema({
        type: 'object',
        properties: {
          req: { type: 'string' },
          opt: { type: 'number' },
        },
        required: ['req'],
      });
      expect(result.tsType).toBe('{\n  req: string;\n  opt?: number;\n}');
    });

    it('renders arrays of objects as multi-line Array blocks indented to the property', () => {
      const result = mapper.mapSchema({
        type: 'object',
        properties: {
          branches: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
              },
            },
          },
        },
      });
      expect(result.tsType).toBe('{\n  branches?: Array<{\n    name?: string;\n  }>;\n}');
    });

    it('aligns single-segment JSDoc at 2-space property indent', () => {
      const result = mapper.mapSchema({
        type: 'object',
        properties: {
          name: { type: 'string', description: 'The name.' },
        },
      });
      expect(result.tsType).toBe('{\n  /** The name. */\n  name?: string;\n}');
    });

    it('aligns multi-segment JSDoc at 2-space property indent with blank separator lines', () => {
      const result = mapper.mapSchema({
        type: 'object',
        properties: {
          status: {
            type: 'string',
            description: 'Current status.',
            deprecated: true,
          },
        },
      });
      expect(result.tsType).toBe(
        '{\n  /**\n   * Current status.\n   *\n   * @deprecated\n   */\n  status?: string;\n}'
      );
    });

    it('aligns JSDoc at 4-space indent for depth-2 properties', () => {
      const result = mapper.mapSchema({
        type: 'object',
        properties: {
          outer: {
            type: 'object',
            properties: {
              inner: { type: 'string', description: 'Inner doc.' },
            },
          },
        },
      });
      expect(result.tsType).toBe(
        '{\n  outer?: {\n    /** Inner doc. */\n    inner?: string;\n  };\n}'
      );
    });

    it('aligns JSDoc at 6-space indent for depth-3 properties', () => {
      const result = mapper.mapSchema({
        type: 'object',
        properties: {
          l1: {
            type: 'object',
            properties: {
              l2: {
                type: 'object',
                properties: {
                  leaf: { type: 'string', description: 'Deep doc.' },
                },
              },
            },
          },
        },
      });
      expect(result.tsType).toBe(
        '{\n  l1?: {\n    l2?: {\n      /** Deep doc. */\n      leaf?: string;\n    };\n  };\n}'
      );
    });

    it('renders singular example (3.0 style) as a single @example line', () => {
      const result = mapper.mapSchema({
        type: 'object',
        properties: {
          count: { type: 'integer', example: 42 },
        },
      });
      expect(result.tsType).toBe('{\n  /** @example 42 */\n  count?: number;\n}');
    });

    it('renders examples array (3.1 style) as one @example line per value', () => {
      const result = mapper.mapSchema({
        type: 'object',
        properties: {
          count: { type: 'integer', examples: [1, 2] },
        },
      });
      expect(result.tsType).toBe(
        '{\n  /**\n   * @example 1\n   *\n   * @example 2\n   */\n  count?: number;\n}'
      );
    });

    it('renders all five metadata segments in the frozen order', () => {
      const result = mapper.mapSchema({
        type: 'object',
        properties: {
          all: {
            type: 'string',
            description: 'Full.',
            deprecated: true,
            default: 'x',
            example: 'y',
            title: 'T',
          },
        },
      });
      expect(result.tsType).toBe(
        `{\n  /**\n   * Full.\n   *\n   * @deprecated\n   *\n   * @default "x"\n   *\n   * @example "y"\n   *\n   * @title T\n   */\n  all?: string;\n}`
      );
    });

    it('renders zero-metadata objects multi-line with no comment blocks', () => {
      const result = mapper.mapSchema({
        type: 'object',
        properties: {
          a: { type: 'string' },
          b: { type: 'number' },
        },
      });
      expect(result.tsType).toBe('{\n  a?: string;\n  b?: number;\n}');
      expect(result.tsType).not.toContain('/**');
    });

    it('skips JSDoc for empty and whitespace-only descriptions', () => {
      const result = mapper.mapSchema({
        type: 'object',
        properties: {
          empty: { type: 'string', description: '' },
          blank: { type: 'string', description: '   ' },
        },
      });
      expect(result.tsType).toBe('{\n  empty?: string;\n  blank?: string;\n}');
      expect(result.tsType).not.toContain('/**');
    });

    it('takes metadata for $ref properties from the resolved target node', () => {
      const r = createResolver({
        Target: {
          type: 'object',
          description: 'Target-level doc.',
          properties: { x: { type: 'string' } },
        },
      });
      const m = new SchemaMapper(r);
      const result = m.mapSchema({
        type: 'object',
        properties: {
          ref: { $ref: '#/components/schemas/Target' },
        },
      });
      expect(result.tsType).toBe('{\n  /** Target-level doc. */\n  ref?: Target;\n}');
      expect(result.imports).toEqual(['Target']);
    });

    it('does not recurse metadata through self-referential $ref targets', () => {
      const r = createResolver({
        Node: {
          type: 'object',
          description: 'Node-level doc.',
          properties: {
            child: { $ref: '#/components/schemas/Node' },
          },
        },
      });
      const m = new SchemaMapper(r);
      const result = m.mapSchema({
        type: 'object',
        properties: {
          root: { $ref: '#/components/schemas/Node' },
        },
      });
      expect(result.tsType).toBe('{\n  /** Node-level doc. */\n  root?: Node;\n}');
    });

    it('emits own-node metadata on an inline allOf property', () => {
      const result = mapper.mapSchema({
        type: 'object',
        properties: {
          composed: {
            description: 'Parent doc.',
            allOf: [{ type: 'object', properties: { a: { type: 'string' } } }],
          },
        },
      });
      expect(result.tsType).toBe(
        '{\n  /** Parent doc. */\n  composed?: {\n    a?: string;\n  };\n}'
      );
    });

    it('drops allOf member metadata silently', () => {
      const result = mapper.mapSchema({
        type: 'object',
        properties: {
          composed: {
            allOf: [
              {
                type: 'object',
                description: 'Member doc that must not appear.',
                properties: { a: { type: 'string' } },
              },
            ],
          },
        },
      });
      expect(result.tsType).toBe('{\n  composed?: {\n    a?: string;\n  };\n}');
      expect(result.tsType).not.toContain('Member doc');
    });

    it('drops oneOf member metadata silently', () => {
      const result = mapper.mapSchema({
        type: 'object',
        properties: {
          variant: {
            oneOf: [
              { type: 'string', description: 'Variant doc that must not appear.' },
              { type: 'number' },
            ],
          },
        },
      });
      expect(result.tsType).toBe('{\n  variant?: string | number;\n}');
      expect(result.tsType).not.toContain('Variant doc');
    });

    it('escapes comment-terminator sequences inside descriptions', () => {
      const result = mapper.mapSchema({
        type: 'object',
        properties: {
          docs: { type: 'string', description: 'Ends with a terminator */ inline.' },
        },
      });
      expect(result.tsType).toBe(
        '{\n  /** Ends with a terminator *\\/ inline. */\n  docs?: string;\n}'
      );
    });

    it('flattens multiline descriptions to a single space-separated line', () => {
      const result = mapper.mapSchema({
        type: 'object',
        properties: {
          docs: { type: 'string', description: 'Line one.\nLine two.' },
        },
      });
      expect(result.tsType).toBe('{\n  /** Line one. Line two. */\n  docs?: string;\n}');
    });

    it('renders array items metadata-free (items metadata dropped)', () => {
      const result = mapper.mapSchema({
        type: 'object',
        properties: {
          list: {
            type: 'array',
            description: 'List doc.',
            items: {
              type: 'object',
              description: 'Items doc that must not appear.',
              properties: { a: { type: 'string' } },
            },
          },
        },
      });
      expect(result.tsType).toBe(
        '{\n  /** List doc. */\n  list?: Array<{\n    a?: string;\n  }>;\n}'
      );
      expect(result.tsType).not.toContain('Items doc');
    });

    it('emits JSDoc above the discriminator property block without comments on the hoisted property', () => {
      const result = mapper.mapSchema({
        type: 'object',
        discriminator: { propertyName: 'kind' },
        properties: {
          kind: { type: 'string' },
          name: { type: 'string', description: 'Name doc.' },
        },
      });
      expect(result.tsType).toBe('{\n  "kind": string;\n  /** Name doc. */\n  name?: string;\n}');
    });
  });

  describe('deprecated nullable warning', () => {
    const nullableSchema: SchemaObject = { type: 'string', nullable: true };
    const expectedMessage =
      'Warning: \'nullable\' is deprecated in OpenAPI 3.1. Use \'type: ["string", "null"]\' instead.';

    it('warns exactly once per instance when mapping a nullable schema', () => {
      const writes: string[] = [];
      const r = createResolver();
      const m = new SchemaMapper(r, {
        warnSink: (msg) => {
          writes.push(msg);
        },
      });

      m.mapSchema(nullableSchema);
      m.mapSchema(nullableSchema);
      m.mapSchema(nullableSchema);

      expect(writes).toEqual([expectedMessage]);
    });

    it('warns once per each of two instances with identical messages', () => {
      const firstWrites: string[] = [];
      const secondWrites: string[] = [];
      const r = createResolver();
      const first = new SchemaMapper(r, {
        warnSink: (msg) => {
          firstWrites.push(msg);
        },
      });
      const second = new SchemaMapper(r, {
        warnSink: (msg) => {
          secondWrites.push(msg);
        },
      });

      first.mapSchema(nullableSchema);
      second.mapSchema(nullableSchema);

      expect(firstWrites).toEqual([expectedMessage]);
      expect(secondWrites).toEqual([expectedMessage]);
    });

    it('routes the warning through the injected sink, not console.warn', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const writes: string[] = [];
        const r = createResolver();
        const m = new SchemaMapper(r, {
          warnSink: (msg) => {
            writes.push(msg);
          },
        });

        m.mapSchema(nullableSchema);

        expect(writes).toEqual([expectedMessage]);
        expect(warnSpy).not.toHaveBeenCalled();
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('does not warn for schemas without nullable', () => {
      const writes: string[] = [];
      const r = createResolver();
      const m = new SchemaMapper(r, {
        warnSink: (msg) => {
          writes.push(msg);
        },
      });

      m.mapSchema({ type: 'string' });

      expect(writes).toEqual([]);
    });
  });

  describe('nullable warning dialect gating', () => {
    const nullableSchema: SchemaObject = { type: 'string', nullable: true };
    const expectedMessage =
      'Warning: \'nullable\' is deprecated in OpenAPI 3.1. Use \'type: ["string", "null"]\' instead.';

    function nullableWarnings(writes: string[]): string[] {
      return writes.filter((msg) => msg === expectedMessage);
    }

    it("does not warn when effectiveVersion is '3.0' while keeping nullable → | null mapping", () => {
      const writes: string[] = [];
      const r = createResolver();
      const m = new SchemaMapper(r, {
        effectiveVersion: '3.0',
        warnSink: (msg) => {
          writes.push(msg);
        },
      });

      const first = m.mapSchema(nullableSchema);
      m.mapSchema(nullableSchema);
      m.mapSchema(nullableSchema);

      expect(nullableWarnings(writes)).toEqual([]);
      expect(first.tsType).toBe('string | null');
    });

    it("warns exactly once when effectiveVersion is '3.1'", () => {
      const writes: string[] = [];
      const r = createResolver();
      const m = new SchemaMapper(r, {
        effectiveVersion: '3.1',
        warnSink: (msg) => {
          writes.push(msg);
        },
      });

      const first = m.mapSchema(nullableSchema);
      m.mapSchema(nullableSchema);
      m.mapSchema(nullableSchema);

      expect(nullableWarnings(writes)).toEqual([expectedMessage]);
      expect(first.tsType).toBe('string | null');
    });

    it('warns exactly once when effectiveVersion is omitted (default is treated as 3.1)', () => {
      const writes: string[] = [];
      const r = createResolver();
      const m = new SchemaMapper(r, {
        warnSink: (msg) => {
          writes.push(msg);
        },
      });

      m.mapSchema(nullableSchema);
      m.mapSchema(nullableSchema);
      m.mapSchema(nullableSchema);

      expect(nullableWarnings(writes)).toEqual([expectedMessage]);
    });

    it('never warns for nullable: false or absent nullable regardless of version', () => {
      for (const effectiveVersion of ['3.0', '3.1'] as const) {
        const writes: string[] = [];
        const r = createResolver();
        const m = new SchemaMapper(r, {
          effectiveVersion,
          warnSink: (msg) => {
            writes.push(msg);
          },
        });

        m.mapSchema({ type: 'string', nullable: false });
        m.mapSchema({ type: 'string' });

        expect(nullableWarnings(writes)).toEqual([]);
      }
    });
  });

  // ------------------------------------------------------------------------
  // RED matrix for the single-injection discriminator architecture
  // (plan: .sisyphus/plans/discriminator-cross-variant-fix.md, D1–D10).
  //
  // These cases encode the NEW output shapes and are intentionally RED
  // against the current mapper: literals must be injected exactly once (at
  // the mapping target's own named definition), $refs translate through a
  // single seam (bare names / Omit<Parent, P> / {Base}Variant), and literal
  // values must be escaped. Tasks 3–4 of the plan drive them GREEN.
  //
  // The mapper is constructed exactly the way production analyze() does:
  // rename-aware typeNameGenerator, the discriminator registry as the single
  // discriminator knowledge source, and allSchemaNames as the reserved-name
  // set.
  // ------------------------------------------------------------------------

  interface ProductionFixture {
    mapper: SchemaMapper;
    warnings: string[];
    schemas: Record<string, SchemaObject>;
  }

  function buildProductionFixture(schemas: Record<string, SchemaObject>): ProductionFixture {
    const doc: OpenAPIDocument = {
      openapi: '3.0.3',
      info: { title: 'Test', version: '1.0.0' },
      components: { schemas },
    };
    const resolver = new RefResolver(doc);
    const renameMap = buildSchemaRenameMap(Object.keys(schemas), RESERVED_TYPE_NAMES);
    const renamingTypeGenerator = (refString: string): string => {
      const segments = refString.split('/');
      const rawSegment = segments[segments.length - 1] || 'unknown';
      return renameMap.get(rawSegment) ?? sanitizeTypeName(rawSegment);
    };
    // Mirrors analyze(): the registry is the mapper's single discriminator
    // knowledge source (and shares the warning sink).
    const allSchemaNames = new Set(
      Object.keys(schemas).map((name) => renameMap.get(name) ?? sanitizeTypeName(name))
    );
    const warnings: string[] = [];
    const warnSink = (msg: string) => {
      warnings.push(msg);
    };
    const discriminatorRegistry = buildDiscriminatorRegistry(
      schemas,
      resolver,
      renameMap,
      allSchemaNames,
      warnSink
    );
    const mapper = new SchemaMapper(resolver, {
      typeNameGenerator: renamingTypeGenerator,
      emittedNames: allSchemaNames,
      warnSink,
      discriminatorRegistry,
    });
    return { mapper, warnings, schemas };
  }

  describe('discriminator single-injection architecture (RED matrix)', () => {
    it('T1: cross-variant inheritance emits Omit<Parent> with exactly ONE literal', () => {
      const thingSchemas: Record<string, SchemaObject> = {
        BaseThing: {
          type: 'object',
          required: ['$type', 'id'],
          properties: { $type: { type: 'string' }, id: { type: 'string' } },
          discriminator: {
            propertyName: '$type',
            mapping: {
              Partial: '#/components/schemas/PartialThing',
              Full: '#/components/schemas/UpdateThing',
              Create: '#/components/schemas/CreateThing',
            },
          },
        },
        PartialThing: {
          allOf: [{ $ref: '#/components/schemas/BaseThing' }, { type: 'object' }],
        },
        UpdateThing: {
          allOf: [
            { $ref: '#/components/schemas/BaseThing' },
            {
              type: 'object',
              required: ['name'],
              properties: { name: { type: 'string' } },
            },
          ],
        },
        CreateThing: {
          allOf: [
            { $ref: '#/components/schemas/UpdateThing' },
            { type: 'object', additionalProperties: false },
          ],
        },
      };
      const { mapper, schemas } = buildProductionFixture(thingSchemas);

      const result = mapper.mapSchema(schemas.CreateThing!, 'CreateThing');

      // NEW shape: exactly one literal, parent referenced via Omit (D2),
      // pre-existing Record<string, unknown> member preserved.
      expect(result.tsType).toMatch(
        /^Omit<UpdateThing, ["']?\$type["']?> & Record<string, unknown> & \{ ["']?\$type["']?: 'Create' \}$/
      );
      // The parent's 'Full' literal must NOT leak into the child (the `never` bug).
      expect(result.tsType).not.toContain("'Full'");
    });

    it('T2: $ref to a named mapping target at a leaf site emits the bare name', () => {
      const thingSchemas: Record<string, SchemaObject> = {
        BaseThing: {
          type: 'object',
          properties: { id: { type: 'string' } },
          discriminator: {
            propertyName: '$type',
            mapping: { Create: '#/components/schemas/CreateThing' },
          },
        },
        CreateThing: {
          allOf: [
            { $ref: '#/components/schemas/BaseThing' },
            { type: 'object', properties: { name: { type: 'string' } } },
          ],
        },
      };
      const { mapper } = buildProductionFixture(thingSchemas);

      const result = mapper.mapSchema({ $ref: '#/components/schemas/CreateThing' });

      expect(result.tsType).toBe('CreateThing');
      expect(result.imports).toEqual(['CreateThing']);
    });

    it('T3: $ref to a discriminator base at a leaf site emits {Base}Variant (D1)', () => {
      const thingSchemas: Record<string, SchemaObject> = {
        BaseThing: {
          type: 'object',
          properties: { id: { type: 'string' } },
          discriminator: {
            propertyName: '$type',
            mapping: { Create: '#/components/schemas/CreateThing' },
          },
        },
        CreateThing: {
          allOf: [
            { $ref: '#/components/schemas/BaseThing' },
            { type: 'object', properties: { name: { type: 'string' } } },
          ],
        },
      };
      const { mapper } = buildProductionFixture(thingSchemas);

      const result = mapper.mapSchema({ $ref: '#/components/schemas/BaseThing' });

      expect(result.tsType).toBe('BaseThingVariant');
      expect(result.imports).toEqual(['BaseThingVariant']);
    });

    it('T4: two sibling $refs to the same mapping target keep full types (no visited-set collapse)', () => {
      const holderSchemas: Record<string, SchemaObject> = {
        Widget: {
          type: 'object',
          properties: { label: { type: 'string' } },
          discriminator: {
            propertyName: 'kind',
            mapping: { Big: '#/components/schemas/BigWidget' },
          },
        },
        BigWidget: {
          allOf: [
            { $ref: '#/components/schemas/Widget' },
            { type: 'object', properties: { size: { type: 'integer' } } },
          ],
        },
        Holder: {
          type: 'object',
          required: ['first', 'second'],
          properties: {
            first: { $ref: '#/components/schemas/BigWidget' },
            second: { $ref: '#/components/schemas/BigWidget' },
          },
        },
      };
      const { mapper, schemas } = buildProductionFixture(holderSchemas);

      const result = mapper.mapSchema(schemas.Holder!, 'Holder');

      // Both siblings must survive as full named types — the second must not
      // collapse to `unknown & { kind: 'Big' }` (props dropped).
      expect(result.tsType).toBe('{\n  first: BigWidget;\n  second: BigWidget;\n}');
      expect(result.imports).toEqual(['BigWidget', 'BigWidget']);
    });

    it('T5: nullable mapping target keeps its literal via parenthesized append (D9)', () => {
      const gateSchemas: Record<string, SchemaObject> = {
        GateBase: {
          type: 'object',
          properties: { label: { type: 'string' } },
          discriminator: {
            propertyName: 'state',
            mapping: { On: '#/components/schemas/OnGate' },
          },
        },
        OnGate: {
          nullable: true,
          allOf: [
            { $ref: '#/components/schemas/GateBase' },
            { type: 'object', properties: { level: { type: 'integer' } } },
          ],
        },
      };
      const { mapper, schemas } = buildProductionFixture(gateSchemas);

      const result = mapper.mapSchema(schemas.OnGate!, 'OnGate');

      // The append must wrap the `| null` tail in parens so the literal is not
      // silently lost (`X | null & { ... }` distributes the & onto null only).
      expect(result.tsType).toMatch(/\| null\) & \{ ["']?state["']?: 'On' \}$/);
    });

    it('T6: implicit oneOf variants without mapping map to bare names (D7)', () => {
      const familySchemas: Record<string, SchemaObject> = {
        Family: {
          oneOf: [
            { $ref: '#/components/schemas/my-variant' },
            { $ref: '#/components/schemas/other-variant' },
          ],
          discriminator: { propertyName: 'kind' },
        },
        'my-variant': {
          type: 'object',
          properties: { label: { type: 'string' } },
        },
        'other-variant': {
          type: 'object',
          properties: { note: { type: 'string' } },
        },
      };
      const { mapper, schemas } = buildProductionFixture(familySchemas);

      const result = mapper.mapSchema(schemas.Family!);

      // Ref variants are bare names; their named definitions carry the
      // literal (with the RAW ref segment 'my-variant', not 'MyVariant' — D3).
      expect(result.tsType).toBe('MyVariant | OtherVariant');
      expect(result.imports).toEqual(['MyVariant', 'OtherVariant']);
    });

    it('T7: mapping keys containing quotes and backslashes are escaped (D8)', () => {
      const quoteSchemas: Record<string, SchemaObject> = {
        QuoteBase: {
          type: 'object',
          properties: { id: { type: 'string' } },
          discriminator: {
            propertyName: 'who',
            mapping: {
              "O'Brien": '#/components/schemas/ApostropheBean',
              'back\\slash': '#/components/schemas/BackslashBean',
              '123': '#/components/schemas/NumericBean',
            },
          },
        },
        ApostropheBean: {
          allOf: [
            { $ref: '#/components/schemas/QuoteBase' },
            { type: 'object', properties: { note: { type: 'string' } } },
          ],
        },
        BackslashBean: {
          allOf: [
            { $ref: '#/components/schemas/QuoteBase' },
            { type: 'object', properties: { note: { type: 'string' } } },
          ],
        },
        NumericBean: {
          allOf: [
            { $ref: '#/components/schemas/QuoteBase' },
            { type: 'object', properties: { note: { type: 'string' } } },
          ],
        },
      };
      const { mapper, schemas } = buildProductionFixture(quoteSchemas);

      const apostrophe = mapper.mapSchema(schemas.ApostropheBean!, 'ApostropheBean');
      expect(apostrophe.tsType).toContain(String.raw`{ who: 'O\'Brien' }`);
      expect(apostrophe.tsType).not.toContain(String.raw`'O'Brien'`);

      const backslash = mapper.mapSchema(schemas.BackslashBean!, 'BackslashBean');
      expect(backslash.tsType).toContain(String.raw`{ who: 'back\\slash' }`);

      // Numeric mapping keys are quoted as string literals.
      const numeric = mapper.mapSchema(schemas.NumericBean!, 'NumericBean');
      expect(numeric.tsType).toContain("{ who: '123' }");

      // Same escaping applies to enum members (mapEnumValues shares the helper).
      const plain = new SchemaMapper(createResolver());
      const mood = plain.mapSchema({ enum: ["it's fine", 'plain'] });
      expect(mood.tsType).toBe(String.raw`'it\'s fine' | 'plain'`);
    });

    it('T8: discriminated union refs are bare names; foreign refs keep the wrapper and warn (D7)', () => {
      const classicSchemas: Record<string, SchemaObject> = {
        Pet: {
          oneOf: [{ $ref: '#/components/schemas/Cat' }, { $ref: '#/components/schemas/Dog' }],
          discriminator: {
            propertyName: 'petType',
            mapping: {
              Cat: '#/components/schemas/Cat',
              Dog: '#/components/schemas/Dog',
            },
          },
        },
        Cat: {
          type: 'object',
          properties: { meow: { type: 'string' } },
        },
        Dog: {
          type: 'object',
          properties: { bark: { type: 'string' } },
        },
      };
      const classic = buildProductionFixture(classicSchemas);
      const union = classic.mapper.mapSchema(classicSchemas.Pet!);
      expect(union.tsType).toBe('Cat | Dog');
      expect(union.imports).toEqual(['Cat', 'Dog']);

      // A foreign (non-family) ref keeps the inline wrapper and warns.
      const foreignSchemas: Record<string, SchemaObject> = {
        Pet: {
          oneOf: [{ $ref: '#/components/schemas/Cat' }, { $ref: '#/components/schemas/Alien' }],
          discriminator: {
            propertyName: 'petType',
            mapping: { Cat: '#/components/schemas/Cat' },
          },
        },
        Cat: {
          type: 'object',
          properties: { petType: { const: 'cat' } },
        },
        Alien: {
          type: 'object',
          properties: { petType: { const: 'martian' }, planet: { type: 'string' } },
        },
      };
      const foreign = buildProductionFixture(foreignSchemas);
      const mixed = foreign.mapper.mapSchema(foreignSchemas.Pet!);
      expect(mixed.tsType).toBe("Cat | ({ petType: 'martian' } & Alien)");
      expect(foreign.warnings.length).toBeGreaterThan(0);
    });

    it('T9: a property $ref to another family variant target stays a bare name (multi-family scoping)', () => {
      const multiFamilySchemas: Record<string, SchemaObject> = {
        BaseThing: {
          type: 'object',
          properties: { id: { type: 'string' } },
          discriminator: {
            propertyName: '$type',
            mapping: { Full: '#/components/schemas/UpdateThing' },
          },
        },
        UpdateThing: {
          allOf: [
            { $ref: '#/components/schemas/BaseThing' },
            {
              type: 'object',
              properties: { bulletin: { $ref: '#/components/schemas/BulletinArtifact' } },
            },
          ],
        },
        BaseArtifact: {
          type: 'object',
          properties: { artifactId: { type: 'string' } },
          discriminator: {
            propertyName: '$type',
            mapping: { Bulletin: '#/components/schemas/BulletinArtifact' },
          },
        },
        BulletinArtifact: {
          allOf: [
            { $ref: '#/components/schemas/BaseArtifact' },
            { type: 'object', properties: { url: { type: 'string' } } },
          ],
        },
      };
      const { mapper, schemas } = buildProductionFixture(multiFamilySchemas);

      const result = mapper.mapSchema(schemas.UpdateThing!, 'UpdateThing');

      expect(result.tsType).toContain('bulletin?: BulletinArtifact;');
      // The sibling family's literal must not be inlined here.
      expect(result.tsType).not.toContain("'Bulletin'");
      expect(result.tsType).toMatch(/\{ ["']?\$type["']?: 'Full' \}$/);
    });

    it('T10a: grandchild chain emits Omit<mid, P> with exactly one literal', () => {
      const chainSchemas: Record<string, SchemaObject> = {
        Chain0: {
          type: 'object',
          discriminator: {
            propertyName: 'chain',
            mapping: {
              mid: '#/components/schemas/ChainMid',
              leaf: '#/components/schemas/ChainLeaf',
            },
          },
        },
        ChainMid: {
          allOf: [
            { $ref: '#/components/schemas/Chain0' },
            { type: 'object', properties: { level: { type: 'integer' } } },
          ],
        },
        ChainLeaf: {
          allOf: [
            { $ref: '#/components/schemas/ChainMid' },
            { type: 'object', properties: { leafNote: { type: 'string' } } },
          ],
        },
      };
      const { mapper, schemas } = buildProductionFixture(chainSchemas);

      const leaf = mapper.mapSchema(schemas.ChainLeaf!, 'ChainLeaf');

      expect(leaf.tsType).toMatch(/^Omit<ChainMid, ["']?chain["']?>/);
      expect(leaf.tsType).not.toContain("'mid'");
      expect(leaf.tsType).toMatch(/\{ ["']?chain["']?: 'leaf' \}$/);
    });

    it('T10b: multi-parent spine Omit-references every same-family sibling (D4)', () => {
      const multiSchemas: Record<string, SchemaObject> = {
        Multi0: {
          type: 'object',
          discriminator: {
            propertyName: 'mult',
            mapping: {
              left: '#/components/schemas/MultiLeft',
              right: '#/components/schemas/MultiRight',
            },
          },
        },
        MultiLeft: {
          allOf: [
            { $ref: '#/components/schemas/Multi0' },
            { type: 'object', properties: { leftNote: { type: 'string' } } },
          ],
        },
        MultiRight: {
          allOf: [
            { $ref: '#/components/schemas/Multi0' },
            { $ref: '#/components/schemas/MultiLeft' },
            { type: 'object', properties: { rightNote: { type: 'string' } } },
          ],
        },
      };
      const { mapper, schemas } = buildProductionFixture(multiSchemas);

      const right = mapper.mapSchema(schemas.MultiRight!, 'MultiRight');

      expect(right.tsType).toContain('Omit<MultiLeft');
      expect(right.tsType.match(/'right'/g)).toHaveLength(1);
      expect(right.tsType).not.toContain("'left'");
    });

    it('T10c: cyclic sibling spines terminate and keep exactly one literal each', () => {
      // Mutual sibling-allOf spines (Alpha -> Beta AND Beta -> Alpha as allOf
      // members) are inexpressible in TypeScript: each side would emit
      // `Omit<Other, 'loop'>`, making the two aliases textually reference each
      // other -> TS2456 circular type alias (proven in
      // .sisyphus/evidence/task-3-cycle-termination.txt §5). The fixture keeps
      // ONE spine direction and expresses the back-edge as an object PROPERTY
      // ref, which the seam translates as a bare name (leaf site, named
      // target) — the cycle still exercises generation termination, and the
      // output compiles.
      const loopSchemas: Record<string, SchemaObject> = {
        Loop0: {
          type: 'object',
          discriminator: {
            propertyName: 'loop',
            mapping: {
              alpha: '#/components/schemas/LoopAlpha',
              beta: '#/components/schemas/LoopBeta',
            },
          },
        },
        LoopAlpha: {
          allOf: [
            { $ref: '#/components/schemas/Loop0' },
            { type: 'object', properties: { alphaNote: { type: 'string' } } },
          ],
        },
        LoopBeta: {
          allOf: [
            { $ref: '#/components/schemas/Loop0' },
            {
              type: 'object',
              properties: {
                betaNote: { type: 'string' },
                partner: { $ref: '#/components/schemas/LoopAlpha' },
              },
            },
          ],
        },
      };
      const { mapper, schemas } = buildProductionFixture(loopSchemas);

      const alpha = mapper.mapSchema(schemas.LoopAlpha!, 'LoopAlpha');
      expect(alpha.tsType).not.toContain('Omit<LoopBeta');
      expect(alpha.tsType.match(/'alpha'/g)).toHaveLength(1);

      const beta = mapper.mapSchema(schemas.LoopBeta!, 'LoopBeta');
      expect(beta.tsType).toContain('partner?: LoopAlpha;');
      expect(beta.tsType.match(/'beta'/g)).toHaveLength(1);

      // No alias references its own family union (no self-cycle).
      expect(alpha.tsType).not.toContain('Loop0Variant');
      expect(beta.tsType).not.toContain('Loop0Variant');
    });

    it('T10d: spine $ref to a oneOf-union target falls back to inline expansion without the literal', () => {
      const uniSchemas: Record<string, SchemaObject> = {
        Uni0: {
          type: 'object',
          discriminator: {
            propertyName: 'uni',
            mapping: {
              mix: '#/components/schemas/UniMix',
              pick: '#/components/schemas/UniPick',
            },
          },
        },
        UniMix: {
          oneOf: [{ $ref: '#/components/schemas/UniA1' }, { $ref: '#/components/schemas/UniA2' }],
        },
        UniA1: { type: 'object', properties: { aOne: { type: 'string' } } },
        UniA2: { type: 'object', properties: { aTwo: { type: 'string' } } },
        UniPick: {
          allOf: [
            { $ref: '#/components/schemas/Uni0' },
            { $ref: '#/components/schemas/UniMix' },
            { type: 'object', properties: { pickNote: { type: 'string' } } },
          ],
        },
      };
      const { mapper, schemas } = buildProductionFixture(uniSchemas);

      // The union target itself: site-2 append must parenthesize (D9) so the
      // literal applies to the whole union, not just its last member.
      const mix = mapper.mapSchema(schemas.UniMix!, 'UniMix');
      expect(mix.tsType).toBe("(UniA1 | UniA2) & { uni: 'mix' }");

      // The spine consumer: inline expansion, no 'mix' literal leak (D2 fallback).
      const pick = mapper.mapSchema(schemas.UniPick!, 'UniPick');
      expect(pick.tsType).toContain('(UniA1 | UniA2) &');
      expect(pick.tsType).not.toContain("'mix'");
      expect(pick.tsType).toMatch(/\{ ["']?uni["']?: 'pick' \}$/);
    });

    it('T10e: nested base $ref inside a variant becomes {Base}Variant; spine base ref stays bare (D1)', () => {
      const selfSchemas: Record<string, SchemaObject> = {
        Self0: {
          type: 'object',
          discriminator: {
            propertyName: 'self',
            mapping: { kid: '#/components/schemas/SelfKid' },
          },
        },
        SelfKid: {
          allOf: [
            { $ref: '#/components/schemas/Self0' },
            {
              type: 'object',
              required: ['parent'],
              properties: { parent: { $ref: '#/components/schemas/Self0' } },
            },
          ],
        },
      };
      const { mapper, schemas } = buildProductionFixture(selfSchemas);

      const kid = mapper.mapSchema(schemas.SelfKid!, 'SelfKid');

      expect(kid.tsType).toContain('parent: Self0Variant;');
      expect(kid.tsType).toMatch(/\{ ["']?self["']?: 'kid' \}$/);
    });

    it('T10f: variant redeclaring its own discriminator value loses to the mapping key and warns (D3)', () => {
      const constSchemas: Record<string, SchemaObject> = {
        Const0: {
          type: 'object',
          discriminator: {
            propertyName: 'mode',
            mapping: { fast: '#/components/schemas/ConstFast' },
          },
        },
        ConstFast: {
          allOf: [
            { $ref: '#/components/schemas/Const0' },
            {
              type: 'object',
              required: ['mode', 'speed'],
              properties: {
                mode: { type: 'string', enum: ['slow'] },
                speed: { type: 'integer' },
              },
            },
          ],
        },
      };
      const { mapper, warnings, schemas } = buildProductionFixture(constSchemas);

      const fast = mapper.mapSchema(schemas.ConstFast!, 'ConstFast');

      expect(fast.tsType).not.toContain("'slow'");
      expect(fast.tsType.match(/'fast'/g)).toHaveLength(1);
      expect(warnings.length).toBeGreaterThan(0);
    });
  });
});
