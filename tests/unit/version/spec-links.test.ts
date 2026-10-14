import { describe, expect, it } from 'vitest';

import { SPEC_PAGE, specLinkUrl, specViolation } from '../../../src/parser/version/spec-links.js';
import { validateSpec30 } from '../../../src/parser/version/v3.0/validator.js';
import { validateSpec31 } from '../../../src/parser/version/v3.1/validator.js';
import { validateSpec } from '../../../src/parser/version/validate.js';
import { detectSpecVersion, resolveVersion } from '../../../src/parser/version/version-detector.js';

describe('SPEC_PAGE', () => {
  it('points each dialect at its latest patch release', () => {
    expect(SPEC_PAGE['3.0']).toBe('https://spec.openapis.org/oas/v3.0.4.html');
    expect(SPEC_PAGE['3.1']).toBe('https://spec.openapis.org/oas/v3.1.1.html');
  });
});

describe('specLinkUrl', () => {
  it('builds the section URL for a dialect and anchor key', () => {
    expect(specLinkUrl('3.1', 'info-version')).toBe(
      'https://spec.openapis.org/oas/v3.1.1.html#info-version'
    );
    expect(specLinkUrl('3.0', 'info-version')).toBe(
      'https://spec.openapis.org/oas/v3.0.4.html#info-version'
    );
  });
});

describe('specViolation', () => {
  it('appends the spec link on its own indented line under the message', () => {
    expect(specViolation('3.1', 'info-version', "Info object must have a 'version' field")).toBe(
      "Info object must have a 'version' field\n" +
        '    https://spec.openapis.org/oas/v3.1.1.html#info-version'
    );
  });
});

describe('validators embed spec links in violation messages', () => {
  it('3.0: missing info.version links to the info-version section of v3.0.4', () => {
    const result = validateSpec30({ openapi: '3.0.3', info: { title: 'T' }, paths: {} });
    expect(result.errors).toContain(
      "Info object must have a 'version' field with string value\n" +
        '    https://spec.openapis.org/oas/v3.0.4.html#info-version'
    );
  });

  it('3.1: missing info.version links to the info-version section of v3.1.1', () => {
    const result = validateSpec31({ openapi: '3.1.0', info: { title: 'T' }, paths: {} });
    expect(result.errors).toContain(
      "Info object must have a 'version' field with string value\n" +
        '    https://spec.openapis.org/oas/v3.1.1.html#info-version'
    );
  });

  it('type-as-array schema in a 3.0 doc links to the 3.0 Schema Object section (dialect being applied)', () => {
    const result = validateSpec30({
      openapi: '3.0.3',
      info: { title: 'T', version: '1' },
      paths: {},
      components: { schemas: { Pet: { type: ['string', 'null'] } } },
    });
    expect(result.errors).toContain(
      "Schema 'components.schemas.Pet' uses 'type' as an array which is a 3.1-only feature\n" +
        '    https://spec.openapis.org/oas/v3.0.4.html#schema-object'
    );
  });

  it('nullable schema in a 3.1 doc links to the 3.1 Schema Object section', () => {
    const result = validateSpec31({
      openapi: '3.1.0',
      info: { title: 'T', version: '1' },
      paths: {},
      components: { schemas: { Pet: { type: 'string', nullable: true } } },
    });
    expect(result.errors).toContain(
      "Schema 'components.schemas.Pet' uses 'nullable' which is a 3.0-only feature\n" +
        '    https://spec.openapis.org/oas/v3.1.1.html#schema-object'
    );
  });

  it('dialect mismatch links to the version section of the dialect being applied', () => {
    const result = validateSpec30({
      openapi: '3.1.0',
      info: { title: 'T', version: '1' },
      paths: {},
    });
    expect(result.errors).toContain(
      "OpenAPI version must start with '3.0', got: 3.1.0\n" +
        '    https://spec.openapis.org/oas/v3.0.4.html#oas-version'
    );
  });

  it("the 3.1 'at least one of' error gets no link (all three fields are optional in 3.1)", () => {
    const result = validateSpec31({ openapi: '3.1.0', info: { title: 'T', version: '1' } });
    expect(result.errors).toContain(
      "OpenAPI specification must have at least one of 'paths', 'components', or 'webhooks'"
    );
    expect(
      result.errors.find((e) =>
        e.includes("must have at least one of 'paths', 'components', or 'webhooks'")
      )
    ).not.toMatch(/https:/);
  });
});

