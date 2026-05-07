import { readFile, rm, stat, mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { describe, expect, it } from 'vitest';

import { generateClient, generateFullOutput } from '../../src/generator/client-generator.js';
import type { GeneratorConfig } from '../../src/types/client.js';
import type { OpenAPIDocument } from '../../src/types/openapi.js';

function createDoc(overrides?: Partial<OpenAPIDocument>): OpenAPIDocument {
  return {
    openapi: '3.1.0',
    info: { title: 'Test API', version: '1.0.0' },
    ...overrides,
  };
}

function createConfig(overrides?: Partial<GeneratorConfig>): GeneratorConfig {
  return {
    input: 'test.yaml',
    outputDir: '/tmp/test-output',
    ...overrides,
  };
}

describe('generateClient', () => {
  describe('return value structure', () => {
    it('returns object with contracts and client strings', async () => {
      const doc = createDoc();
      const config = createConfig();
      const result = generateClient(doc, config);
      expect(result).toHaveProperty('contracts');
      expect(result).toHaveProperty('client');
      expect(typeof result.contracts).toBe('string');
      expect(typeof result.client).toBe('string');
      expect(result.contracts).toMatchSnapshot();
      expect(result.client).toMatchSnapshot();
    });
  });

  describe('contracts file', () => {
    it('includes auto-generated header comment', async () => {
      const doc = createDoc();
      const config = createConfig();
      const { contracts } = generateClient(doc, config);
      expect(contracts).toMatchSnapshot();
    });

    it('includes ApiError class', async () => {
      const doc = createDoc();
      const config = createConfig();
      const { contracts } = generateClient(doc, config);
      expect(contracts).toMatchSnapshot();
    });

    it('includes schema types from components/schemas', async () => {
      const doc = createDoc({
        components: {
          schemas: {
            Product: {
              type: 'object',
              properties: { name: { type: 'string' } },
            },
          },
        },
      });
      const config = createConfig();
      const { contracts } = generateClient(doc, config);
      expect(contracts).toMatchSnapshot();
    });

    it('includes operation-derived types', async () => {
      const doc = createDoc({
        components: {
          schemas: {
            Product: {
              type: 'object',
              properties: { name: { type: 'string' } },
            },
          },
        },
        paths: {
          '/api/v1/products': {
            get: {
              parameters: [{ name: 'page', in: 'query', schema: { type: 'integer' } }],
              responses: {
                '200': {
                  description: 'OK',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/Product' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });
      const config = createConfig();
      const { contracts } = generateClient(doc, config);
      expect(contracts).toMatchSnapshot();
    });
  });

  describe('client file', () => {
    it('includes auto-generated header comment', async () => {
      const doc = createDoc();
      const config = createConfig();
      const { client } = generateClient(doc, config);
      expect(client).toMatchSnapshot();
    });

    it('includes Requester type definition', async () => {
      const doc = createDoc();
      const config = createConfig();
      const { client } = generateClient(doc, config);
      expect(client).toMatchSnapshot();
    });

    it('includes createClient function', async () => {
      const doc = createDoc();
      const config = createConfig();
      const { client } = generateClient(doc, config);
      expect(client).toMatchSnapshot();
    });

    it('includes ApiClient type export', async () => {
      const doc = createDoc();
      const config = createConfig();
      const { client } = generateClient(doc, config);
      expect(client).toMatchSnapshot();
    });

    it('returns empty object when no operations exist', async () => {
      const doc = createDoc();
      const config = createConfig();
      const { client } = generateClient(doc, config);
      expect(client).toMatchSnapshot();
    });

    it('does not include type-only import statement when no types are needed', async () => {
      const doc = createDoc();
      const config = createConfig();
      const { client } = generateClient(doc, config);
      expect(client).not.toContain('import type');
      expect(client).toMatchSnapshot();
    });
  });

  describe('import statement', () => {
    it('imports types from contracts file with .js extension', async () => {
      const doc = createDoc({
        paths: {
          '/api/v1/products': {
            get: {
              parameters: [{ name: 'page', in: 'query', schema: { type: 'integer' } }],
              responses: {
                '200': { description: 'OK' },
                '400': { description: 'Bad Request' },
              },
            },
          },
        },
      });
      const config = createConfig();
      const { client } = generateClient(doc, config);
      expect(client).toMatchSnapshot();
    });

    it('only imports types actually used by methods', async () => {
      const doc = createDoc({
        paths: {
          '/api/v1/products': {
            get: {
              responses: {
                '200': {
                  description: 'OK',
                  content: {
                    'application/json': {
                      schema: { type: 'object', properties: { name: { type: 'string' } } },
                    },
                  },
                },
              },
            },
          },
        },
      });
      const config = createConfig();
      const { client } = generateClient(doc, config);
      expect(client).not.toContain('Query');
      expect(client).not.toContain('Body');
      expect(client).toMatchSnapshot();
    });

    it('handles error responses with status-specific checks', async () => {
      const doc = createDoc({
        paths: {
          '/items': {
            get: {
              responses: {
                '200': { description: 'OK' },
                '400': { description: 'Bad Request' },
              },
            },
          },
        },
      });
      const config = createConfig();
      const { client } = generateClient(doc, config);
      expect(client).toMatchSnapshot();
    });

    it('does not generate status-specific error checks when no error responses', async () => {
      const doc = createDoc({
        paths: {
          '/items': {
            get: {
              responses: {
                '200': { description: 'OK' },
              },
            },
          },
        },
      });
      const config = createConfig();
      const { client } = generateClient(doc, config);
      expect(client).not.toContain('GetItemsError');
      expect(client).toMatchSnapshot();
    });
  });

  describe('method generation', () => {
    it('generates GET method with query params', async () => {
      const doc = createDoc({
        paths: {
          '/api/v1/products': {
            get: {
              parameters: [{ name: 'page', in: 'query', schema: { type: 'integer' } }],
              responses: {
                '200': {
                  description: 'OK',
                  content: {
                    'application/json': {
                      schema: { type: 'array', items: { type: 'string' } },
                    },
                  },
                },
              },
            },
          },
        },
      });
      const config = createConfig();
      const { client } = generateClient(doc, config);
      expect(client).toMatchSnapshot();
    });

    it('generates POST method with request body', async () => {
      const doc = createDoc({
        paths: {
          '/api/v1/products': {
            post: {
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
              responses: {
                '201': {
                  description: 'Created',
                  content: {
                    'application/json': {
                      schema: { type: 'object', properties: { id: { type: 'string' } } },
                    },
                  },
                },
              },
            },
          },
        },
      });
      const config = createConfig();
      const { client } = generateClient(doc, config);
      expect(client).toMatchSnapshot();
    });

    it('generates method with path parameters', async () => {
      const doc = createDoc({
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
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      });
      const config = createConfig();
      const { client } = generateClient(doc, config);
      expect(client).toMatchSnapshot();
    });

    it('generates method with error status checks', async () => {
      const doc = createDoc({
        components: {
          schemas: {
            ErrorBody: {
              type: 'object',
              properties: { message: { type: 'string' } },
            },
          },
        },
        paths: {
          '/items': {
            get: {
              responses: {
                '200': { description: 'OK' },
                '400': {
                  description: 'Bad Request',
                  content: {
                    'application/json': {
                      schema: { $ref: '#/components/schemas/ErrorBody' },
                    },
                  },
                },
              },
            },
          },
        },
      });
      const config = createConfig();
      const { client } = generateClient(doc, config);
      expect(client).toMatchSnapshot();
    });

    it('uses void for 204 No Content responses', async () => {
      const doc = createDoc({
        paths: {
          '/items/{id}': {
            delete: {
              parameters: [
                {
                  name: 'id',
                  in: 'path',
                  required: true,
                  schema: { type: 'string' },
                },
              ],
              responses: { '204': { description: 'No Content' } },
            },
          },
        },
      });
      const config = createConfig();
      const { client } = generateClient(doc, config);
      expect(client).toMatchSnapshot();
    });

    it('uses single-generic requester for operations with no error responses', async () => {
      const doc = createDoc({
        paths: {
          '/health': {
            get: {
              responses: {
                '200': {
                  description: 'OK',
                  content: {
                    'application/json': {
                      schema: { type: 'object', properties: { status: { type: 'string' } } },
                    },
                  },
                },
              },
            },
          },
        },
      });
      const config = createConfig();
      const { client } = generateClient(doc, config);
      expect(client).toMatchSnapshot();
    });

    it('includes JSDoc for methods with summary', async () => {
      const doc = createDoc({
        paths: {
          '/products': {
            get: {
              summary: 'List all products',
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      });
      const config = createConfig();
      const { client } = generateClient(doc, config);
      expect(client).toMatchSnapshot();
    });

    it('includes @deprecated tag for deprecated operations', async () => {
      const doc = createDoc({
        paths: {
          '/old-endpoint': {
            get: {
              deprecated: true,
              summary: 'Old endpoint',
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      });
      const config = createConfig();
      const { client } = generateClient(doc, config);
      expect(client).toMatchSnapshot();
    });

    it('separates methods with commas', async () => {
      const doc = createDoc({
        paths: {
          '/products': {
            get: {
              responses: { '200': { description: 'OK' } },
            },
            post: {
              requestBody: {
                content: {
                  'application/json': {
                    schema: { type: 'object', properties: {} },
                  },
                },
              },
              responses: { '201': { description: 'Created' } },
            },
          },
        },
      });
      const config = createConfig();
      const { client } = generateClient(doc, config);
      expect(client).toMatchSnapshot();
    });

    it('uses path template literal in requester call', async () => {
      const doc = createDoc({
        paths: {
          '/api/v1/products': {
            get: {
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      });
      const config = createConfig();
      const { client } = generateClient(doc, config);
      expect(client).toMatchSnapshot();
    });

    it('uses uppercase HTTP method in requester call', async () => {
      const doc = createDoc({
        paths: {
          '/items': {
            post: {
              requestBody: {
                content: {
                  'application/json': {
                    schema: { type: 'object', properties: {} },
                  },
                },
              },
              responses: { '201': { description: 'Created' } },
            },
          },
        },
      });
      const config = createConfig();
      const { client } = generateClient(doc, config);
      expect(client).toMatchSnapshot();
    });

    it('generates void return for 200 no-content', async () => {
      const doc = createDoc({
        paths: {
          '/items/{id}': {
            delete: {
              parameters: [
                {
                  name: 'id',
                  in: 'path',
                  required: true,
                  schema: { type: 'string' },
                },
              ],
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      });
      const config = createConfig();
      const { client } = generateClient(doc, config);
      expect(client).toMatchSnapshot();
    });

    it('generates error handling try/catch', async () => {
      const doc = createDoc({
        paths: {
          '/items': {
            get: {
              responses: {
                '200': { description: 'OK' },
                '400': { description: 'Bad Request' },
              },
            },
          },
        },
      });
      const config = createConfig();
      const { client } = generateClient(doc, config);
      expect(client).toMatchSnapshot();
    });
  });

  describe('output file naming', () => {
    it('uses fixed contracts.ts import path regardless of title', async () => {
      const doc = createDoc({
        paths: {
          '/items': {
            get: {
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      });
      doc.info.title = 'My Cool API';
      const config = createConfig();
      const { client } = generateClient(doc, config);
      expect(client).toMatchSnapshot();
    });

    it('uses fixed contracts.ts import path when title is empty', async () => {
      const doc = createDoc({
        info: { title: '', version: '1.0.0' },
        paths: {
          '/items': {
            get: {
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      });
      const config = createConfig();
      const { client } = generateClient(doc, config);
      expect(client).toMatchSnapshot();
    });

    it('uses fixed contracts.ts import path regardless of special characters', async () => {
      const doc = createDoc({
        paths: {
          '/items': {
            get: {
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      });
      doc.info.title = 'Store API v2.0!';
      const config = createConfig();
      const { client } = generateClient(doc, config);
      expect(client).toMatchSnapshot();
    });
  });

  describe('methodNameStrategy', () => {
    it('uses path-based strategy by default', async () => {
      const doc = createDoc({
        paths: {
          '/api/v1/products': {
            get: {
              operationId: 'listProducts',
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      });
      const config = createConfig();
      const { client } = generateClient(doc, config);
      expect(client).toMatchSnapshot();
    });

    it('uses operationId strategy when configured', async () => {
      const doc = createDoc({
        paths: {
          '/api/v1/products': {
            get: {
              operationId: 'listProducts',
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      });
      const config = createConfig({ methodNameStrategy: 'operationId' });
      const { client } = generateClient(doc, config);
      expect(client).toMatchSnapshot();
    });
  });

  describe('full integration', () => {
    it('generates complete client from multi-operation spec', async () => {
      const doc: OpenAPIDocument = {
        openapi: '3.1.0',
        info: { title: 'Store API', version: '1.0.0' },
        components: {
          schemas: {
            Product: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                price: { type: 'number' },
              },
              required: ['id', 'name', 'price'],
            },
            CreateProductInput: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                price: { type: 'number' },
              },
              required: ['name', 'price'],
            },
            ErrorBody: {
              type: 'object',
              properties: {
                code: { type: 'integer' },
                message: { type: 'string' },
              },
              required: ['code', 'message'],
            },
          },
        },
        paths: {
          '/api/v1/products': {
            get: {
              summary: 'List products',
              parameters: [
                {
                  name: 'page',
                  in: 'query',
                  schema: { type: 'integer' },
                },
              ],
              responses: {
                '200': {
                  description: 'Product list',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/Product' },
                      },
                    },
                  },
                },
                '400': {
                  description: 'Bad request',
                  content: {
                    'application/json': {
                      schema: { $ref: '#/components/schemas/ErrorBody' },
                    },
                  },
                },
              },
            },
            post: {
              summary: 'Create product',
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      $ref: '#/components/schemas/CreateProductInput',
                    },
                  },
                },
              },
              responses: {
                '201': {
                  description: 'Created',
                  content: {
                    'application/json': {
                      schema: { $ref: '#/components/schemas/Product' },
                    },
                  },
                },
                '400': {
                  description: 'Bad request',
                  content: {
                    'application/json': {
                      schema: { $ref: '#/components/schemas/ErrorBody' },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const config = createConfig();
      const { contracts, client } = generateClient(doc, config);

      expect(contracts).toMatchSnapshot();
      expect(client).toMatchSnapshot();
    });
  });

  describe('error narrowing utilities', () => {
    it('generates decorateWithErrors with __definedErrors key', () => {
      const doc = createDoc({
        paths: {
          '/items': {
            get: {
              responses: {
                '200': { description: 'OK' },
                '400': { description: 'Bad Request' },
              },
            },
          },
        },
      });
      const config = createConfig();
      const { client } = generateClient(doc, config);
      expect(client).toMatchSnapshot();
    });

    it('generates decorateWithErrors function', () => {
      const doc = createDoc({
        paths: {
          '/items': {
            get: {
              responses: {
                '200': { description: 'OK' },
                '400': { description: 'Bad Request' },
              },
            },
          },
        },
      });
      const config = createConfig();
      const { client } = generateClient(doc, config);
      expect(client).toMatchSnapshot();
    });

    it('generates isDefinedError type guard', () => {
      const doc = createDoc({
        paths: {
          '/items': {
            get: {
              responses: {
                '200': { description: 'OK' },
                '400': { description: 'Bad Request' },
              },
            },
          },
        },
      });
      const config = createConfig();
      const { client } = generateClient(doc, config);
      expect(client).toMatchSnapshot();
    });

    it('isDefinedError excludes UnspecifiedApiError', () => {
      const doc = createDoc({
        paths: {
          '/items': {
            get: {
              responses: {
                '200': { description: 'OK' },
                '400': { description: 'Bad Request' },
              },
            },
          },
        },
      });
      const config = createConfig();
      const { client } = generateClient(doc, config);
      expect(client).toMatchSnapshot();
    });

    it('uses arrow syntax with decorateWithErrors for methods', () => {
      const doc = createDoc({
        paths: {
          '/items': {
            get: {
              responses: {
                '200': { description: 'OK' },
                '400': { description: 'Bad Request' },
              },
            },
          },
        },
      });
      const config = createConfig();
      const { client } = generateClient(doc, config);
      expect(client).not.toContain('async getItems(');
      expect(client).toMatchSnapshot();
    });

    it('generates error status code arrays per method', () => {
      const doc = createDoc({
        paths: {
          '/items': {
            get: {
              responses: {
                '200': { description: 'OK' },
                '400': { description: 'Bad Request' },
                '500': { description: 'Internal Server Error' },
              },
            },
          },
        },
      });
      const config = createConfig();
      const { client } = generateClient(doc, config);
      expect(client).toMatchSnapshot();
    });

    it('generates empty array for routes with no errors', () => {
      const doc = createDoc({
        paths: {
          '/health': {
            get: {
              responses: {
                '200': { description: 'OK' },
              },
            },
          },
        },
      });
      const config = createConfig();
      const { client } = generateClient(doc, config);
      expect(client).toMatchSnapshot();
    });

    it('imports error union types from contracts', () => {
      const doc = createDoc({
        paths: {
          '/items': {
            get: {
              responses: {
                '200': { description: 'OK' },
                '400': { description: 'Bad Request' },
                '500': { description: 'Internal Server Error' },
              },
            },
          },
        },
      });
      const config = createConfig();
      const { client } = generateClient(doc, config);
      expect(client).toMatchSnapshot();
    });
  });
});

describe('generateFullOutput', () => {
  it('writes contracts and client files to disk', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'client-gen-test-'));

    try {
      const doc = createDoc({
        paths: {
          '/items': {
            get: {
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      });
      const config = createConfig({ outputDir: tmpDir });

      await generateFullOutput(doc, config);

      const contractsPath = join(tmpDir, 'contracts.ts');
      const clientPath = join(tmpDir, 'client.ts');

      const contractsStat = await stat(contractsPath);
      const clientStat = await stat(clientPath);

      expect(contractsStat.isFile()).toBe(true);
      expect(clientStat.isFile()).toBe(true);

      const contractsContent = await readFile(contractsPath, 'utf-8');
      const clientContent = await readFile(clientPath, 'utf-8');

      expect(contractsContent).toContain(
        '// Auto-generated by genoc from OpenAPI 3.1.0 spec. DO NOT EDIT.'
      );
      expect(contractsContent).toContain('export class ApiError');

      expect(clientContent).toContain(
        '// Auto-generated by genoc from OpenAPI 3.1.0 spec. DO NOT EDIT.'
      );
      expect(clientContent).toContain('export function createClient');
      expect(clientContent).toContain("from './contracts.js'");
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('creates output directory if it does not exist', async () => {
    const tmpDir = join(await mkdtemp(join(tmpdir(), 'client-gen-test-')), 'nested', 'output');

    try {
      const doc = createDoc();
      const config = createConfig({ outputDir: tmpDir });

      await generateFullOutput(doc, config);

      const contractsStat = await stat(join(tmpDir, 'contracts.ts'));
      expect(contractsStat.isFile()).toBe(true);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('writes files with fixed names regardless of spec title', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'client-gen-test-'));

    try {
      const doc = createDoc({
        paths: {
          '/pets': {
            get: {
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      });
      doc.info.title = 'Pet Store';

      const config = createConfig({ outputDir: tmpDir });

      await generateFullOutput(doc, config);

      const contractsStat = await stat(join(tmpDir, 'contracts.ts'));
      const clientStat = await stat(join(tmpDir, 'client.ts'));

      expect(contractsStat.isFile()).toBe(true);
      expect(clientStat.isFile()).toBe(true);

      const clientContent = await readFile(join(tmpDir, 'client.ts'), 'utf-8');
      expect(clientContent).toContain("from './contracts.js'");
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});
