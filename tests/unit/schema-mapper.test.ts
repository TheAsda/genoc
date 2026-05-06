import { describe, expect, it } from 'vitest';

import { SchemaMapper } from '../../src/analyzer/schema-mapper.js';
import type { TypeNameGenerator } from '../../src/analyzer/schema-mapper.js';
import { RefResolver } from '../../src/parser/ref-resolver.js';
import type { OpenAPIDocument, SchemaObject } from '../../src/types/openapi.js';

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
      expect(result.tsType).toBe('Array<{ name?: string; }>');
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
      expect(result.tsType).toBe('{ name: string; age?: number; }');
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
      expect(result.tsType).toBe('{ id: string; name: string; }');
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
      const m = new SchemaMapper(resolver, customGen);
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
      expect(result.tsType).toBe('{ name?: string; } & { age?: number; }');
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
      expect(result.tsType).toBe('Base & { extra?: string; }');
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
      expect(result.tsType).toBe('{ name?: string; } | null');
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
      expect(result.tsType).toBe('{ name?: string; } & { [key: string]: unknown; }');
    });

    it('omits index signature when additionalProperties: false', () => {
      const result = mapper.mapSchema({
        type: 'object',
        properties: { name: { type: 'string' } },
        additionalProperties: false,
      });
      expect(result.tsType).toBe('{ name?: string; }');
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
      expect(result.tsType).toBe('{ [key: string]: string; }');
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
      expect(result.tsType).toContain('{ id: string');
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

      expect(result.tsType).toBe('{ value: string; children?: Node[]; }');
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
      const mapper = new SchemaMapper(
        createResolver(),
        undefined,
        undefined,
        new Set(['DateTimeString'])
      );
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
      expect(result.tsType).toBe('{ items?: Item[]; }');
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
      expect(result.tsType).toBe('({ a?: string; } & { b?: number; }) | null');
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
});
