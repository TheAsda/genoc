import { describe, it, expect } from 'vitest';

import { validateSpec30 } from '../../../src/parser/version/v3.0/validator.js';
import { expectViolation } from './expect-violation.js';

describe('validateSpec30', () => {
  it('should pass for a valid 3.0 spec', () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/test': {
          get: {
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };

    const result = validateSpec30(spec);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should fail for missing paths', () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'Test API', version: '1.0.0' },
    };

    const result = validateSpec30(spec);
    expect(result.valid).toBe(false);
    expectViolation(
      result.errors,
      "OpenAPI 3.0 specification must have a 'paths' field with object value"
    );
  });

  it('should fail for missing info', () => {
    const spec = {
      openapi: '3.0.3',
      paths: {},
    };

    const result = validateSpec30(spec);
    expect(result.valid).toBe(false);
    expectViolation(
      result.errors,
      "OpenAPI specification must have an 'info' field with object value"
    );
  });

  it('should accept empty-string info.title', () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: '', version: '1.0.0' },
      paths: {},
    };

    const result = validateSpec30(spec);
    expect(result.valid).toBe(true);
  });

  it('should accept empty-string info.version', () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'Test', version: '' },
      paths: {},
    };

    const result = validateSpec30(spec);
    expect(result.valid).toBe(true);
  });

  it('should fail for missing info.title', () => {
    const spec = {
      openapi: '3.0.3',
      info: { version: '1.0.0' },
      paths: {},
    };

    const result = validateSpec30(spec);
    expect(result.valid).toBe(false);
    expectViolation(result.errors, "Info object must have a 'title' field with string value");
  });

  it('should fail for missing info.version', () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'Test' },
      paths: {},
    };

    const result = validateSpec30(spec);
    expect(result.valid).toBe(false);
    expectViolation(result.errors, "Info object must have a 'version' field with string value");
  });

  it('should fail for type arrays in schemas (3.1-only)', () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'Test', version: '1.0.0' },
      paths: {},
      components: {
        schemas: {
          MySchema: {
            type: ['string', 'null'],
          },
        },
      },
    };

    const result = validateSpec30(spec);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('type') && e.includes('array'))).toBe(true);
  });

  it('should accept nullable (valid in 3.0)', () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'Test', version: '1.0.0' },
      paths: {},
      components: {
        schemas: {
          MySchema: {
            type: 'string',
            nullable: true,
          },
        },
      },
    };

    const result = validateSpec30(spec);
    expect(result.valid).toBe(true);
  });

  it('should accept example (valid in 3.0)', () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'Test', version: '1.0.0' },
      paths: {},
      components: {
        schemas: {
          MySchema: {
            type: 'string',
            example: 'foo',
          },
        },
      },
    };

    const result = validateSpec30(spec);
    expect(result.valid).toBe(true);
  });

  it('should fail for items as array (3.1-only tuple syntax)', () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'Test', version: '1.0.0' },
      paths: {},
      components: {
        schemas: {
          TupleSchema: {
            type: 'array',
            items: [{ type: 'string' }, { type: 'integer' }],
          },
        },
      },
    };

    const result = validateSpec30(spec);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('items') && e.includes('array'))).toBe(true);
  });

  it('should fail for $schema in schema (3.1-only)', () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'Test', version: '1.0.0' },
      paths: {},
      components: {
        schemas: {
          MySchema: {
            $schema: 'https://json-schema.org/draft/2020-12/schema',
            type: 'string',
          },
        },
      },
    };

    const result = validateSpec30(spec);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('$schema') && e.includes('3.1'))).toBe(true);
  });

  it('should fail for non-3.0 openapi version', () => {
    const spec = {
      openapi: '3.1.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {},
    };

    const result = validateSpec30(spec);
    expect(result.valid).toBe(false);
    expectViolation(result.errors, "OpenAPI version must start with '3.0', got: 3.1.0");
  });

  it('should fail for null document', () => {
    const result = validateSpec30(null);
    expect(result.valid).toBe(false);
    expectViolation(result.errors, 'Document must be an object');
  });

  it('should fail for missing openapi field', () => {
    const spec = {
      info: { title: 'Test', version: '1.0.0' },
      paths: {},
    };

    const result = validateSpec30(spec);
    expect(result.valid).toBe(false);
    expectViolation(
      result.errors,
      "OpenAPI specification must have an 'openapi' field with string value"
    );
  });

  it('should recursively validate nested schemas in properties', () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'Test', version: '1.0.0' },
      paths: {},
      components: {
        schemas: {
          Parent: {
            type: 'object',
            properties: {
              child: {
                type: ['string', 'null'],
              },
            },
          },
        },
      },
    };

    const result = validateSpec30(spec);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some(
        (e) => e.includes('type') && e.includes('array') && e.includes('Parent.properties.child')
      )
    ).toBe(true);
  });
});
