import { describe, it, expect } from 'vitest';

import { detectSpecVersion } from '../../../src/parser/version/version-detector.js';

describe('detectSpecVersion', () => {
  it("should detect 3.0.3 as '3.0'", () => {
    expect(detectSpecVersion({ openapi: '3.0.3' })).toBe('3.0');
  });

  it("should detect 3.0.0 as '3.0'", () => {
    expect(detectSpecVersion({ openapi: '3.0.0' })).toBe('3.0');
  });

  it("should detect 3.1.0 as '3.1'", () => {
    expect(detectSpecVersion({ openapi: '3.1.0' })).toBe('3.1');
  });

  it("should detect 3.1.1 as '3.1'", () => {
    expect(detectSpecVersion({ openapi: '3.1.1' })).toBe('3.1');
  });

  it('should throw for Swagger 2.0 with swagger2openapi message', () => {
    expect(() => detectSpecVersion({ swagger: '2.0' })).toThrow(/swagger2openapi/);
  });

  it('should throw for unsupported OpenAPI version 4.0.0', () => {
    expect(() => detectSpecVersion({ openapi: '4.0.0' })).toThrow(/Unsupported OpenAPI version/);
  });

  it('should throw for empty object (missing openapi)', () => {
    expect(() => detectSpecVersion({})).toThrow(/missing or invalid/);
  });

  it('should throw for null openapi field', () => {
    expect(() => detectSpecVersion({ openapi: null })).toThrow(/missing or invalid/);
  });

  it('should throw for non-object input', () => {
    expect(() => detectSpecVersion(null)).toThrow(/must be a non-null object/);
    expect(() => detectSpecVersion('string' as any)).toThrow(/must be a non-null object/);
    expect(() => detectSpecVersion([] as any)).toThrow(/must be a non-null object/);
  });
});
