import { describe, it, expect } from 'vitest';

import { normalizeSpec30 } from '../../../src/parser/version/v3.0/normalizer.js';

describe('normalizeSpec30', () => {
  describe('nullable handling', () => {
    it('should preserve nullable: true on schemas', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/test': {
            get: {
              responses: {
                '200': {
                  description: 'OK',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          name: { type: 'string', nullable: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const result = normalizeSpec30(spec);
      const props =
        result.paths!['/test'].get!.responses['200'].content!['application/json'].schema!
          .properties!;
      expect(props.name.nullable).toBe(true);
      expect(props.name.types).toEqual(['string']);
    });

    it('should handle nullable: false as non-nullable', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/test': {
            get: {
              responses: {
                '200': {
                  description: 'OK',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          age: { type: 'integer', nullable: false },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const result = normalizeSpec30(spec);
      const ageSchema =
        result.paths!['/test'].get!.responses['200'].content!['application/json'].schema!;
      expect(ageSchema.nullable).toBe(false);
    });
  });

  describe('exclusiveMinimum/Maximum handling', () => {
    it('should convert boolean exclusiveMinimum + minimum to number', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/test': {
            post: {
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        score: {
                          type: 'number',
                          minimum: 7,
                          exclusiveMinimum: true,
                        },
                      },
                    },
                  },
                },
              },
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      };

      const result = normalizeSpec30(spec);
      const scoreSchema =
        result.paths!['/test'].post!.requestBody!.content['application/json'].schema!;
      expect(scoreSchema.properties!.score.exclusiveMinimum).toBe(7);
    });

    it('should convert boolean exclusiveMaximum + maximum to number', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/test': {
            post: {
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        rating: {
                          type: 'integer',
                          maximum: 10,
                          exclusiveMaximum: true,
                        },
                      },
                    },
                  },
                },
              },
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      };

      const result = normalizeSpec30(spec);
      const ratingSchema =
        result.paths!['/test'].post!.requestBody!.content['application/json'].schema!;
      expect(ratingSchema.properties!.rating.exclusiveMaximum).toBe(10);
    });
  });

  describe('example handling', () => {
    it('should convert single example to examples array', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/test': {
            get: {
              responses: {
                '200': {
                  description: 'OK',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'string',
                        example: 'foo',
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const result = normalizeSpec30(spec);
      const schema =
        result.paths!['/test'].get!.responses['200'].content!['application/json'].schema!;
      expect(schema.examples).toEqual(['foo']);
    });
  });

  describe('fileUpload detection', () => {
    it('should detect format: binary as fileUpload', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/upload': {
            post: {
              requestBody: {
                content: {
                  'multipart/form-data': {
                    schema: {
                      type: 'object',
                      properties: {
                        file: {
                          type: 'string',
                          format: 'binary',
                        },
                      },
                    },
                  },
                },
              },
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      };

      const result = normalizeSpec30(spec);
      const fileSchema =
        result.paths!['/upload'].post!.requestBody!.content!['multipart/form-data'].schema!;
      expect(fileSchema.properties!.file.fileUpload).toEqual({
        binary: true,
        base64: false,
      });
    });

    it('should detect format: byte as fileUpload', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/upload': {
            post: {
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'string',
                          format: 'byte',
                        },
                      },
                    },
                  },
                },
              },
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      };

      const result = normalizeSpec30(spec);
      const dataSchema =
        result.paths!['/upload'].post!.requestBody!.content['application/json'].schema!;
      expect(dataSchema.properties!.data.fileUpload).toEqual({
        binary: false,
        base64: true,
      });
    });
  });

  describe('$ref siblings', () => {
    it('should strip $ref sibling properties (3.0 behavior)', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/test': {
            get: {
              responses: {
                '200': {
                  description: 'OK',
                  content: {
                    'application/json': {
                      schema: {
                        $ref: '#/components/schemas/Base',
                        description: 'Override description',
                      },
                    },
                  },
                },
              },
            },
          },
        },
        components: {
          schemas: {
            Base: {
              type: 'object',
              description: 'Base description',
              properties: {
                name: { type: 'string' },
              },
            },
          },
        },
      };

      const result = normalizeSpec30(spec);
      const schema =
        result.paths!['/test'].get!.responses['200'].content!['application/json'].schema!;
      // $ref is preserved but siblings (description) are stripped
      expect(schema.$ref).toBe('#/components/schemas/Base');
      expect(schema.description).toBeUndefined();
    });
  });

  describe('items as array', () => {
    it('should throw error for items as array (3.1-only)', () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/test': {
            get: {
              responses: {
                '200': {
                  description: 'OK',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'array',
                        items: [{ type: 'string' }, { type: 'integer' }],
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      expect(() => normalizeSpec30(spec)).toThrow(/items.*array.*not supported.*3\.0/);
    });
  });

  describe('fixture files', () => {
    it('should normalize minimal-spec.json', async () => {
      const { readFileSync } = await import('node:fs');
      const { join } = await import('node:path');
      const raw = readFileSync(join(__dirname, '../../fixtures/v3.0/minimal-spec.json'), 'utf-8');
      const spec = JSON.parse(raw);
      const result = normalizeSpec30(spec);
      expect(result.openapi).toBe('3.0.3');
      expect(result.info.title).toBe('Minimal API');
      expect(result.paths).toBeDefined();
    });

    it('should normalize nullable-examples.json', async () => {
      const { readFileSync } = await import('node:fs');
      const { join } = await import('node:path');
      const raw = readFileSync(
        join(__dirname, '../../fixtures/v3.0/nullable-examples.json'),
        'utf-8'
      );
      const spec = JSON.parse(raw);
      const result = normalizeSpec30(spec);
      const props =
        result.paths!['/test'].get!.responses['200'].content!['application/json'].schema!
          .properties!;
      expect(props.name.nullable).toBe(true);
      expect(props.age.nullable).toBe(false);
      expect(props.tags.nullable).toBe(true);
    });

    it('should normalize exclusive-min-max.json', async () => {
      const { readFileSync } = await import('node:fs');
      const { join } = await import('node:path');
      const raw = readFileSync(
        join(__dirname, '../../fixtures/v3.0/exclusive-min-max.json'),
        'utf-8'
      );
      const spec = JSON.parse(raw);
      const result = normalizeSpec30(spec);
      const props =
        result.paths!['/test'].post!.requestBody!.content['application/json'].schema!.properties!;
      expect(props.score.exclusiveMinimum).toBe(0);
      expect(props.rating.exclusiveMaximum).toBe(10);
    });
  });
});
