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

describe('Parameter Object spec examples', () => {
  describe('path parameter with style simple (default)', () => {
    it('generates flat string argument in method for /users/{userId}', () => {
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
              responses: { '200': { description: 'User found' } },
            },
          },
        },
      });
      const resolver = new RefResolver(doc);

      // Contracts: no query type generated for path-only params
      const contracts = generateContracts(doc, resolver);
      expect(contracts).not.toContain('Query =');

      // Client: path param becomes flat string argument in method signature
      const { client } = generateClient(doc, createConfig());
      expect(contracts).toMatchSnapshot();
      expect(client).toMatchSnapshot();
    });
  });

  describe('query parameter with style form (default)', () => {
    it('generates grouped query object type for page and limit params', () => {
      const doc = createDoc({
        paths: {
          '/users': {
            get: {
              parameters: [
                {
                  name: 'page',
                  in: 'query',
                  schema: { type: 'integer' },
                },
                {
                  name: 'limit',
                  in: 'query',
                  schema: { type: 'integer' },
                },
              ],
              responses: { '200': { description: 'User list' } },
            },
          },
        },
      });
      const resolver = new RefResolver(doc);
      const contracts = generateContracts(doc, resolver);

      expect(contracts).toMatchSnapshot();

      // Client method receives query object
      const { client } = generateClient(doc, createConfig());
      expect(client).toMatchSnapshot();
    });
  });

  describe('required vs optional parameters', () => {
    it('marks required params without ? and optional params with ?', () => {
      const doc = createDoc({
        paths: {
          '/search': {
            get: {
              parameters: [
                {
                  name: 'q',
                  in: 'query',
                  required: true,
                  schema: { type: 'string' },
                },
                {
                  name: 'sort',
                  in: 'query',
                  required: false,
                  schema: { type: 'string' },
                },
                {
                  name: 'filter',
                  in: 'query',
                  // `required` absent → optional
                  schema: { type: 'string' },
                },
              ],
              responses: { '200': { description: 'Search results' } },
            },
          },
        },
      });
      const resolver = new RefResolver(doc);
      const contracts = generateContracts(doc, resolver);

      expect(contracts).toMatchSnapshot();
      // required: true → non-optional
      expect(contracts).not.toMatch(/q\?:/);

      // Client: not all optional, so query is required arg
      const { client } = generateClient(doc, createConfig());
      expect(client).toMatchSnapshot();
    });

    it('makes path params always required regardless of explicit setting', () => {
      const doc = createDoc({
        paths: {
          '/items/{itemId}': {
            get: {
              parameters: [
                {
                  name: 'itemId',
                  in: 'path',
                  // `required` not set — path params are always required
                  schema: { type: 'string' },
                },
              ],
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      });
      const { client } = generateClient(doc, createConfig());
      expect(client).toMatchSnapshot();
    });
  });

  describe('header parameter', () => {
    it('header params appear in method signature', () => {
      const doc = createDoc({
        paths: {
          '/data': {
            get: {
              parameters: [
                {
                  name: 'X-Request-Id',
                  in: 'header',
                  schema: { type: 'string' },
                },
                {
                  name: 'page',
                  in: 'query',
                  schema: { type: 'integer' },
                },
              ],
              responses: { '200': { description: 'OK' } },
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

  describe('cookie parameter', () => {
    it('cookie params do NOT appear in method signature', () => {
      const doc = createDoc({
        paths: {
          '/session': {
            get: {
              parameters: [
                {
                  name: 'session_id',
                  in: 'cookie',
                  schema: { type: 'string' },
                },
              ],
              responses: { '200': { description: 'Session info' } },
            },
          },
        },
      });
      const resolver = new RefResolver(doc);
      const contracts = generateContracts(doc, resolver);

      // No query type generated for cookie-only params
      expect(contracts).not.toContain('Query =');

      // Client method has no cookie arguments
      const { client } = generateClient(doc, createConfig());
      expect(contracts).toMatchSnapshot();
      expect(client).toMatchSnapshot();
      expect(client).not.toContain('session_id');
    });
  });

  describe('mixed parameter locations', () => {
    it('separates path, query, and header params correctly', () => {
      const doc = createDoc({
        paths: {
          '/orgs/{orgId}/users/{userId}': {
            get: {
              parameters: [
                {
                  name: 'orgId',
                  in: 'path',
                  required: true,
                  schema: { type: 'string' },
                },
                {
                  name: 'userId',
                  in: 'path',
                  required: true,
                  schema: { type: 'string' },
                },
                {
                  name: 'X-Api-Key',
                  in: 'header',
                  required: true,
                  schema: { type: 'string' },
                },
                {
                  name: 'include',
                  in: 'query',
                  schema: { type: 'string' },
                },
                {
                  name: 'fields',
                  in: 'query',
                  schema: { type: 'string' },
                },
              ],
              responses: { '200': { description: 'User details' } },
            },
          },
        },
      });
      const resolver = new RefResolver(doc);
      const contracts = generateContracts(doc, resolver);

      expect(contracts).toMatchSnapshot();
      // No path params in query type
      expect(contracts).not.toContain('orgId');

      // Client: path params as flat args + query object + headers object
      const { client } = generateClient(doc, createConfig());
      expect(client).toMatchSnapshot();
    });
  });
});
