/**
 * Spec-Example Tests — OpenAPI 3.0 Schema Object Handling
 *
 * General schema object tests using OpenAPI 3.0.3 specification.
 * Validates core schema features: primitives, objects, arrays, enums,
 * composition (allOf/oneOf/anyOf), $ref resolution, and required/optional.
 *
 * Uses `openapi: "3.0.3"` (not 3.1.0) to exercise the 3.0 code path.
 */
import { describe, expect, it } from 'vitest';

import { generateContracts } from '../../../src/generator/contracts-generator.js';
import { RefResolver } from '../../../src/parser/ref-resolver.js';
import type { OpenAPIDocument } from '../../../src/types/openapi.js';

function createDoc(overrides?: Partial<OpenAPIDocument>): OpenAPIDocument {
  return {
    openapi: '3.0.3',
    info: { title: 'Test', version: '1.0.0' },
    paths: {},
    ...overrides,
  };
}

function makeResolver(doc: OpenAPIDocument): RefResolver {
  return new RefResolver(doc);
}

function generate(schemas: Record<string, unknown>): string {
  const doc = createDoc({
    components: { schemas },
  });
  return generateContracts(doc, makeResolver(doc));
}

describe('Schema Object — OpenAPI 3.0.3', () => {
  // ────────────────────────────────────────────────────────────────────────
  // 1. Basic object with properties
  // ────────────────────────────────────────────────────────────────────────
  describe('basic object', () => {
    it('generates interface with typed properties', () => {
      const result = generate({
        User: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
          },
          required: ['id', 'name'],
        },
      });

      expect(result).toContain('export type User = {');
      expect(result).toContain('id: string;');
      expect(result).toContain('name: string;');
    });

    it('generates optional properties when not in required array', () => {
      const result = generate({
        Item: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            label: { type: 'string' },
          },
          required: ['id'],
        },
      });

      expect(result).toContain('id: string;');
      expect(result).toContain('label?: string;');
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 2. Array type with items
  // ────────────────────────────────────────────────────────────────────────
  describe('array type', () => {
    it('generates array type alias with typed items', () => {
      const result = generate({
        Tags: {
          type: 'array',
          items: { type: 'string' },
        },
      });

      expect(result).toContain('export type Tags = string[];');
    });

    it('generates array of objects', () => {
      const result = generate({
        Users: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              email: { type: 'string' },
            },
          },
        },
      });

      expect(result).toContain('export type Users =');
      expect(result).toContain('Array<');
      expect(result).toContain('email?: string;');
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 3. Primitive types
  // ────────────────────────────────────────────────────────────────────────
  describe('primitive types', () => {
    it('generates string type alias', () => {
      const result = generate({ Name: { type: 'string' } });
      expect(result).toContain('export type Name = string;');
    });

    it('generates number type alias for integer', () => {
      const result = generate({ Count: { type: 'integer' } });
      expect(result).toContain('export type Count = number;');
    });

    it('generates number type alias for number', () => {
      const result = generate({ Score: { type: 'number' } });
      expect(result).toContain('export type Score = number;');
    });

    it('generates boolean type alias', () => {
      const result = generate({ Active: { type: 'boolean' } });
      expect(result).toContain('export type Active = boolean;');
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 4. Enum values
  // ────────────────────────────────────────────────────────────────────────
  describe('enum values', () => {
    it('generates string literal union for string enum', () => {
      const result = generate({
        Status: { type: 'string', enum: ['active', 'inactive'] },
      });

      expect(result).toContain("export type Status = 'active' | 'inactive';");
    });

    it('generates number literal union for numeric enum', () => {
      const result = generate({
        Priority: { type: 'integer', enum: [1, 2, 3] },
      });

      expect(result).toContain('export type Priority = 1 | 2 | 3;');
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 5. allOf composition
  // ────────────────────────────────────────────────────────────────────────
  describe('allOf composition', () => {
    it('generates intersection type with referenced and inline schemas', () => {
      const result = generate({
        Base: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
        Extended: {
          allOf: [
            { $ref: '#/components/schemas/Base' },
            {
              type: 'object',
              properties: { label: { type: 'string' } },
            },
          ],
        },
      });

      expect(result).toContain('export type Extended = Base &');
      const basePos = result.indexOf('export type Base');
      const extPos = result.indexOf('export type Extended');
      expect(basePos).toBeLessThan(extPos);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 6. oneOf composition
  // ────────────────────────────────────────────────────────────────────────
  describe('oneOf composition', () => {
    it('generates union type for referenced schemas', () => {
      const result = generate({
        Cat: { type: 'object', properties: { meow: { type: 'boolean' } } },
        Dog: { type: 'object', properties: { bark: { type: 'boolean' } } },
        Pet: {
          oneOf: [{ $ref: '#/components/schemas/Cat' }, { $ref: '#/components/schemas/Dog' }],
        },
      });

      expect(result).toContain('export type Pet = Cat | Dog;');
    });

    it('generates union type for inline primitives', () => {
      const result = generate({
        StringOrNumber: { oneOf: [{ type: 'string' }, { type: 'number' }] },
      });

      expect(result).toContain('export type StringOrNumber = string | number;');
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 7. anyOf composition
  // ────────────────────────────────────────────────────────────────────────
  describe('anyOf composition', () => {
    it('generates union type for referenced schemas', () => {
      const result = generate({
        Photo: { type: 'object', properties: { url: { type: 'string' } } },
        Video: {
          type: 'object',
          properties: { duration: { type: 'integer' } },
        },
        Media: {
          anyOf: [{ $ref: '#/components/schemas/Photo' }, { $ref: '#/components/schemas/Video' }],
        },
      });

      expect(result).toContain('export type Media = Photo | Video;');
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 8. $ref resolution
  // ────────────────────────────────────────────────────────────────────────
  describe('$ref resolution', () => {
    it('resolves $ref to referenced schema type', () => {
      const result = generate({
        Address: {
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city'],
        },
        Person: {
          type: 'object',
          properties: {
            address: { $ref: '#/components/schemas/Address' },
          },
          required: ['address'],
        },
      });

      expect(result).toContain('export type Person = {');
      expect(result).toContain('address: Address;');
      const addressPos = result.indexOf('export type Address');
      const personPos = result.indexOf('export type Person');
      expect(addressPos).toBeLessThan(personPos);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 9. Required vs optional properties
  // ────────────────────────────────────────────────────────────────────────
  describe('required vs optional', () => {
    it('marks required properties as non-optional', () => {
      const result = generate({
        Entity: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            createdAt: { type: 'string' },
          },
          required: ['id', 'createdAt'],
        },
      });

      expect(result).toContain('id: string;');
      expect(result).toContain('createdAt: string;');
      expect(result).not.toContain('id?:');
      expect(result).not.toContain('createdAt?:');
    });

    it('marks unlisted properties as optional', () => {
      const result = generate({
        Entity: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            nickname: { type: 'string' },
          },
          required: ['id'],
        },
      });

      expect(result).toContain('id: string;');
      expect(result).toContain('nickname?: string;');
    });

    it('treats all properties as optional when required is absent', () => {
      const result = generate({
        Entity: {
          type: 'object',
          properties: {
            a: { type: 'string' },
            b: { type: 'integer' },
          },
        },
      });

      expect(result).toContain('a?: string;');
      expect(result).toContain('b?: number;');
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 10. Nested objects
  // ────────────────────────────────────────────────────────────────────────
  describe('nested objects', () => {
    it('generates inline nested object type', () => {
      const result = generate({
        Order: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            shipping: {
              type: 'object',
              properties: {
                address: { type: 'string' },
                city: { type: 'string' },
              },
              required: ['address'],
            },
          },
          required: ['id', 'shipping'],
        },
      });

      expect(result).toContain('export type Order = {');
      expect(result).toContain('shipping: {');
      expect(result).toContain('address: string;');
      expect(result).toContain('city?: string;');
    });
  });
});
