/**
 * Spec-Example Tests — OpenAPI 3.0 exclusiveMinimum / exclusiveMaximum
 *
 * In OpenAPI 3.0, `exclusiveMinimum` and `exclusiveMaximum` are boolean
 * modifiers of `minimum` and `maximum` respectively (not standalone numbers
 * as in 3.1). These are validation constraints that don't affect the
 * TypeScript type, but the generator must handle them gracefully.
 *
 * Covers:
 * - exclusiveMinimum: true + minimum → number type
 * - exclusiveMaximum: true + maximum → number type
 * - Both together
 * - exclusiveMinimum: false (treated as regular minimum)
 * - Absent exclusiveMin/Max → regular number type
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

describe('OpenAPI 3.0 — exclusiveMinimum / exclusiveMaximum', () => {
  it('generates number type for exclusiveMinimum: true with minimum', () => {
    const result = generate({
      BoundedMin: { type: 'number', minimum: 5, exclusiveMinimum: true },
    });
    expect(result).toMatchSnapshot();
  });

  it('generates number type for exclusiveMaximum: true with maximum', () => {
    const result = generate({
      BoundedMax: { type: 'integer', maximum: 100, exclusiveMaximum: true },
    });
    expect(result).toMatchSnapshot();
  });

  it('generates number type when both exclusiveMinimum and exclusiveMaximum are set', () => {
    const result = generate({
      BothBounded: {
        type: 'number',
        minimum: 0,
        exclusiveMinimum: true,
        maximum: 100,
        exclusiveMaximum: true,
      },
    });
    expect(result).toMatchSnapshot();
  });

  it('generates number type when exclusiveMinimum is false', () => {
    const result = generate({
      NonExclusive: {
        type: 'number',
        minimum: 0,
        exclusiveMinimum: false,
      },
    });
    expect(result).toMatchSnapshot();
  });

  it('generates number type without exclusiveMinimum/Maximum', () => {
    const result = generate({
      PlainNumber: { type: 'number', minimum: 0, maximum: 100 },
    });
    expect(result).toMatchSnapshot();
  });

  it('generates nullable number with exclusive bounds', () => {
    const result = generate({
      NullableBounded: {
        type: 'integer',
        minimum: 1,
        exclusiveMinimum: true,
        maximum: 10,
        exclusiveMaximum: true,
        nullable: true,
      },
    });
    expect(result).toMatchSnapshot();
  });

  it('generates correct type for exclusive bounds on object property', () => {
    const result = generate({
      Config: {
        type: 'object',
        properties: {
          priority: {
            type: 'integer',
            minimum: 0,
            exclusiveMinimum: true,
            maximum: 10,
            exclusiveMaximum: true,
          },
        },
        required: ['priority'],
      },
    });

    expect(result).toMatchSnapshot();
  });
});
