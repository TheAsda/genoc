import { describe, it, expect } from 'vitest';

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

function createConfig(overrides?: Partial<GeneratorConfig>): GeneratorConfig {
  return { input: 'test.yaml', outputDir: '/tmp/test', ...overrides };
}

describe('Responses spec examples', () => {
  describe('200 with schema', () => {
    it('generates success response type with typed schema', () => {
      const doc = createDoc({
        components: {
          schemas: {
            User: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                email: { type: 'string' },
              },
              required: ['id', 'name'],
            },
          },
        },
        paths: {
          '/users/{userId}': {
            get: {
              parameters: [
                {
                  name: 'userId',
                  in: 'path',
                  required: true,
                  schema: { type: 'string' },
                },
              ],
              responses: {
                '200': {
                  description: 'User found',
                  content: {
                    'application/json': {
                      schema: { $ref: '#/components/schemas/User' },
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

      const { client } = generateClient(doc, createConfig());
      expect(client).toMatchSnapshot();
    });

    it('generates array response type for list endpoints', () => {
      const doc = createDoc({
        components: {
          schemas: {
            Pet: {
              type: 'object',
              properties: {
                id: { type: 'integer' },
                name: { type: 'string' },
              },
              required: ['id', 'name'],
            },
          },
        },
        paths: {
          '/pets': {
            get: {
              responses: {
                '200': {
                  description: 'List of pets',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/Pet' },
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

  describe('multiple status codes', () => {
    it('generates success type + error types for 200, 400, 404', () => {
      const doc = createDoc({
        components: {
          schemas: {
            Order: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                total: { type: 'number' },
              },
              required: ['id', 'total'],
            },
            ValidationError: {
              type: 'object',
              properties: {
                field: { type: 'string' },
                message: { type: 'string' },
              },
              required: ['field', 'message'],
            },
            NotFoundError: {
              type: 'object',
              properties: {
                resource: { type: 'string' },
              },
              required: ['resource'],
            },
          },
        },
        paths: {
          '/orders/{orderId}': {
            get: {
              parameters: [
                {
                  name: 'orderId',
                  in: 'path',
                  required: true,
                  schema: { type: 'string' },
                },
              ],
              responses: {
                '200': {
                  description: 'Order details',
                  content: {
                    'application/json': {
                      schema: { $ref: '#/components/schemas/Order' },
                    },
                  },
                },
                '400': {
                  description: 'Validation error',
                  content: {
                    'application/json': {
                      schema: { $ref: '#/components/schemas/ValidationError' },
                    },
                  },
                },
                '404': {
                  description: 'Not found',
                  content: {
                    'application/json': {
                      schema: { $ref: '#/components/schemas/NotFoundError' },
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

      const { client } = generateClient(doc, createConfig());
      expect(client).toMatchSnapshot();
    });
  });

  describe('default response', () => {
    it('does not generate typed error for default response', () => {
      const doc = createDoc({
        paths: {
          '/ping': {
            get: {
              responses: {
                '200': { description: 'Pong' },
                default: {
                  description: 'Unexpected error',
                },
              },
            },
          },
        },
      });
      const resolver = new RefResolver(doc);
      const contracts = generateContracts(doc, resolver);

      expect(contracts).not.toContain('ErrorDefault');
      expect(contracts).not.toContain('Errors =');

      const { client } = generateClient(doc, createConfig());
      expect(contracts).toMatchSnapshot();
      expect(client).toMatchSnapshot();
    });

    it('default response alongside explicit error codes keeps explicit errors only', () => {
      const doc = createDoc({
        paths: {
          '/tasks': {
            get: {
              responses: {
                '200': { description: 'Task list' },
                '401': { description: 'Unauthorized' },
                default: { description: 'Error' },
              },
            },
          },
        },
      });
      const resolver = new RefResolver(doc);
      const contracts = generateContracts(doc, resolver);

      expect(contracts).toMatchSnapshot();
      expect(contracts).not.toContain('ErrorDefault');
    });
  });

  describe('response with headers', () => {
    it('generates response type even when headers are present', () => {
      const doc = createDoc({
        paths: {
          '/download': {
            get: {
              responses: {
                '200': {
                  description: 'File download',
                  headers: {
                    'X-Rate-Limit': {
                      schema: { type: 'integer' },
                      description: 'Rate limit remaining',
                    },
                    'X-Request-Id': {
                      schema: { type: 'string' },
                    },
                  },
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          url: { type: 'string' },
                        },
                        required: ['url'],
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

  describe('204 No Content', () => {
    it('uses void for 204 responses', () => {
      const doc = createDoc({
        paths: {
          '/cache': {
            delete: {
              responses: {
                '204': { description: 'Cache cleared' },
              },
            },
          },
        },
      });
      const { client } = generateClient(doc, createConfig());

      expect(client).toMatchSnapshot();
    });
  });

  describe('multiple success status codes', () => {
    it('unions multiple 2xx response schemas', () => {
      const doc = createDoc({
        components: {
          schemas: {
            AsyncTask: {
              type: 'object',
              properties: {
                taskId: { type: 'string' },
                status: { type: 'string' },
              },
              required: ['taskId', 'status'],
            },
          },
        },
        paths: {
          '/jobs': {
            post: {
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: { command: { type: 'string' } },
                      required: ['command'],
                    },
                  },
                },
              },
              responses: {
                '201': {
                  description: 'Job created',
                  content: {
                    'application/json': {
                      schema: { $ref: '#/components/schemas/AsyncTask' },
                    },
                  },
                },
                '202': {
                  description: 'Job accepted',
                  content: {
                    'application/json': {
                      schema: { $ref: '#/components/schemas/AsyncTask' },
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
});
