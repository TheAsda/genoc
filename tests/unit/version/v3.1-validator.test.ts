import { describe, it, expect } from 'vitest';

import { validateSpec31 } from '../../../src/parser/version/v3.1/validator.js';

describe('validateSpec31', () => {
  it('should pass for a valid minimal 3.1 spec', () => {
    const spec = {
      openapi: '3.1.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {},
    };

    const result = validateSpec31(spec);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should pass for a webhooks-only spec (3.1-specific rule)', () => {
    const spec = {
      openapi: '3.1.0',
      info: { title: 'Test API', version: '1.0.0' },
      webhooks: {
        newPet: {
          post: {
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };

    const result = validateSpec31(spec);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should fail for nullable in components.schemas (3.0-only)', () => {
    const spec = {
      openapi: '3.1.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {},
      components: {
        schemas: {
          User: {
            type: 'string',
            nullable: true,
          },
        },
      },
    };

    const result = validateSpec31(spec);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('nullable') && e.includes('User'))).toBe(true);
  });

  it('should fail for nullable: false as well (presence check)', () => {
    const spec = {
      openapi: '3.1.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {},
      components: {
        schemas: {
          User: {
            type: 'string',
            nullable: false,
          },
        },
      },
    };

    const result = validateSpec31(spec);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('nullable') && e.includes('User'))).toBe(true);
  });

  it('should recursively validate nested schemas in properties', () => {
    const spec = {
      openapi: '3.1.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {},
      components: {
        schemas: {
          Parent: {
            type: 'object',
            properties: {
              child: {
                type: 'string',
                nullable: true,
              },
            },
          },
        },
      },
    };

    const result = validateSpec31(spec);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some(
        (e) => e.includes('nullable') && e.includes('components.schemas.Parent.properties.child')
      )
    ).toBe(true);
  });

  it('should fail for boolean exclusiveMinimum (3.0-only)', () => {
    const spec = {
      openapi: '3.1.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {},
      components: {
        schemas: {
          Count: {
            type: 'integer',
            minimum: 10,
            exclusiveMinimum: true,
          },
        },
      },
    };

    const result = validateSpec31(spec);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('exclusiveMinimum') && e.includes('boolean'))).toBe(
      true
    );
  });

  it('should fail for boolean exclusiveMaximum (3.0-only)', () => {
    const spec = {
      openapi: '3.1.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {},
      components: {
        schemas: {
          Count: {
            type: 'integer',
            maximum: 100,
            exclusiveMaximum: true,
          },
        },
      },
    };

    const result = validateSpec31(spec);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('exclusiveMaximum') && e.includes('boolean'))).toBe(
      true
    );
  });

  it('should accept numeric exclusiveMinimum/exclusiveMaximum (3.1 form)', () => {
    const spec = {
      openapi: '3.1.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {},
      components: {
        schemas: {
          Count: {
            type: 'integer',
            exclusiveMinimum: 10,
            exclusiveMaximum: 100,
          },
        },
      },
    };

    const result = validateSpec31(spec);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should fail for items as array (3.0-only tuple syntax)', () => {
    const spec = {
      openapi: '3.1.0',
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

    const result = validateSpec31(spec);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('items') && e.includes('prefixItems'))).toBe(true);
  });

  it('should recursively validate schemas in items', () => {
    const spec = {
      openapi: '3.1.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {},
      components: {
        schemas: {
          List: {
            type: 'array',
            items: {
              type: 'string',
              nullable: true,
            },
          },
        },
      },
    };

    const result = validateSpec31(spec);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some(
        (e) => e.includes('nullable') && e.includes('components.schemas.List.items')
      )
    ).toBe(true);
  });

  it('should recursively validate schemas in additionalProperties', () => {
    const spec = {
      openapi: '3.1.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {},
      components: {
        schemas: {
          Map: {
            type: 'object',
            additionalProperties: {
              type: 'string',
              nullable: true,
            },
          },
        },
      },
    };

    const result = validateSpec31(spec);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some(
        (e) => e.includes('nullable') && e.includes('components.schemas.Map.additionalProperties')
      )
    ).toBe(true);
  });

  it('should recursively validate schemas in allOf', () => {
    const spec = {
      openapi: '3.1.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {},
      components: {
        schemas: {
          Combined: {
            allOf: [
              { type: 'object' },
              {
                type: 'object',
                properties: {
                  name: { type: 'string', nullable: true },
                },
              },
            ],
          },
        },
      },
    };

    const result = validateSpec31(spec);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some(
        (e) =>
          e.includes('nullable') &&
          e.includes('components.schemas.Combined.allOf[1].properties.name')
      )
    ).toBe(true);
  });

  it('should recursively validate schemas in oneOf', () => {
    const spec = {
      openapi: '3.1.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {},
      components: {
        schemas: {
          Choice: {
            oneOf: [{ type: 'string', nullable: true }, { type: 'integer' }],
          },
        },
      },
    };

    const result = validateSpec31(spec);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some(
        (e) => e.includes('nullable') && e.includes('components.schemas.Choice.oneOf[0]')
      )
    ).toBe(true);
  });

  it('should recursively validate schemas in anyOf', () => {
    const spec = {
      openapi: '3.1.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {},
      components: {
        schemas: {
          Any: {
            anyOf: [{ type: 'string' }, { type: 'integer', nullable: true }],
          },
        },
      },
    };

    const result = validateSpec31(spec);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some(
        (e) => e.includes('nullable') && e.includes('components.schemas.Any.anyOf[1]')
      )
    ).toBe(true);
  });

  it('should recursively validate schemas in prefixItems', () => {
    const spec = {
      openapi: '3.1.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {},
      components: {
        schemas: {
          Tuple: {
            type: 'array',
            prefixItems: [{ type: 'string' }, { type: 'integer', nullable: true }],
            items: false,
          },
        },
      },
    };

    const result = validateSpec31(spec);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some(
        (e) => e.includes('nullable') && e.includes('components.schemas.Tuple.prefixItems[1]')
      )
    ).toBe(true);
  });

  it('should accept type arrays (valid in 3.1)', () => {
    const spec = {
      openapi: '3.1.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {},
      components: {
        schemas: {
          NullableString: {
            type: ['string', 'null'],
          },
        },
      },
    };

    const result = validateSpec31(spec);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should accept $schema in schema (valid in 3.1)', () => {
    const spec = {
      openapi: '3.1.0',
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

    const result = validateSpec31(spec);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should accept schema-level example (deprecated but legal in 3.1)', () => {
    const spec = {
      openapi: '3.1.0',
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

    const result = validateSpec31(spec);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should accept const and examples (valid in 3.1)', () => {
    const spec = {
      openapi: '3.1.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {},
      components: {
        schemas: {
          Status: {
            type: 'string',
            const: 'active',
            examples: ['active', 'paused'],
          },
        },
      },
    };

    const result = validateSpec31(spec);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should accept $ref with siblings (valid in 3.1)', () => {
    const spec = {
      openapi: '3.1.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {},
      components: {
        schemas: {
          Pet: {
            type: 'object',
            properties: {
              name: { type: 'string' },
            },
          },
          ExtendedPet: {
            $ref: '#/components/schemas/Pet',
            description: 'A pet with extra docs',
          },
        },
      },
    };

    const result = validateSpec31(spec);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should fail for non-3.1 openapi version', () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'Test', version: '1.0.0' },
      paths: {},
    };

    const result = validateSpec31(spec);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("OpenAPI version must start with '3.1', got: 3.0.3");
  });

  it('should fail for missing info.title', () => {
    const spec = {
      openapi: '3.1.0',
      info: { version: '1.0.0' },
      paths: {},
    };

    const result = validateSpec31(spec);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Info object must have a 'title' field with string value");
  });

  it('should fail for non-object schema entry', () => {
    const spec = {
      openapi: '3.1.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {},
      components: {
        schemas: {
          Broken: 'not-an-object',
        },
      },
    };

    const result = validateSpec31(spec);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Schema 'Broken' must be an object");
  });
});
