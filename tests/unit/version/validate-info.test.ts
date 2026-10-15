import { describe, expect, it } from 'vitest';

import { validateInfo } from '../../../src/parser/version/validate-info.js';

function run(spec: Record<string, unknown>, version: '3.0' | '3.1'): string[] {
  const errors: string[] = [];
  validateInfo(spec, version, errors);
  return errors;
}

// Spec pages are hardcoded instead of importing SPEC_PAGE: these tests must
// fail loudly if link rendering ever changes. When a spec patch release bumps
// SPEC_PAGE, update these expectations in the same commit.
const DIALECTS = [
  { version: '3.0', page: 'https://spec.openapis.org/oas/v3.0.4.html' },
  { version: '3.1', page: 'https://spec.openapis.org/oas/v3.1.1.html' },
] as const;

describe('validateInfo', () => {
  it.each(DIALECTS)(
    'rejects a missing or non-object info with the exact %s link',
    ({ version, page }) => {
      for (const info of [undefined, null, 'nope', [], 42]) {
        const spec: Record<string, unknown> = info === undefined ? {} : { info };
        expect(run(spec, version)).toEqual([
          `OpenAPI specification must have an 'info' field with object value\n    ${page}#info-object`,
        ]);
      }
    }
  );

  it.each(DIALECTS)(
    'rejects a non-string info.title with the exact %s link',
    ({ version, page }) => {
      for (const title of [undefined, null, 42, ['T']]) {
        expect(run({ info: { title, version: '1.0.0' } }, version)).toEqual([
          `Info object must have a 'title' field with string value\n    ${page}#info-title`,
        ]);
      }
    }
  );

  it.each(DIALECTS)(
    'rejects a non-string info.version with the exact %s link',
    ({ version, page }) => {
      for (const badVersion of [undefined, null, 42, ['1']]) {
        expect(run({ info: { title: 'Test', version: badVersion } }, version)).toEqual([
          `Info object must have a 'version' field with string value\n    ${page}#info-version`,
        ]);
      }
    }
  );

  it.each(DIALECTS)(
    'accepts empty-string title and version in %s (spec constrains presence only)',
    ({ version }) => {
      expect(run({ info: { title: '', version: '' } }, version)).toEqual([]);
    }
  );

  it.each(DIALECTS)('accepts a fully valid info object in %s', ({ version }) => {
    expect(run({ info: { title: 'Test', version: '1.0.0' } }, version)).toEqual([]);
  });
});
