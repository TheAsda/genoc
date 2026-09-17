import { describe, it, expect } from 'vitest';

import { validateSpec } from '../../../src/parser/version/validate.js';

describe('validateSpec', () => {
  it("dispatches to the 3.0 validator for '3.0' (paths is required in 3.0)", () => {
    const doc = {
      openapi: '3.0.3',
      info: { title: 'Test API', version: '1.0.0' },
    };

    expect(() => validateSpec(doc, '3.0')).toThrow(
      "OpenAPI 3.0 specification must have a 'paths' field with object value"
    );
  });

  it("dispatches to the 3.1 validator for '3.1' (webhooks alone satisfies 3.1)", () => {
    const doc = {
      openapi: '3.1.0',
      info: { title: 'Test API', version: '1.0.0' },
      webhooks: {
        '/test': { post: { responses: { '200': { description: 'OK' } } } },
      },
    };

    expect(() => validateSpec(doc, '3.1')).not.toThrow();
  });

  it('same document fails the 3.0 dialect but passes the 3.1 dialect', () => {
    const doc = {
      openapi: '3.1.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {},
    };

    expect(() => validateSpec(doc, '3.0')).toThrow(
      "OpenAPI version must start with '3.0', got: 3.1.0"
    );
    expect(() => validateSpec(doc, '3.1')).not.toThrow();
  });

  it('an invalid 3.1-flavored document throws the 3.1 dialect error under 3.1', () => {
    const doc = {
      openapi: '3.0.3',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {},
    };

    expect(() => validateSpec(doc, '3.1')).toThrow(
      "OpenAPI version must start with '3.1', got: 3.0.3"
    );
  });

  it('aggregates every dialect error into the thrown message', () => {
    const doc = { openapi: '3.0.3' };

    expect(() => validateSpec(doc, '3.0')).toThrow(
      'Invalid OpenAPI specification:\n' +
        "  - OpenAPI specification must have an 'info' field with object value\n" +
        "  - OpenAPI 3.0 specification must have a 'paths' field with object value"
    );
  });

  it('throws for non-object documents in both dialects', () => {
    for (const version of ['3.0', '3.1'] as const) {
      expect(() => validateSpec(null, version)).toThrow('Document must be an object');
    }
  });
});
