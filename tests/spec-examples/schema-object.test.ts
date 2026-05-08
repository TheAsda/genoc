/**
 * Spec-Example Tests — Schema Object Examples
 *
 * Covers ALL examples from OpenAPI 3.1.0 §4.8.24.3:
 * - Primitive Sample
 * - Simple Model
 * - Model with Map/Dictionary Properties
 * - Model with Example
 * - Models with Composition (allOf / oneOf / anyOf)
 * - Polymorphism Support (basic — discriminator detailed in Task 26)
 */
import { describe, expect, it } from 'vitest';

import { generateContracts } from '../../src/generator/contracts-generator.js';
import { RefResolver } from '../../src/parser/ref-resolver.js';
import type { OpenAPIDocument } from '../../src/types/openapi.js';

function createDoc(overrides?: Partial<OpenAPIDocument>): OpenAPIDocument {
  return {
    openapi: '3.1.0',
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

describe('Schema Object — OpenAPI 3.1.0 §4.8.24.3 Examples', () => {
  // ────────────────────────────────────────────────────────────────────────
  // 1. Primitive Schema
  // ────────────────────────────────────────────────────────────────────────
  describe('Primitive Sample', () => {
    it('generates type alias for a string primitive schema', () => {
      const result = generate({ Status: { type: 'string' } });
      expect(result).toMatchSnapshot();
    });

    it('generates type alias for an integer primitive schema', () => {
      const result = generate({ Count: { type: 'integer' } });
      expect(result).toMatchSnapshot();
    });

    it('generates type alias for a boolean primitive schema', () => {
      const result = generate({ Active: { type: 'boolean' } });
      expect(result).toMatchSnapshot();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 2. Simple Model
  // ────────────────────────────────────────────────────────────────────────
  describe('Simple Model', () => {
    it('generates interface with typed properties for a simple object model', () => {
      const result = generate({
        User: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            age: { type: 'integer' },
          },
          required: ['name'],
        },
      });

      expect(result).toMatchSnapshot();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 3. Model with Map/Dictionary Properties
  // ────────────────────────────────────────────────────────────────────────
  describe('Model with Map/Dictionary Properties', () => {
    it('generates index signature for additionalProperties with type', () => {
      const result = generate({
        IntMap: {
          type: 'object',
          additionalProperties: { type: 'integer' },
        },
      });

      expect(result).toMatchSnapshot();
    });

    it('generates Record type for anonymous map without name (inline)', () => {
      const result = generate({
        Container: {
          type: 'object',
          properties: {
            metadata: {
              type: 'object',
              additionalProperties: { type: 'string' },
            },
          },
        },
      });

      expect(result).toMatchSnapshot();
    });

    it('generates index signature alongside named properties', () => {
      const result = generate({
        ExtendedMap: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
          additionalProperties: { type: 'integer' },
        },
      });

      expect(result).toMatchSnapshot();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 4. Model with Example
  // ────────────────────────────────────────────────────────────────────────
  describe('Model with Example', () => {
    it('does not crash when schema includes `example` field (gracefully ignored)', () => {
      const result = generate({
        Pet: {
          type: 'object',
          properties: {
            name: { type: 'string', example: 'Fluffy' },
            tag: { type: 'string' },
          },
          example: { name: 'Fluffy', tag: 'cat' },
        },
      });

      expect(result).toMatchSnapshot();
    });

    it('does not crash when schema includes `examples` array (OpenAPI 3.1 style)', () => {
      const result = generate({
        Color: {
          type: 'string',
          examples: ['red', 'green', 'blue'],
        },
      });

      expect(result).toMatchSnapshot();
    });

    it('preserves description in JSDoc alongside example', () => {
      const result = generate({
        Product: {
          type: 'object',
          description: 'A product in the catalog',
          properties: {
            name: { type: 'string' },
          },
          example: { name: 'Widget' },
        },
      });

      expect(result).toMatchSnapshot();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 5. allOf Composition
  // ────────────────────────────────────────────────────────────────────────
  describe('Models with Composition — allOf', () => {
    it('generates intersection type combining base schema with extension', () => {
      const result = generate({
        ErrorBase: {
          type: 'object',
          properties: {
            code: { type: 'integer' },
            message: { type: 'string' },
          },
          required: ['code', 'message'],
        },
        ExtendedError: {
          allOf: [
            { $ref: '#/components/schemas/ErrorBase' },
            {
              type: 'object',
              properties: {
                detail: { type: 'string' },
              },
            },
          ],
        },
      });

      expect(result).toMatchSnapshot();

      const basePos = result.indexOf('export type ErrorBase');
      const extPos = result.indexOf('export type ExtendedError');
      expect(basePos).toBeLessThan(extPos);
    });

    it('generates intersection type for allOf with inline objects only', () => {
      const result = generate({
        Combined: {
          allOf: [
            {
              type: 'object',
              properties: { a: { type: 'string' } },
            },
            {
              type: 'object',
              properties: { b: { type: 'number' } },
            },
          ],
        },
      });

      expect(result).toMatchSnapshot();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 6. oneOf Composition
  // ────────────────────────────────────────────────────────────────────────
  describe('Models with Composition — oneOf', () => {
    it('generates union type for oneOf with referenced schemas', () => {
      const result = generate({
        Cat: {
          type: 'object',
          properties: { meow: { type: 'boolean' } },
        },
        Dog: {
          type: 'object',
          properties: { bark: { type: 'boolean' } },
        },
        Pet: {
          oneOf: [{ $ref: '#/components/schemas/Cat' }, { $ref: '#/components/schemas/Dog' }],
        },
      });

      expect(result).toMatchSnapshot();
    });

    it('generates union type for oneOf with inline primitive schemas', () => {
      const result = generate({
        StringOrNumber: {
          oneOf: [{ type: 'string' }, { type: 'number' }],
        },
      });

      expect(result).toMatchSnapshot();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 7. anyOf Composition
  // ────────────────────────────────────────────────────────────────────────
  describe('Models with Composition — anyOf', () => {
    it('generates union type for anyOf with referenced schemas', () => {
      const result = generate({
        Photo: {
          type: 'object',
          properties: { url: { type: 'string' } },
        },
        Video: {
          type: 'object',
          properties: { duration: { type: 'integer' } },
        },
        Media: {
          anyOf: [{ $ref: '#/components/schemas/Photo' }, { $ref: '#/components/schemas/Video' }],
        },
      });

      expect(result).toMatchSnapshot();
    });

    it('generates union type for anyOf with mixed inline schemas', () => {
      const result = generate({
        Flexible: {
          anyOf: [{ type: 'string' }, { type: 'integer' }, { type: 'boolean' }],
        },
      });

      expect(result).toMatchSnapshot();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 8. Polymorphism Support (basic — no discriminator)
  // ────────────────────────────────────────────────────────────────────────
  describe('Polymorphism Support (basic)', () => {
    it('generates base type and union of subtypes via oneOf', () => {
      const result = generate({
        PetBase: {
          type: 'object',
          properties: {
            petType: { type: 'string' },
          },
          required: ['petType'],
        },
        Cat: {
          allOf: [
            { $ref: '#/components/schemas/PetBase' },
            {
              type: 'object',
              properties: { meow: { type: 'boolean' } },
            },
          ],
        },
        Dog: {
          allOf: [
            { $ref: '#/components/schemas/PetBase' },
            {
              type: 'object',
              properties: { bark: { type: 'boolean' } },
            },
          ],
        },
        Pet: {
          oneOf: [{ $ref: '#/components/schemas/Cat' }, { $ref: '#/components/schemas/Dog' }],
        },
      });

      expect(result).toMatchSnapshot();

      // Verify topological ordering: base before subtypes, subtypes before union
      const baseIdx = result.indexOf('export type PetBase');
      const catIdx = result.indexOf('export type Cat');
      const dogIdx = result.indexOf('export type Dog');
      const petIdx = result.indexOf('export type Pet = Cat | Dog');
      expect(baseIdx).toBeLessThan(catIdx);
      expect(baseIdx).toBeLessThan(dogIdx);
      expect(catIdx).toBeLessThan(petIdx);
      expect(dogIdx).toBeLessThan(petIdx);
    });
  });
});
