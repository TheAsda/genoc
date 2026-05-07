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

describe('Components Object examples', () => {
  describe('reusable schemas', () => {
    it('generates interfaces and types for all schemas in components/schemas', () => {
      const doc = createDoc({
        components: {
          schemas: {
            User: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
              },
              required: ['id', 'name'],
            },
            Product: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                price: { type: 'number' },
              },
              required: ['id', 'price'],
            },
            Status: { type: 'string', enum: ['active', 'inactive'] },
          },
        },
      });

      const resolver = new RefResolver(doc);
      const contracts = generateContracts(doc, resolver);

      expect(contracts).toMatchSnapshot();
    });

    it('sorts schemas topologically when one references another', () => {
      const doc = createDoc({
        components: {
          schemas: {
            Order: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                product: { $ref: '#/components/schemas/Product' },
              },
              required: ['id', 'product'],
            },
            Product: {
              type: 'object',
              properties: {
                name: { type: 'string' },
              },
              required: ['name'],
            },
          },
        },
      });

      const resolver = new RefResolver(doc);
      const contracts = generateContracts(doc, resolver);

      expect(contracts).toMatchSnapshot();

      const productPos = contracts.indexOf('export type Product');
      const orderPos = contracts.indexOf('export type Order');
      expect(productPos).toBeLessThan(orderPos);
    });
  });

  describe('reusable parameters', () => {
    it('resolves $ref parameters from components/parameters in operations', () => {
      const doc = createDoc({
        components: {
          parameters: {
            UserIdParam: {
              name: 'userId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'The user identifier',
            },
          },
        },
        paths: {
          '/users/{userId}': {
            get: {
              parameters: [{ $ref: '#/components/parameters/UserIdParam' }],
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      });

      const resolver = new RefResolver(doc);
      const operations = analyzePaths(doc, resolver);

      expect(operations).toHaveLength(1);
      expect(operations[0].pathParams).toHaveLength(1);
      expect(operations[0].pathParams[0].name).toBe('userId');
      expect(operations[0].pathParams[0].required).toBe(true);
      expect(operations[0].pathParams[0].tsType).toBe('string');
    });

    it('resolves reusable query parameters via $ref', () => {
      const doc = createDoc({
        components: {
          parameters: {
            PageParam: {
              name: 'page',
              in: 'query',
              schema: { type: 'integer' },
            },
            LimitParam: {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer' },
            },
          },
        },
        paths: {
          '/items': {
            get: {
              parameters: [
                { $ref: '#/components/parameters/PageParam' },
                { $ref: '#/components/parameters/LimitParam' },
              ],
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      });

      const resolver = new RefResolver(doc);
      const operations = analyzePaths(doc, resolver);

      expect(operations[0].queryParams).toHaveLength(2);
      const paramNames = operations[0].queryParams.map((p) => p.name);
      expect(paramNames).toContain('page');
      expect(paramNames).toContain('limit');
    });
  });

  describe('reusable responses', () => {
    it('resolves $ref responses from components/responses in operations', () => {
      const doc = createDoc({
        components: {
          responses: {
            NotFound: {
              description: 'Resource not found',
            },
          },
        },
        paths: {
          '/items/{id}': {
            get: {
              parameters: [
                {
                  name: 'id',
                  in: 'path',
                  required: true,
                  schema: { type: 'string' },
                },
              ],
              responses: {
                '200': { description: 'OK' },
                '404': { $ref: '#/components/responses/NotFound' },
              },
            },
          },
        },
      });

      const resolver = new RefResolver(doc);
      const operations = analyzePaths(doc, resolver);

      expect(operations).toHaveLength(1);
      const err404 = operations[0].responses.find((r) => r.statusCode === '404');
      expect(err404).toBeDefined();
      expect(err404!.description).toBe('Resource not found');
      expect(err404!.isSuccess).toBe(false);
    });

    it('generates error type from $ref response with schema', () => {
      const doc = createDoc({
        components: {
          schemas: {
            ErrorResponse: {
              type: 'object',
              properties: {
                code: { type: 'integer' },
                message: { type: 'string' },
              },
              required: ['code', 'message'],
            },
          },
          responses: {
            BadRequest: {
              description: 'Bad request',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
        paths: {
          '/items': {
            get: {
              responses: {
                '200': { description: 'OK' },
                '400': { $ref: '#/components/responses/BadRequest' },
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

  describe('reusable request bodies', () => {
    it('resolves $ref request bodies from components/requestBodies', () => {
      const doc = createDoc({
        components: {
          schemas: {
            CreateUserInput: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                email: { type: 'string' },
              },
              required: ['name', 'email'],
            },
          },
          requestBodies: {
            CreateUserBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CreateUserInput' },
                },
              },
            },
          },
        },
        paths: {
          '/users': {
            post: {
              requestBody: {
                $ref: '#/components/requestBodies/CreateUserBody',
              },
              responses: { '201': { description: 'Created' } },
            },
          },
        },
      });

      const resolver = new RefResolver(doc);
      const operations = analyzePaths(doc, resolver);

      expect(operations).toHaveLength(1);
      expect(operations[0].requestBody).toBeDefined();
      expect(operations[0].requestBody!.required).toBe(true);
      expect(operations[0].requestBody!.tsType).toBe('CreateUserInput');
    });

    it('generates body type from resolved $ref request body in contracts', () => {
      const doc = createDoc({
        components: {
          schemas: {
            NewItem: {
              type: 'object',
              properties: { label: { type: 'string' } },
              required: ['label'],
            },
          },
          requestBodies: {
            ItemBody: {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/NewItem' },
                },
              },
            },
          },
        },
        paths: {
          '/items': {
            post: {
              requestBody: { $ref: '#/components/requestBodies/ItemBody' },
              responses: { '201': { description: 'Created' } },
            },
          },
        },
      });

      const resolver = new RefResolver(doc);
      const contracts = generateContracts(doc, resolver);

      expect(contracts).toMatchSnapshot();
    });
  });

  describe('no components', () => {
    it('generates valid output with no components section', () => {
      const doc = createDoc({
        paths: {
          '/health': {
            get: {
              summary: 'Health check',
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      });

      const resolver = new RefResolver(doc);
      const contracts = generateContracts(doc, resolver);
      const { client } = generateClient(doc, makeConfig());

      expect(contracts).toMatchSnapshot();
      expect(client).toMatchSnapshot();
    });

    it('generates valid output with empty components object', () => {
      const doc = createDoc({
        components: {},
        paths: {
          '/ping': {
            get: {
              responses: { '200': { description: 'pong' } },
            },
          },
        },
      });

      const resolver = new RefResolver(doc);
      const contracts = generateContracts(doc, resolver);

      expect(contracts).toMatchSnapshot();
      expect(contracts).not.toContain('export interface');
    });
  });
});
