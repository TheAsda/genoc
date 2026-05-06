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

describe('Operation Object examples', () => {
  describe('operationId usage', () => {
    it('uses path-based name by default and ignores operationId', () => {
      const doc = createDoc({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      });

      const { client } = generateClient(doc, makeConfig());
      expect(client).toContain('getUsers');
      expect(client).not.toContain('listUsers');
    });

    it('uses operationId as method name with operationId strategy', () => {
      const doc = createDoc({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      });

      const { client } = generateClient(doc, makeConfig({ methodNameStrategy: 'operationId' }));
      expect(client).toContain('listUsers');
    });

    it('falls back to path-based when operationId-with-fallback and no operationId', () => {
      const doc = createDoc({
        paths: {
          '/users': {
            get: {
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      });

      const { client } = generateClient(
        doc,
        makeConfig({ methodNameStrategy: 'operationId-with-fallback' })
      );
      expect(client).toContain('getUsers');
    });

    it('prefers operationId with operationId-with-fallback strategy when available', () => {
      const doc = createDoc({
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      });

      const { client } = generateClient(
        doc,
        makeConfig({ methodNameStrategy: 'operationId-with-fallback' })
      );
      expect(client).toContain('listUsers');
    });

    it('throws when operationId strategy is used without operationId', () => {
      const doc = createDoc({
        paths: {
          '/users': {
            get: {
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      });

      expect(() => generateClient(doc, makeConfig({ methodNameStrategy: 'operationId' }))).toThrow(
        /Operation ID is required/
      );
    });
  });

  describe('deprecated operation', () => {
    it('includes @deprecated JSDoc tag for deprecated operations', () => {
      const doc = createDoc({
        paths: {
          '/legacy': {
            get: {
              deprecated: true,
              summary: 'Legacy endpoint',
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      });

      const { client } = generateClient(doc, makeConfig());
      expect(client).toContain('@deprecated');
    });

    it('does not include @deprecated for non-deprecated operations', () => {
      const doc = createDoc({
        paths: {
          '/current': {
            get: {
              summary: 'Current endpoint',
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      });

      const { client } = generateClient(doc, makeConfig());
      expect(client).not.toContain('@deprecated');
    });

    it('preserves deprecated flag in analyzed operation', () => {
      const doc = createDoc({
        paths: {
          '/legacy': {
            get: {
              deprecated: true,
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      });

      const resolver = new RefResolver(doc);
      const operations = analyzePaths(doc, resolver);

      expect(operations).toHaveLength(1);
      expect(operations[0].deprecated).toBe(true);
    });
  });

  describe('tags', () => {
    it('preserves tags in analyzed operation', () => {
      const doc = createDoc({
        paths: {
          '/users': {
            get: {
              tags: ['users', 'admin'],
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      });

      const resolver = new RefResolver(doc);
      const operations = analyzePaths(doc, resolver);

      expect(operations).toHaveLength(1);
      expect(operations[0].tags).toEqual(['users', 'admin']);
    });

    it('defaults to empty tags array when no tags specified', () => {
      const doc = createDoc({
        paths: {
          '/health': {
            get: {
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      });

      const resolver = new RefResolver(doc);
      const operations = analyzePaths(doc, resolver);

      expect(operations).toHaveLength(1);
      expect(operations[0].tags).toEqual([]);
    });
  });

  describe('summary and description', () => {
    it('includes both summary and description in JSDoc when both present', () => {
      const doc = createDoc({
        paths: {
          '/users': {
            get: {
              summary: 'List all users',
              description: 'Returns a paginated list of all registered users in the system.',
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      });

      const { client } = generateClient(doc, makeConfig());
      expect(client).toContain('List all users');
      expect(client).toContain('Returns a paginated list of all registered users in the system.');
    });

    it('includes only summary in JSDoc when description is absent', () => {
      const doc = createDoc({
        paths: {
          '/users': {
            get: {
              summary: 'List all users',
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      });

      const { client } = generateClient(doc, makeConfig());
      expect(client).toContain('List all users');
    });

    it('includes only description in JSDoc when summary is absent', () => {
      const doc = createDoc({
        paths: {
          '/users': {
            get: {
              description: 'Returns all registered users.',
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      });

      const { client } = generateClient(doc, makeConfig());
      expect(client).toContain('Returns all registered users.');
    });

    it('preserves summary and description in analyzed operation', () => {
      const doc = createDoc({
        paths: {
          '/users': {
            get: {
              summary: 'List users',
              description: 'Detailed description',
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      });

      const resolver = new RefResolver(doc);
      const operations = analyzePaths(doc, resolver);

      expect(operations[0].summary).toBe('List users');
      expect(operations[0].description).toBe('Detailed description');
    });

    it('does not duplicate summary when description equals summary', () => {
      const doc = createDoc({
        paths: {
          '/ping': {
            get: {
              summary: 'Health check',
              description: 'Health check',
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      });

      const { client } = generateClient(doc, makeConfig());

      const pingBlock = client.substring(
        client.indexOf('Health check'),
        client.indexOf('Health check') + 200
      );
      const healthCheckCount = pingBlock.split('Health check').length - 1;
      expect(healthCheckCount).toBe(1);
    });
  });
});
