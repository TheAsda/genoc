import { describe, it, expect } from 'vitest';

import {
  validateSpec,
  validateOpenAPIVersion,
  ValidationResult,
} from '../../src/parser/validators.js';

describe('validateOpenAPIVersion', () => {
  it('should return true for version 3.1.0', () => {
    expect(validateOpenAPIVersion('3.1.0')).toBe(true);
  });

  it('should return true for version 3.1.1', () => {
    expect(validateOpenAPIVersion('3.1.1')).toBe(true);
  });

  it('should return true for version 3.1.0-rc1', () => {
    expect(validateOpenAPIVersion('3.1.0-rc1')).toBe(true);
  });

  it('should return false for version 3.0.0', () => {
    expect(validateOpenAPIVersion('3.0.0')).toBe(false);
  });

  it('should return false for version 2.0.0', () => {
    expect(validateOpenAPIVersion('2.0.0')).toBe(false);
  });

  it('should return false for version 4.0.0', () => {
    expect(validateOpenAPIVersion('4.0.0')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(validateOpenAPIVersion('')).toBe(false);
  });

  it('should return false for non-string input', () => {
    expect(validateOpenAPIVersion(null as any)).toBe(false);
    expect(validateOpenAPIVersion(undefined as any)).toBe(false);
  });
});

describe('validateSpec', () => {
  it('should return valid result for valid spec', () => {
    const validSpec = {
      openapi: '3.1.0',
      info: {
        title: 'Test API',
        version: '1.0.0',
      },
      paths: {
        '/test': {
          get: {
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };

    const result: ValidationResult = validateSpec(validSpec);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should return error for missing openapi field', () => {
    const invalidSpec = {
      info: {
        title: 'Test API',
        version: '1.0.0',
      },
      paths: {
        '/test': {
          get: {
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };

    const result: ValidationResult = validateSpec(invalidSpec);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "OpenAPI specification must have an 'openapi' field with string value"
    );
  });

  it('should return error for version 3.0.0', () => {
    const invalidSpec = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0',
      },
      paths: {
        '/test': {
          get: {
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };

    const result: ValidationResult = validateSpec(invalidSpec);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("OpenAPI version must start with '3.1', got: 3.0.0");
  });

  it('should return error for missing info field', () => {
    const invalidSpec = {
      openapi: '3.1.0',
      paths: {
        '/test': {
          get: {
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };

    const result: ValidationResult = validateSpec(invalidSpec);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "OpenAPI specification must have an 'info' field with object value"
    );
  });

  it('should return error for missing title in info', () => {
    const invalidSpec = {
      openapi: '3.1.0',
      info: {
        version: '1.0.0',
      },
      paths: {
        '/test': {
          get: {
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };

    const result: ValidationResult = validateSpec(invalidSpec);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Info object must have a 'title' field with string value");
  });

  it('should return error for missing version in info', () => {
    const invalidSpec = {
      openapi: '3.1.0',
      info: {
        title: 'Test API',
      },
      paths: {
        '/test': {
          get: {
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };

    const result: ValidationResult = validateSpec(invalidSpec);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Info object must have a 'version' field with string value");
  });

  it('should return error for empty spec (no paths/components/webhooks)', () => {
    const invalidSpec = {
      openapi: '3.1.0',
      info: {
        title: 'Test API',
        version: '1.0.0',
      },
    };

    const result: ValidationResult = validateSpec(invalidSpec);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "OpenAPI specification must have at least one of 'paths', 'components', or 'webhooks'"
    );
  });

  it('should return error for paths that is an array', () => {
    const invalidSpec = {
      openapi: '3.1.0',
      info: {
        title: 'Test API',
        version: '1.0.0',
      },
      paths: [] as any,
    };

    const result: ValidationResult = validateSpec(invalidSpec);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("'paths' field must be an object");
  });

  it('should return error for paths that is not an object', () => {
    const invalidSpec = {
      openapi: '3.1.0',
      info: {
        title: 'Test API',
        version: '1.0.0',
      },
      paths: 'invalid' as any,
    };

    const result: ValidationResult = validateSpec(invalidSpec);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("'paths' field must be an object");
  });

  it('should return error for components.schemas that is an array', () => {
    const invalidSpec = {
      openapi: '3.1.0',
      info: {
        title: 'Test API',
        version: '1.0.0',
      },
      components: {
        schemas: [] as any,
      },
    };

    const result: ValidationResult = validateSpec(invalidSpec);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("'components.schemas' must be an object");
  });

  it('should return error for components.schemas that is not an object', () => {
    const invalidSpec = {
      openapi: '3.1.0',
      info: {
        title: 'Test API',
        version: '1.0.0',
      },
      components: {
        schemas: 'invalid' as any,
      },
    };

    const result: ValidationResult = validateSpec(invalidSpec);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("'components.schemas' must be an object");
  });

  it('should return error for invalid schema in components.schemas', () => {
    const invalidSpec = {
      openapi: '3.1.0',
      info: {
        title: 'Test API',
        version: '1.0.0',
      },
      components: {
        schemas: {
          validSchema: { type: 'string' },
          invalidSchema: 'not an object' as any,
        },
      },
    };

    const result: ValidationResult = validateSpec(invalidSpec);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Schema 'invalidSchema' must be an object");
  });

  it('should return valid result with webhooks instead of paths', () => {
    const validSpec = {
      openapi: '3.1.0',
      info: {
        title: 'Test API',
        version: '1.0.0',
      },
      webhooks: {
        '/test': {
          post: {
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };

    const result: ValidationResult = validateSpec(validSpec);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should return valid result with components instead of paths', () => {
    const validSpec = {
      openapi: '3.1.0',
      info: {
        title: 'Test API',
        version: '1.0.0',
      },
      components: {
        schemas: {
          User: {
            type: 'object',
            properties: { name: { type: 'string' } },
          },
        },
      },
    };

    const result: ValidationResult = validateSpec(validSpec);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should return error for null document', () => {
    const result: ValidationResult = validateSpec(null as any);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Document must be an object');
  });

  it('should return error for undefined document', () => {
    const result: ValidationResult = validateSpec(undefined as any);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Document must be an object');
  });

  it('should return error for array document', () => {
    const result: ValidationResult = validateSpec([] as any);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Document must be an object');
  });

  it('should return error for non-object openapi field', () => {
    const invalidSpec = {
      openapi: 3.1 as any,
      info: {
        title: 'Test API',
        version: '1.0.0',
      },
      paths: {
        '/test': {
          get: {
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };

    const result: ValidationResult = validateSpec(invalidSpec);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "OpenAPI specification must have an 'openapi' field with string value"
    );
  });

  it('should return error for non-object info field', () => {
    const invalidSpec = {
      openapi: '3.1.0',
      info: 'not an object' as any,
      paths: {
        '/test': {
          get: {
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };

    const result: ValidationResult = validateSpec(invalidSpec);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "OpenAPI specification must have an 'info' field with object value"
    );
  });

  it('should return error for non-string title', () => {
    const invalidSpec = {
      openapi: '3.1.0',
      info: {
        title: 123 as any,
        version: '1.0.0',
      },
      paths: {
        '/test': {
          get: {
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };

    const result: ValidationResult = validateSpec(invalidSpec);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Info object must have a 'title' field with string value");
  });

  it('should return error for non-string version', () => {
    const invalidSpec = {
      openapi: '3.1.0',
      info: {
        title: 'Test API',
        version: 123 as any,
      },
      paths: {
        '/test': {
          get: {
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    };

    const result: ValidationResult = validateSpec(invalidSpec);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Info object must have a 'version' field with string value");
  });
});
