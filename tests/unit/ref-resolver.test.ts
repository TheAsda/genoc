import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { RefResolver } from '../../src/parser/ref-resolver.js';
import type { OpenAPIDocument } from '../../src/types/openapi.js';

function loadFixture(name: string): OpenAPIDocument {
  const raw = readFileSync(join(__dirname, '..', 'fixtures', name), 'utf-8');
  return JSON.parse(raw) as OpenAPIDocument;
}

describe('RefResolver', () => {
  const doc = loadFixture('refs-spec.json');
  const resolver = new RefResolver(doc);

  describe('resolveRef', () => {
    it('resolves a simple $ref to User schema', () => {
      const result = resolver.resolveRef('#/components/schemas/User') as Record<string, unknown>;
      expect(result).toBeDefined();
      expect(result.type).toBe('object');
      expect(result.properties).toBeDefined();
    });

    it('resolves a $ref to Country schema', () => {
      const result = resolver.resolveRef('#/components/schemas/Country') as Record<string, unknown>;
      expect(result.type).toBe('object');
      expect((result.properties as Record<string, unknown>).name).toBeDefined();
    });

    it('resolves chained refs (ChainA → ChainB → ChainC)', () => {
      const result = resolver.resolveRef('#/components/schemas/ChainA') as Record<string, unknown>;
      expect(result.type).toBe('string');
    });

    it('resolves JSON Pointer escapes (#/paths/~1users/get)', () => {
      const result = resolver.resolveRef('#/paths/~1users/get') as Record<string, unknown>;
      expect(result).toBeDefined();
      expect(result.operationId).toBe('listUsers');
    });

    it('throws descriptive error for circular refs', () => {
      expect(() => resolver.resolveRef('#/components/schemas/CircularA')).toThrow(
        /Circular \$ref detected/
      );
    });

    it('includes cycle path in circular ref error', () => {
      try {
        resolver.resolveRef('#/components/schemas/CircularA');
        expect.unreachable('Should have thrown');
      } catch (err) {
        const message = (err as Error).message;
        expect(message).toContain('#/components/schemas/CircularA');
        expect(message).toContain('#/components/schemas/CircularB');
        expect(message).toContain('->');
      }
    });

    it('throws error for external https $ref', () => {
      expect(() => resolver.resolveRef('#/components/schemas/ExternalRef')).toThrow(
        /External \$ref resolution is not supported/
      );
    });

    it('throws error for direct external $ref string', () => {
      expect(() => resolver.resolveRef('https://example.com/schemas/model.json')).toThrow(
        /External \$ref resolution is not supported/
      );
    });

    it('throws error for non-#-prefixed ref', () => {
      expect(() => resolver.resolveRef('some/relative/path.json')).toThrow(
        /External \$ref resolution is not supported/
      );
    });

    it('throws error for missing ref target', () => {
      expect(() => resolver.resolveRef('#/components/schemas/NonExistent')).toThrow(
        /could not be resolved/
      );
    });

    it('enforces depth limit at 10 hops', () => {
      expect(() => resolver.resolveRef('#/components/schemas/Depth1')).toThrow(
        /Maximum \$ref depth \(10\) exceeded/
      );
    });

    it('resolves at exactly 9 hops without error', () => {
      const result = resolver.resolveRef('#/components/schemas/Depth2') as Record<string, unknown>;
      expect(result.type).toBe('boolean');
    });
  });

  describe('resolve', () => {
    it('resolves a ReferenceObject', () => {
      const input = { $ref: '#/components/schemas/Country' };
      const result = resolver.resolve(input) as Record<string, unknown>;
      expect(result.type).toBe('object');
    });

    it('passes through non-$ref objects unchanged', () => {
      const input = { type: 'string', description: 'A string' };
      const result = resolver.resolve(input);
      expect(result).toBe(input);
    });

    it('passes through null without error', () => {
      const result = resolver.resolve(null);
      expect(result).toBeNull();
    });
  });

  describe('resolveSchema', () => {
    it('resolves a schema ReferenceObject to SchemaObject', () => {
      const input = { $ref: '#/components/schemas/User' };
      const result = resolver.resolveSchema(input);
      expect(result.type).toBe('object');
      expect(result.properties).toBeDefined();
    });

    it('resolves chained schema refs to final SchemaObject', () => {
      const input = { $ref: '#/components/schemas/ChainA' };
      const result = resolver.resolveSchema(input);
      expect(result.type).toBe('string');
    });

    it('returns plain SchemaObject unchanged', () => {
      const input = { type: 'number' };
      const result = resolver.resolveSchema(input);
      expect(result).toBe(input);
    });
  });

  describe('document immutability', () => {
    it('does not mutate the original document', () => {
      const originalJson = JSON.stringify(doc);
      resolver.resolveRef('#/components/schemas/User');
      resolver.resolveRef('#/components/schemas/ChainA');
      resolver.resolveRef('#/paths/~1users/get');
      expect(JSON.stringify(doc)).toBe(originalJson);
    });
  });
});
