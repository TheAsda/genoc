import { describe, it, expect } from 'vitest';

import { analyzePaths } from '../../src/analyzer/path-analyzer.js';
import { generateClient } from '../../src/generator/client-generator.js';
import { generateContracts } from '../../src/generator/contracts-generator.js';
import { RefResolver } from '../../src/parser/ref-resolver.js';
import type { GeneratorConfig } from '../../src/types/client.js';
import type { OpenAPIDocument } from '../../src/types/openapi.js';

function createDoc(overrides?: Partial<OpenAPIDocument>): OpenAPIDocument {
  return {
    openapi: '3.1.0',
    info: { title: 'Test', version: '1.0.0' },
    ...overrides,
  };
}

function makeConfig(overrides?: Partial<GeneratorConfig>): GeneratorConfig {
  return {
    input: 'test.yaml',
    outputDir: '/tmp/test-output',
    ...overrides,
  };
}

describe('Paths Object examples', () => {
  describe('multiple paths', () => {
    it('generates methods for all paths in the spec', () => {
      const doc = createDoc({
        paths: {
          '/users': {
            get: {
              summary: 'List users',
              responses: {
                '200': {
                  description: 'OK',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            name: { type: 'string' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '/products': {
            get: {
              summary: 'List products',
              responses: {
                '200': {
                  description: 'OK',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            price: { type: 'number' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      const resolver = new RefResolver(doc);
      const operations = analyzePaths(doc, resolver);

      expect(operations).toHaveLength(2);
      expect(operations.map((op) => op.path)).toContain('/users');
      expect(operations.map((op) => op.path)).toContain('/products');

      const { client } = generateClient(doc, makeConfig());
      expect(client).toMatchSnapshot();
    });

    it('generates separate contracts types for each path', () => {
      const doc = createDoc({
        paths: {
          '/users': {
            get: {
              responses: {
                '200': {
                  description: 'OK',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: { total: { type: 'integer' } },
                      },
                    },
                  },
                },
              },
            },
          },
          '/products': {
            get: {
              responses: {
                '200': {
                  description: 'OK',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: { count: { type: 'integer' } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      const resolver = new RefResolver(doc);
      const contracts = generateContracts(doc, resolver);

      expect(contracts).toMatchSnapshot();
    });
  });

  describe('empty paths', () => {
    it('generates no operation-derived types when paths is empty', () => {
      const doc = createDoc({ paths: {} });

      const resolver = new RefResolver(doc);
      const contracts = generateContracts(doc, resolver);

      // Should still have header and ApiError, but no operation types
      expect(contracts).toMatchSnapshot();
      expect(contracts).not.toContain('Query =');
      expect(contracts).not.toContain('Response =');
      expect(contracts).not.toContain('Body =');
    });

    it('produces a valid empty client when paths is empty', () => {
      const doc = createDoc({ paths: {} });

      const { client } = generateClient(doc, makeConfig());

      expect(client).toMatchSnapshot();
      expect(client).not.toContain('import type');
    });

    it('returns empty operations array from analyzePaths', () => {
      const doc = createDoc({ paths: {} });
      const resolver = new RefResolver(doc);
      const operations = analyzePaths(doc, resolver);

      expect(operations).toHaveLength(0);
    });
  });
});
