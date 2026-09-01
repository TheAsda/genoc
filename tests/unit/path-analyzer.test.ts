import { describe, it, expect } from 'vitest';

import { analyzePaths } from '../../src/analyzer/path-analyzer.js';
import { RefResolver } from '../../src/parser/ref-resolver.js';
import type { OpenAPIDocument } from '../../src/types/openapi.js';
import operationsSpec from '../fixtures/operations-spec.json' with { type: 'json' };

function makeResolver(doc: OpenAPIDocument) {
  return new RefResolver(doc);
}

describe('analyzePaths', () => {
  const doc = operationsSpec as unknown as OpenAPIDocument;
  const resolver = makeResolver(doc);
  const operations = analyzePaths(doc, resolver);

  it('should extract correct operation count (4 operations from 2 paths)', () => {
    expect(operations).toHaveLength(4);
    const methods = operations.map((op) => `${op.method.toUpperCase()} ${op.path}`).sort();
    expect(methods).toEqual([
      'DELETE /api/v1/products/{productId}',
      'GET /api/v1/products',
      'GET /api/v1/products/{productId}',
      'POST /api/v1/products',
    ]);
  });

  it('should extract path parameters as pathParams', () => {
    const getProductId = operations.find(
      (op) => op.method === 'get' && op.path === '/api/v1/products/{productId}'
    );
    expect(getProductId).toBeDefined();
    expect(getProductId!.pathParams).toHaveLength(1);
    expect(getProductId!.pathParams[0].name).toBe('productId');
    expect(getProductId!.pathParams[0].in).toBe('path');
    expect(getProductId!.pathParams[0].required).toBe(true);
    expect(getProductId!.pathParams[0].tsType).toBe('string');
  });

  it('should extract query parameters as queryParams', () => {
    const listProducts = operations.find(
      (op) => op.method === 'get' && op.path === '/api/v1/products'
    );
    expect(listProducts).toBeDefined();
    expect(listProducts!.queryParams).toHaveLength(2);
    const names = listProducts!.queryParams.map((p) => p.name);
    expect(names).toContain('page');
    expect(names).toContain('limit');
    expect(listProducts!.queryParams[0].tsType).toBe('number');
    expect(listProducts!.queryParams[0].required).toBe(false);
  });

  it('should inherit header parameters from PathItem level', () => {
    const listProducts = operations.find(
      (op) => op.method === 'get' && op.path === '/api/v1/products'
    );
    expect(listProducts).toBeDefined();
    expect(listProducts!.headerParams).toHaveLength(1);
    expect(listProducts!.headerParams[0].name).toBe('x-trace-id');
    expect(listProducts!.headerParams[0].in).toBe('header');
    expect(listProducts!.headerParams[0].tsType).toBe('string');

    const createProduct = operations.find(
      (op) => op.method === 'post' && op.path === '/api/v1/products'
    );
    expect(createProduct).toBeDefined();
    expect(createProduct!.headerParams).toHaveLength(1);
    expect(createProduct!.headerParams[0].name).toBe('x-trace-id');
  });

  it('should extract request body with contentTypes and tsType', () => {
    const createProduct = operations.find(
      (op) => op.method === 'post' && op.path === '/api/v1/products'
    );
    expect(createProduct).toBeDefined();
    expect(createProduct!.requestBody).toBeDefined();
    expect(createProduct!.requestBody!.required).toBe(true);
    expect(createProduct!.requestBody!.contentTypes).toEqual(['application/json']);
    expect(createProduct!.requestBody!.tsType).toBe('NewProduct');
  });

  it('should extract multiple response codes with schemas', () => {
    const listProducts = operations.find(
      (op) => op.method === 'get' && op.path === '/api/v1/products'
    );
    expect(listProducts).toBeDefined();
    expect(listProducts!.responses).toHaveLength(2);

    const ok = listProducts!.responses.find((r) => r.statusCode === '200');
    expect(ok).toBeDefined();
    expect(ok!.isSuccess).toBe(true);
    expect(ok!.description).toBe('Success');
    expect(ok!.tsType).toBe('Product[]');

    const bad = listProducts!.responses.find((r) => r.statusCode === '400');
    expect(bad).toBeDefined();
    expect(bad!.isSuccess).toBe(false);
    expect(bad!.tsType).toBe('unknown');
  });

  it('should preserve deprecated flag', () => {
    const deleteProduct = operations.find(
      (op) => op.method === 'delete' && op.path === '/api/v1/products/{productId}'
    );
    expect(deleteProduct).toBeDefined();
    expect(deleteProduct!.deprecated).toBe(true);

    const listProducts = operations.find(
      (op) => op.method === 'get' && op.path === '/api/v1/products'
    );
    expect(listProducts!.deprecated).toBe(false);
  });

  it('should preserve tags', () => {
    const listProducts = operations.find(
      (op) => op.method === 'get' && op.path === '/api/v1/products'
    );
    expect(listProducts).toBeDefined();
    expect(listProducts!.tags).toEqual(['products']);

    const deleteProduct = operations.find(
      (op) => op.method === 'delete' && op.path === '/api/v1/products/{productId}'
    );
    expect(deleteProduct!.tags).toEqual([]);
  });

  it('should generate method names correctly with operationId-with-fallback strategy', () => {
    const withOpId = analyzePaths(doc, resolver, 'operationId-with-fallback');
    const listProducts = withOpId.find(
      (op) => op.method === 'get' && op.path === '/api/v1/products'
    );
    expect(listProducts!.methodName).toBe('listProducts');

    const deleteProduct = withOpId.find(
      (op) => op.method === 'delete' && op.path === '/api/v1/products/{productId}'
    );
    expect(deleteProduct!.methodName).toBe('deleteApiV1ProductsByProductId');
  });

  it('should override PathItem-level params when operation defines same name', () => {
    const overrideSpec: OpenAPIDocument = {
      openapi: '3.1.0',
      info: { title: 'Override Test', version: '1.0.0' },
      paths: {
        '/test': {
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
                schema: { type: 'integer' },
              },
            ],
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };
    const overrideResolver = makeResolver(overrideSpec);
    const ops = analyzePaths(overrideSpec, overrideResolver);
    expect(ops).toHaveLength(1);
    expect(ops[0].headerParams).toHaveLength(1);
    expect(ops[0].headerParams[0].name).toBe('x-trace-id');
    expect(ops[0].headerParams[0].required).toBe(true);
    expect(ops[0].headerParams[0].tsType).toBe('number');
  });

  describe('void response handling', () => {
    it('200 with no content maps to void tsType', () => {
      const voidSpec: OpenAPIDocument = {
        openapi: '3.1.0',
        info: { title: 'Void Test', version: '1.0.0' },
        paths: {
          '/items/{id}': {
            delete: {
              parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      };
      const resolver = makeResolver(voidSpec);
      const ops = analyzePaths(voidSpec, resolver);
      const resp = ops[0].responses.find((r) => r.statusCode === '200');
      expect(resp).toBeDefined();
      expect(resp!.tsType).toBe('void');
    });

    it('200 with empty content {} maps to void tsType', () => {
      const emptyContentSpec: OpenAPIDocument = {
        openapi: '3.1.0',
        info: { title: 'Empty Content Test', version: '1.0.0' },
        paths: {
          '/items/{id}': {
            delete: {
              parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
              responses: { '200': { description: 'OK', content: {} } },
            },
          },
        },
      };
      const resolver = makeResolver(emptyContentSpec);
      const ops = analyzePaths(emptyContentSpec, resolver);
      const resp = ops[0].responses.find((r) => r.statusCode === '200');
      expect(resp).toBeDefined();
      expect(resp!.tsType).toBe('void');
    });

    it('200 with media type but no schema stays unknown', () => {
      const noSchemaSpec: OpenAPIDocument = {
        openapi: '3.1.0',
        info: { title: 'No Schema Test', version: '1.0.0' },
        paths: {
          '/items/{id}': {
            get: {
              parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
              responses: {
                '200': {
                  description: 'OK',
                  content: {
                    'application/json': {},
                  },
                },
              },
            },
          },
        },
      };
      const resolver = makeResolver(noSchemaSpec);
      const ops = analyzePaths(noSchemaSpec, resolver);
      const resp = ops[0].responses.find((r) => r.statusCode === '200');
      expect(resp).toBeDefined();
      expect(resp!.tsType).toBe('unknown');
    });
  });

  describe('requestBody description', () => {
    it('should carry requestBody.description from the spec', () => {
      const bodyDescSpec: OpenAPIDocument = {
        openapi: '3.1.0',
        info: { title: 'Body Description Test', version: '1.0.0' },
        paths: {
          '/items': {
            post: {
              requestBody: {
                description: 'The item to create',
                required: true,
                content: {
                  'application/json': {
                    schema: { type: 'object' },
                  },
                },
              },
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      };
      const resolver = makeResolver(bodyDescSpec);
      const ops = analyzePaths(bodyDescSpec, resolver);
      expect(ops).toHaveLength(1);
      expect(ops[0].requestBody).toBeDefined();
      expect(ops[0].requestBody!.description).toBe('The item to create');
    });

    it('should carry multi-line requestBody.description unchanged', () => {
      const multilineSpec: OpenAPIDocument = {
        openapi: '3.1.0',
        info: { title: 'Body Multiline Test', version: '1.0.0' },
        paths: {
          '/items': {
            post: {
              requestBody: {
                description: 'Line one.\nLine two.',
                content: {
                  'application/json': {
                    schema: { type: 'object' },
                  },
                },
              },
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      };
      const resolver = makeResolver(multilineSpec);
      const ops = analyzePaths(multilineSpec, resolver);
      expect(ops[0].requestBody!.description).toBe('Line one.\nLine two.');
    });

    it('should leave description undefined when the spec omits it', () => {
      const noDescSpec: OpenAPIDocument = {
        openapi: '3.1.0',
        info: { title: 'No Body Description Test', version: '1.0.0' },
        paths: {
          '/items': {
            post: {
              requestBody: {
                content: {
                  'application/json': {
                    schema: { type: 'object' },
                  },
                },
              },
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      };
      const resolver = makeResolver(noDescSpec);
      const ops = analyzePaths(noDescSpec, resolver);
      expect(ops[0].requestBody).toBeDefined();
      expect(ops[0].requestBody!.description).toBeUndefined();
    });

    it('should carry description resolved through $ref', () => {
      const refSpec: OpenAPIDocument = {
        openapi: '3.1.0',
        info: { title: 'Body Ref Description Test', version: '1.0.0' },
        components: {
          requestBodies: {
            ItemBody: {
              description: 'Referenced body description',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
        paths: {
          '/items': {
            post: {
              requestBody: { $ref: '#/components/requestBodies/ItemBody' },
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      };
      const resolver = makeResolver(refSpec);
      const ops = analyzePaths(refSpec, resolver);
      expect(ops[0].requestBody).toBeDefined();
      expect(ops[0].requestBody!.description).toBe('Referenced body description');
    });
  });
});
