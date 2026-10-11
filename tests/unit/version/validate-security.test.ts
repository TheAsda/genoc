import { describe, expect, it } from 'vitest';

import { validateSecurity } from '../../../src/parser/version/validate-security.js';

function run(spec: Record<string, unknown>, version: '3.0' | '3.1' = '3.0'): string[] {
  const errors: string[] = [];
  validateSecurity(spec, version, errors);
  return errors;
}

function baseSpec(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    info: { title: 'Test', version: '1.0.0' },
    paths: {},
    ...overrides,
  };
}

describe('validateSecurity — securitySchemes entries', () => {
  it('accepts every legal 3.0 scheme type', () => {
    const errors = run(
      baseSpec({
        components: {
          securitySchemes: {
            Key: { type: 'apiKey', name: 'k', in: 'query' },
            Basic: { type: 'http', scheme: 'basic' },
            Oidc: { type: 'openIdConnect', openIdConnectUrl: 'https://idp/.well-known' },
            OAuth: {
              type: 'oauth2',
              flows: { implicit: { authorizationUrl: 'https://idp/auth', scopes: {} } },
            },
          },
        },
      })
    );
    expect(errors).toEqual([]);
  });

  it('rejects a non-object scheme', () => {
    const errors = run(baseSpec({ components: { securitySchemes: { Key: 'nope' } } }));
    expect(errors).toContain("Security scheme 'Key' must be an object");
  });

  it('rejects an unknown scheme type', () => {
    const errors = run(baseSpec({ components: { securitySchemes: { Key: { type: 'sso' } } } }));
    expect(errors).toContain(
      "Security scheme 'Key' must have a 'type' field with one of: apiKey, http, oauth2, openIdConnect, got: \"sso\""
    );
  });

  it('rejects mutualTLS in 3.0 but accepts it in 3.1', () => {
    const spec = baseSpec({ components: { securitySchemes: { Tls: { type: 'mutualTLS' } } } });
    expect(run(spec, '3.0')).toContain(
      "Security scheme 'Tls' must have a 'type' field with one of: apiKey, http, oauth2, openIdConnect, got: \"mutualTLS\""
    );
    expect(run(spec, '3.1')).toEqual([]);
  });

  it('requires name and in for apiKey schemes', () => {
    const errors = run(baseSpec({ components: { securitySchemes: { Key: { type: 'apiKey' } } } }));
    expect(errors).toContain(
      "apiKey security scheme 'Key' must have a 'name' field with string value"
    );
    expect(errors).toContain(
      "apiKey security scheme 'Key' must have an 'in' field with one of: query, header, cookie"
    );
  });

  it('requires scheme for http schemes', () => {
    const errors = run(baseSpec({ components: { securitySchemes: { Basic: { type: 'http' } } } }));
    expect(errors).toContain(
      "http security scheme 'Basic' must have a 'scheme' field with string value"
    );
  });

  it('requires flows with per-flow scopes objects for oauth2 schemes', () => {
    const missing = run(
      baseSpec({ components: { securitySchemes: { OAuth: { type: 'oauth2' } } } })
    );
    expect(missing).toContain(
      "oauth2 security scheme 'OAuth' must have a 'flows' field with object value"
    );

    const noScopes = run(
      baseSpec({
        components: {
          securitySchemes: {
            OAuth: { type: 'oauth2', flows: { password: { tokenUrl: 'https://idp/token' } } },
          },
        },
      })
    );
    expect(noScopes).toContain(
      "oauth2 flow 'password' of security scheme 'OAuth' must have a 'scopes' field with object value"
    );
  });

  it('requires openIdConnectUrl for openIdConnect schemes', () => {
    const errors = run(
      baseSpec({ components: { securitySchemes: { Oidc: { type: 'openIdConnect' } } } })
    );
    expect(errors).toContain(
      "openIdConnect security scheme 'Oidc' must have an 'openIdConnectUrl' field with string value"
    );
  });

  it('validates $ref scheme entries shallowly (no type check)', () => {
    const errors = run(
      baseSpec({
        components: { securitySchemes: { Key: { $ref: '#/components/schemas/Anything' } } },
      })
    );
    expect(errors).toEqual([]);
  });

  it('rejects a non-object components.securitySchemes', () => {
    const errors = run(baseSpec({ components: { securitySchemes: ['nope'] } }));
    expect(errors).toContain("'components.securitySchemes' must be an object");
  });
});

describe('validateSecurity — security requirement lists', () => {
  const withSchemes = {
    components: {
      securitySchemes: {
        Bearer: { type: 'http', scheme: 'bearer' },
        OAuth: {
          type: 'oauth2',
          flows: { clientCredentials: { tokenUrl: 'https://idp/token', scopes: {} } },
        },
      },
    },
  };

  it('accepts valid root and operation-level requirements', () => {
    const errors = run(
      baseSpec({
        ...withSchemes,
        security: [{ Bearer: [] }, { OAuth: ['read'] }],
        paths: {
          '/x': {
            get: { responses: {}, security: [{ Bearer: [], OAuth: ['read', 'write'] }] },
          },
        },
      })
    );
    expect(errors).toEqual([]);
  });

  it('rejects a non-array security field', () => {
    const errors = run(baseSpec({ ...withSchemes, security: { Bearer: [] } }));
    expect(errors).toContain("'security' must be an array");
  });

  it('rejects a non-object requirement entry', () => {
    const errors = run(baseSpec({ ...withSchemes, security: ['nope'] }));
    expect(errors).toContain("'security[0]' must be an object");
  });

  it('rejects references to undeclared schemes', () => {
    const errors = run(baseSpec({ ...withSchemes, security: [{ Ghost: [] }] }));
    expect(errors).toContain(
      "'security[0]' references unknown security scheme 'Ghost' (not declared in components.securitySchemes)"
    );
  });

  it('rejects scopes that are not an array of strings', () => {
    const errors = run(baseSpec({ ...withSchemes, security: [{ OAuth: 'read' }] }));
    expect(errors).toContain("'security[0].OAuth' must be an array of strings");
  });

  it('rejects non-empty scopes on http schemes in 3.0 but allows them in 3.1', () => {
    const spec = baseSpec({ ...withSchemes, security: [{ Bearer: ['admin'] }] });
    expect(run(spec, '3.0')).toContain(
      "'security[0].Bearer' must have an empty scopes array for 'http' schemes in OpenAPI 3.0"
    );
    expect(run(spec, '3.1')).toEqual([]);
  });

  it('validates operation-level requirements with a path-qualified context', () => {
    const errors = run(
      baseSpec({
        ...withSchemes,
        paths: { '/x': { get: { responses: {}, security: [{ Ghost: [] }] } } },
      })
    );
    expect(errors).toContain(
      "'paths./x.get.security[0]' references unknown security scheme 'Ghost' (not declared in components.securitySchemes)"
    );
  });
});
