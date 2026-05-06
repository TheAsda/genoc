/**
 * Spec-Example Tests — OpenAPI 3.0 File Upload (format: binary / byte)
 *
 * In OpenAPI 3.0, `format: "binary"` and `format: "byte"` on string schemas
 * indicate binary data handling. The generator maps these to string types.
 *
 * Covers:
 * - format: "binary" on string → string type
 * - format: "byte" on string → string type
 * - Binary in multipart/form-data request body
 * - Binary in response content
 * - Multiple file upload fields
 */
import { describe, expect, it } from 'vitest';

import { generateContracts } from '../../../src/generator/contracts-generator.js';
import { RefResolver } from '../../../src/parser/ref-resolver.js';
import type { OpenAPIDocument } from '../../../src/types/openapi.js';

function createDoc(overrides?: Partial<OpenAPIDocument>): OpenAPIDocument {
  return {
    openapi: '3.0.3',
    info: { title: 'Test', version: '1.0.0' },
    paths: {},
    ...overrides,
  };
}

function makeResolver(doc: OpenAPIDocument): RefResolver {
  return new RefResolver(doc);
}

describe('OpenAPI 3.0 — file upload (format: binary / byte)', () => {
  // ────────────────────────────────────────────────────────────────────────
  // 1. Schema-level format
  // ────────────────────────────────────────────────────────────────────────
  describe('schema-level format', () => {
    it('generates string type for format: binary', () => {
      const doc = createDoc({
        components: {
          schemas: {
            FileData: { type: 'string', format: 'binary' },
          },
        },
      });
      const result = generateContracts(doc, makeResolver(doc));
      expect(result).toContain('export type FileData = string;');
    });

    it('generates string type for format: byte', () => {
      const doc = createDoc({
        components: {
          schemas: {
            Base64Data: { type: 'string', format: 'byte' },
          },
        },
      });
      const result = generateContracts(doc, makeResolver(doc));
      expect(result).toContain('export type Base64Data = string;');
    });

    it('generates string type for nullable binary format', () => {
      const doc = createDoc({
        components: {
          schemas: {
            OptionalFile: { type: 'string', format: 'binary', nullable: true },
          },
        },
      });
      const result = generateContracts(doc, makeResolver(doc));
      expect(result).toContain('export type OptionalFile = string | null;');
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 2. Binary in request body (multipart/form-data)
  // ────────────────────────────────────────────────────────────────────────
  describe('binary in multipart/form-data request body', () => {
    it('generates body type with binary field in multipart upload', () => {
      const doc = createDoc({
        paths: {
          '/upload': {
            post: {
              requestBody: {
                required: true,
                content: {
                  'multipart/form-data': {
                    schema: {
                      type: 'object',
                      properties: {
                        file: { type: 'string', format: 'binary' },
                        description: { type: 'string' },
                      },
                      required: ['file'],
                    },
                  },
                },
              },
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      });
      const result = generateContracts(doc, makeResolver(doc));
      expect(result).toContain('export type PostUploadBody =');
      expect(result).toContain('export interface FileInput {');
      expect(result).toContain('file: FileInput;');
      expect(result).toContain('description?: string;');
    });

    it('generates body type with multiple binary fields', () => {
      const doc = createDoc({
        paths: {
          '/batch-upload': {
            post: {
              requestBody: {
                required: true,
                content: {
                  'multipart/form-data': {
                    schema: {
                      type: 'object',
                      properties: {
                        avatar: { type: 'string', format: 'binary' },
                        document: { type: 'string', format: 'binary' },
                        thumbnail: { type: 'string', format: 'binary' },
                        name: { type: 'string' },
                      },
                      required: ['avatar'],
                    },
                  },
                },
              },
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      });
      const result = generateContracts(doc, makeResolver(doc));
      expect(result).toContain('export type PostBatchUploadBody =');
      expect(result).toContain('avatar: FileInput;');
      expect(result).toContain('document?: FileInput;');
      expect(result).toContain('thumbnail?: FileInput;');
      expect(result).toContain('name?: string;');
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 3. Binary in response context
  // ────────────────────────────────────────────────────────────────────────
  describe('binary in response content', () => {
    it('generates string response type for binary content', () => {
      const doc = createDoc({
        paths: {
          '/files/{id}': {
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
                '200': {
                  description: 'Binary file download',
                  content: {
                    'application/octet-stream': {
                      schema: { type: 'string', format: 'binary' },
                    },
                  },
                },
              },
            },
          },
        },
      });
      const result = generateContracts(doc, makeResolver(doc));
      expect(result).toContain('export type GetFilesIdResponse = StreamResponse;');
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 4. Byte in request body
  // ────────────────────────────────────────────────────────────────────────
  describe('byte format in request body', () => {
    it('generates body type with byte field for base64-encoded data', () => {
      const doc = createDoc({
        paths: {
          '/data': {
            post: {
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        payload: { type: 'string', format: 'byte' },
                      },
                      required: ['payload'],
                    },
                  },
                },
              },
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      });
      const result = generateContracts(doc, makeResolver(doc));
      expect(result).toContain('export type PostDataBody =');
      expect(result).toContain('payload: string;');
    });
  });
});
