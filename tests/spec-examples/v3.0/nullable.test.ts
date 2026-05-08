/**
 * Spec-Example Tests — OpenAPI 3.0 Nullable Behavior
 *
 * In OpenAPI 3.0, `nullable: true` is the standard way to indicate that
 * a value may be null (3.1 uses `type: ["string", "null"]` instead).
 *
 * Covers:
 * - nullable on primitive types (string, integer, boolean)
 * - nullable on arrays and array items
 * - nullable inside allOf / oneOf / anyOf composition
 * - nullable on enums
 * - nullable on object properties (nested)
 * - nullable: false / absent (should produce regular types)
 * - nullable without a type
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

describe('OpenAPI 3.0 — nullable', () => {
  // ────────────────────────────────────────────────────────────────────────
  // 1. Nullable primitives
  // ────────────────────────────────────────────────────────────────────────
  describe('nullable primitives', () => {
    it('generates string | null for nullable string', () => {
      const result = generate({
        NullableString: { type: 'string', nullable: true },
      });
      expect(result).toMatchSnapshot();
    });

    it('generates number | null for nullable integer', () => {
      const result = generate({
        NullableInt: { type: 'integer', nullable: true },
      });
      expect(result).toMatchSnapshot();
    });

    it('generates number | null for nullable number', () => {
      const result = generate({
        NullableNumber: { type: 'number', nullable: true },
      });
      expect(result).toMatchSnapshot();
    });

    it('generates boolean | null for nullable boolean', () => {
      const result = generate({
        NullableBool: { type: 'boolean', nullable: true },
      });
      expect(result).toMatchSnapshot();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 2. Nullable with arrays
  // ────────────────────────────────────────────────────────────────────────
  describe('nullable arrays', () => {
    it('generates T[] | null for nullable array', () => {
      const result = generate({
        NullableArray: {
          type: 'array',
          items: { type: 'string' },
          nullable: true,
        },
      });
      expect(result).toMatchSnapshot();
    });

    it('generates Array<T | null> | null for nullable array with nullable items', () => {
      const result = generate({
        NullableArrayItems: {
          type: 'array',
          items: { type: 'string', nullable: true },
          nullable: true,
        },
      });
      expect(result).toMatchSnapshot();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 3. Nullable inside composition (allOf / oneOf / anyOf)
  // ────────────────────────────────────────────────────────────────────────
  describe('nullable inside composition', () => {
    it('generates intersection type unioned with null for nullable allOf', () => {
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
              properties: { extra: { type: 'string', nullable: true } },
            },
          ],
          nullable: true,
        },
      });

      expect(result).toMatchSnapshot();
    });

    it('generates union type wrapped with | null for nullable oneOf', () => {
      const result = generate({
        NullableOneOf: {
          oneOf: [{ type: 'string' }, { type: 'number' }],
          nullable: true,
        },
      });

      expect(result).toMatchSnapshot();
    });

    it('generates union type wrapped with | null for nullable anyOf', () => {
      const result = generate({
        NullableAnyOf: {
          anyOf: [{ type: 'string' }, { type: 'boolean' }],
          nullable: true,
        },
      });

      expect(result).toMatchSnapshot();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 4. Nullable enum
  // ────────────────────────────────────────────────────────────────────────
  describe('nullable enum', () => {
    it('generates enum union with null for nullable enum', () => {
      const result = generate({
        NullableStatus: {
          type: 'string',
          enum: ['active', 'inactive', 'pending'],
          nullable: true,
        },
      });

      expect(result).toMatchSnapshot();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 5. Nullable on object properties
  // ────────────────────────────────────────────────────────────────────────
  describe('nullable on object properties', () => {
    it('generates nullable property type inside interface', () => {
      const result = generate({
        User: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            nickname: { type: 'string', nullable: true },
            age: { type: 'integer' },
          },
          required: ['name', 'nickname', 'age'],
        },
      });

      expect(result).toMatchSnapshot();
    });

    it('generates nullable property on nested object', () => {
      const result = generate({
        Outer: {
          type: 'object',
          properties: {
            inner: {
              type: 'object',
              nullable: true,
              properties: {
                value: { type: 'string' },
              },
            },
          },
        },
      });

      expect(result).toMatchSnapshot();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 6. nullable: false or absent
  // ────────────────────────────────────────────────────────────────────────
  describe('nullable: false or absent', () => {
    it('generates regular string type when nullable is false', () => {
      const result = generate({
        NotNullable: { type: 'string', nullable: false },
      });
      expect(result).toMatchSnapshot();
      expect(result).not.toContain('NotNullable = string | null');
    });

    it('generates regular type when nullable is absent', () => {
      const result = generate({
        RegularString: { type: 'string' },
      });
      expect(result).toMatchSnapshot();
      expect(result).not.toContain('RegularString = string | null');
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 7. Nullable without type
  // ────────────────────────────────────────────────────────────────────────
  describe('nullable without type', () => {
    it('generates unknown for nullable schema without type', () => {
      const result = generate({
        NullableUntyped: { nullable: true },
      });
      expect(result).toMatchSnapshot();
    });
  });
});
