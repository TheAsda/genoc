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

describe('Request Body spec examples', () => {
  describe('application/json body', () => {
    it('generates body type and body arg in method for POST with JSON', () => {
      const doc = createDoc({
        paths: {
          '/users': {
            post: {
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        email: { type: 'string' },
                        age: { type: 'integer' },
                      },
                      required: ['name', 'email'],
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
      const contracts = generateContracts(doc, resolver);

      expect(contracts).toMatchSnapshot();

      const { client } = generateClient(doc, createConfig());
      expect(client).toMatchSnapshot();
    });

    it('generates body type from $ref schema', () => {
      const doc = createDoc({
        components: {
          schemas: {
            CreateUser: {
              type: 'object',
              properties: {
                username: { type: 'string' },
                password: { type: 'string' },
              },
              required: ['username', 'password'],
            },
          },
        },
        paths: {
          '/register': {
            post: {
              requestBody: {
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/CreateUser' },
                  },
                },
              },
              responses: { '201': { description: 'Registered' } },
            },
          },
        },
      });
      const resolver = new RefResolver(doc);
      const contracts = generateContracts(doc, resolver);

      expect(contracts).toMatchSnapshot();
    });
  });

  describe('required body', () => {
    it('non-optional body arg when required: true', () => {
      const doc = createDoc({
        paths: {
          '/orders': {
            post: {
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        productId: { type: 'string' },
                        quantity: { type: 'integer' },
                      },
                      required: ['productId', 'quantity'],
                    },
                  },
                },
              },
              responses: { '201': { description: 'Order created' } },
            },
          },
        },
      });
      const { client } = generateClient(doc, createConfig());

      expect(client).toMatchSnapshot();
    });

    it('optional body arg when required is false or absent', () => {
      const doc = createDoc({
        paths: {
          '/profile': {
            patch: {
              requestBody: {
                required: false,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        bio: { type: 'string' },
                      },
                    },
                  },
                },
              },
              responses: { '200': { description: 'Updated' } },
            },
          },
        },
      });
      const { client } = generateClient(doc, createConfig());

      expect(client).toMatchSnapshot();
    });
  });

  describe('multiple content types', () => {
    it('picks first content type schema for type generation', () => {
      const doc = createDoc({
        paths: {
          '/upload': {
            post: {
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        url: { type: 'string' },
                        metadata: { type: 'string' },
                      },
                      required: ['url'],
                    },
                  },
                  'multipart/form-data': {
                    schema: {
                      type: 'object',
                      properties: {
                        file: { type: 'string', format: 'binary' },
                      },
                      required: ['file'],
                    },
                  },
                },
              },
              responses: { '201': { description: 'Uploaded' } },
            },
          },
        },
      });
      const resolver = new RefResolver(doc);
      const contracts = generateContracts(doc, resolver);

      expect(contracts).toMatchSnapshot();
      // Should NOT contain form-data specific properties
      expect(contracts).not.toContain('FileInput');
    });
  });

  describe('PUT with JSON body', () => {
    it('generates body type and required body argument for full update', () => {
      const doc = createDoc({
        paths: {
          '/users/{userId}': {
            put: {
              parameters: [
                {
                  name: 'userId',
                  in: 'path',
                  required: true,
                  schema: { type: 'string' },
                },
              ],
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        email: { type: 'string' },
                      },
                      required: ['name', 'email'],
                    },
                  },
                },
              },
              responses: { '200': { description: 'Updated' } },
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
});