describe('validateSpec renders link lines inside the aggregate message', () => {
  it('each bullet is followed by its indented spec link', () => {
    expect(() => validateSpec({ openapi: '3.0.3' }, '3.0')).toThrow(
      'Invalid OpenAPI specification:\n' +
        "  - OpenAPI specification must have an 'info' field with object value\n" +
        '    https://spec.openapis.org/oas/v3.0.4.html#info-object\n' +
        "  - OpenAPI 3.0 specification must have a 'paths' field with object value\n" +
        '    https://spec.openapis.org/oas/v3.0.4.html#paths-object'
    );
  });
});

describe('resolveVersion links spec-violation errors to the applied dialect', () => {
  it('missing openapi field: no override → link to v3.1.1', () => {
    expect(() => resolveVersion({ info: {} })).toThrow(
      "Invalid spec: missing or invalid 'openapi' field\n" +
        '  https://spec.openapis.org/oas/v3.1.1.html#oas-version'
    );
  });

  it('missing openapi field: --spec-version override decides the linked page', () => {
    expect(() => resolveVersion({ info: {} }, '3.0')).toThrow(
      "Invalid spec: missing or invalid 'openapi' field\n" +
        '  https://spec.openapis.org/oas/v3.0.4.html#oas-version'
    );
  });

  it('malformed openapi field links to the version section (unknown dialect, no override)', () => {
    expect(() => resolveVersion({ openapi: '3.0.x' })).toThrow(
      'Invalid OpenAPI version format: 3.0.x\n' +
        '  https://spec.openapis.org/oas/v3.1.1.html#oas-version'
    );
  });

  it('non-object document links to the OpenAPI Object section', () => {
    expect(() => resolveVersion(null)).toThrow(
      'Invalid spec: must be a non-null object\n' +
        '  https://spec.openapis.org/oas/v3.1.1.html#openapi-object'
    );
  });

  it('detectSpecVersion keeps its plain wording for direct callers (link rendering belongs to resolveVersion)', () => {
    expect(() => detectSpecVersion({})).toThrow("Invalid spec: missing or invalid 'openapi' field");
    expect(() => detectSpecVersion({})).not.toThrow(/https:/);
  });

  it('unsupported features get no link', () => {
    expect(() => resolveVersion({ swagger: '2.0' })).toThrow(
      'Swagger 2.0 is not supported. Convert to OpenAPI using swagger2openapi first.'
    );
    expect(() => resolveVersion({ openapi: '4.0.0' })).toThrow(
      'Unsupported OpenAPI version: 4.0.0. Supported versions: 3.0, 3.1, 3.2'
    );
    expect(() => resolveVersion({ openapi: '3.2.0' })).toThrow(
      'OpenAPI 3.2 is not yet supported. Supported versions: 3.0, 3.1'
    );
    for (const error of [
      () => resolveVersion({ swagger: '2.0' }),
      () => resolveVersion({ openapi: '4.0.0' }),
      () => resolveVersion({ openapi: '3.2.0' }),
    ]) {
      expect(error).not.toThrow(/https:/);
    }
  });

  it('a valid 3.0 doc still resolves without any link in the profile path', () => {
    expect(resolveVersion({ openapi: '3.0.3' })).toEqual({
      detected: '3.0',
      effective: '3.0',
      preserveRefSiblings: false,
    });
  });
});
