import { describe, it, expect } from 'vitest';

import { analyzePaths } from '../../src/analyzer/path-analyzer.js';
import { generateClient } from '../../src/generator/client-generator.js';
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

describe('PathItem Object examples', () => {
  describe('multiple methods on same path', () => {
    it('generates separate methods for GET and POST on /users', () => {
      const doc = createDoc({
        paths: {
          '/users': {
            get: {
              summary: 'List all users',
              responses: { '200': { description: 'OK' } },
            },
            post: {
              summary: 'Create a user',
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: { name: { type: 'string' } },
                      required: ['name'],
                    },
                  },
                },
              },
              responses: { '201': { description: 'Created' } },
            },
          },
        },
      });

      const resolver = new RefResolver(doc);
      const operations = analyzePaths(doc, resolver);

      const userOps = operations.filter((op) => op.path === '/users');
      expect(userOps).toHaveLength(2);

      const methods = userOps.map((op) => op.method);
      expect(methods).toContain('get');
      expect(methods).toContain('post');

      const { client } = generateClient(doc, makeConfig());
      expect(client).toMatchSnapshot();
    });

    it('generates separate contracts types for each method on same path', () => {
      const doc = createDoc({
        paths: {
          '/users': {
            get: {
              responses: { '200': { description: 'OK' } },
            },
            post: {
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: { name: { type: 'string' } },
                    },
                  },
                },
              },
              responses: { '201': { description: 'Created' } },
            },
          },
        },
      });

      const { contracts } = generateClient(doc, makeConfig());

      expect(contracts).toMatchSnapshot();
    });
  });

  describe('PathItem-level parameters', () => {
    it('inherits shared parameters across all operations in the path item', () => {
      const doc = createDoc({
        paths: {
          '/items': {
            parameters: [
              {
                name: 'x-api-version',
                in: 'header',
                required: true,
                schema: { type: 'string' },
              },
            ],
            get: {
              summary: 'List items',
              responses: { '200': { description: 'OK' } },
            },
            post: {
              summary: 'Create item',
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: { name: { type: 'string' } },
                    },
                  },
                },
              },
              responses: { '201': { description: 'Created' } },
            },
          },
        },
      });

      const resolver = new RefResolver(doc);
      const operations = analyzePaths(doc, resolver);

      const getOp = operations.find((op) => op.method === 'get' && op.path === '/items');
      const postOp = operations.find((op) => op.method === 'post' && op.path === '/items');

      expect(getOp).toBeDefined();
      expect(postOp).toBeDefined();

      expect(getOp!.headerParams).toHaveLength(1);
      expect(getOp!.headerParams[0].name).toBe('x-api-version');
      expect(getOp!.headerParams[0].required).toBe(true);

      expect(postOp!.headerParams).toHaveLength(1);
      expect(postOp!.headerParams[0].name).toBe('x-api-version');
    });

    it('allows operation-level parameters to override PathItem-level ones', () => {
      const doc = createDoc({
        paths: {
          '/data': {
            parameters: [
              {
                name: 'x-trace-id',
                in: 'header',
                required: false,
                schema: { type: 'string' },
              },
            ],
            get: {
              parameters: [
                {
                  name: 'x-trace-id',
                  in: 'header',
                  required: true,
                  schema: { type: 'string' },
                },
              ],
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      });

      const resolver = new RefResolver(doc);
      const operations = analyzePaths(doc, resolver);

      expect(operations).toHaveLength(1);
      expect(operations[0].headerParams).toHaveLength(1);
      expect(operations[0].headerParams[0].required).toBe(true);
    });

    it('inherits query parameters from PathItem level', () => {
      const doc = createDoc({
        paths: {
          '/search': {
            parameters: [
              {
                name: 'q',
                in: 'query',
                required: true,
                schema: { type: 'string' },
              },
            ],
            get: {
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      });

      const resolver = new RefResolver(doc);
      const operations = analyzePaths(doc, resolver);

      expect(operations).toHaveLength(1);
      expect(operations[0].queryParams).toHaveLength(1);
      expect(operations[0].queryParams[0].name).toBe('q');
      expect(operations[0].queryParams[0].required).toBe(true);
    });
  });

  describe('$ref in PathItem', () => {
    it('ignores $ref on PathItem and processes inline operations normally', () => {
      const doc = createDoc({
        paths: {
          '/users': {
            $ref: 'https://example.com/other.yaml#/paths/~1users',
            get: {
              summary: 'List users',
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      });

      const resolver = new RefResolver(doc);
      const operations = analyzePaths(doc, resolver);

      expect(operations).toHaveLength(1);
      expect(operations[0].method).toBe('get');
      expect(operations[0].path).toBe('/users');
    });

    it('throws when operation references an external $ref parameter', () => {
      const doc = createDoc({
        paths: {
          '/users': {
            get: {
              parameters: [{ $ref: 'https://example.com/other.yaml#/parameters/UserId' }],
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      });

      const resolver = new RefResolver(doc);
      expect(() => analyzePaths(doc, resolver)).toThrow(
        /External \$ref resolution is not supported/
      );
    });
  });
});
