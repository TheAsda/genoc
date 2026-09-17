import { describe, it, expect } from 'vitest';

import { resolveVersion } from '../../../src/parser/version/version-detector.js';

describe('resolveVersion', () => {
  it('returns the VersionProfile shape', () => {
    expect(resolveVersion({ openapi: '3.1.0' })).toEqual({
      detected: '3.1',
      effective: '3.1',
      preserveRefSiblings: true,
    });
  });

  it('without override, effective equals detected', () => {
    expect(resolveVersion({ openapi: '3.0.3' })).toMatchObject({
      detected: '3.0',
      effective: '3.0',
    });
    expect(resolveVersion({ openapi: '3.1.1' })).toMatchObject({
      detected: '3.1',
      effective: '3.1',
    });
  });

  it('override 3.0 on a detected 3.1 doc keeps the split; preserveRefSiblings follows effective', () => {
    const profile = resolveVersion({ openapi: '3.1.0' }, '3.0');
    expect(profile.detected).toBe('3.1');
    expect(profile.effective).toBe('3.0');
    expect(profile.preserveRefSiblings).toBe(false);
  });

  it('override 3.1 on a detected 3.0 doc keeps the split; preserveRefSiblings follows effective', () => {
    const profile = resolveVersion({ openapi: '3.0.3' }, '3.1');
    expect(profile.detected).toBe('3.0');
    expect(profile.effective).toBe('3.1');
    expect(profile.preserveRefSiblings).toBe(true);
  });

  it('matching override is a no-op', () => {
    const profile = resolveVersion({ openapi: '3.1.0' }, '3.1');
    expect(profile).toEqual({
      detected: '3.1',
      effective: '3.1',
      preserveRefSiblings: true,
    });
  });

  it('derives preserveRefSiblings: 3.0 ⇒ false, 3.1 ⇒ true', () => {
    expect(resolveVersion({ openapi: '3.0.0' }).preserveRefSiblings).toBe(false);
    expect(resolveVersion({ openapi: '3.1.0' }).preserveRefSiblings).toBe(true);
  });

  it('throws the not-yet-supported error for a 3.2 doc', () => {
    expect(() => resolveVersion({ openapi: '3.2.0' })).toThrow(
      'OpenAPI 3.2 is not yet supported. Supported versions: 3.0, 3.1'
    );
  });

  it('still throws for a 3.2 doc when an override is provided (detection always runs)', () => {
    expect(() => resolveVersion({ openapi: '3.2.0' }, '3.0')).toThrow(/not yet supported/);
  });
});
