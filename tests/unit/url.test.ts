import { describe, it, expect } from 'vitest';

import {
  isUrl,
  resolveUrl,
  parseJsonPointer,
  pathSegments,
  isPathParam,
  extractParamName,
} from '../../src/utils/url';

describe('isUrl', () => {
  it('returns true for http URLs', () => {
    expect(isUrl('http://example.com')).toBe(true);
    expect(isUrl('http://localhost:3000')).toBe(true);
  });

  it('returns true for https URLs', () => {
    expect(isUrl('https://api.example.com')).toBe(true);
    expect(isUrl('https://localhost:3000')).toBe(true);
  });

  it('returns false for non-URL strings', () => {
    expect(isUrl('./local-spec.yaml')).toBe(false);
    expect(isUrl('/api/v1/users')).toBe(false);
    expect(isUrl('data:text/plain,hello')).toBe(false);
    expect(isUrl('')).toBe(false);
  });
});

describe('resolveUrl', () => {
  it('handles fragment references', () => {
    expect(resolveUrl('https://api.example.com/spec.json', '#/components/schemas/User')).toBe(
      'https://api.example.com/spec.json#/components/schemas/User'
    );
  });

  it('handles absolute path references', () => {
    expect(resolveUrl('https://api.example.com/spec.json', '/api/v1/users')).toBe('/api/v1/users');
  });

  it('handles relative path references', () => {
    expect(resolveUrl('https://api.example.com/spec.json', './local-spec.yaml')).toBe(
      'https://api.example.com/spec.json./local-spec.yaml'
    );
  });
});

describe('parseJsonPointer', () => {
  it('parses empty pointer to empty array', () => {
    expect(parseJsonPointer('')).toEqual([]);
  });

  it('parses simple pointer', () => {
    expect(parseJsonPointer('/components/schemas/User')).toEqual(['components', 'schemas', 'User']);
  });

  it('handles escaped slashes', () => {
    expect(parseJsonPointer('/paths/~1users/get')).toEqual(['paths', '/users', 'get']);
  });

  it('handles escaped tildes', () => {
    expect(parseJsonPointer('/properties/~0escaped/~1slash')).toEqual([
      'properties',
      '~escaped',
      '/slash',
    ]);
  });

  it('handles empty segments', () => {
    expect(parseJsonPointer('/a//b')).toEqual(['a', '', 'b']);
  });
});

describe('pathSegments', () => {
  it('splits path by forward slashes', () => {
    expect(pathSegments('/api/v1/users')).toEqual(['api', 'v1', 'users']);
  });

  it('handles colon-separated paths (Google API style)', () => {
    expect(pathSegments('/Products:change-quantity')).toEqual(['Products', 'change-quantity']);
  });

  it('handles mixed separators', () => {
    expect(pathSegments('/api/v1/Products:change-quantity')).toEqual([
      'api',
      'v1',
      'Products',
      'change-quantity',
    ]);
  });

  it('filters out empty segments', () => {
    expect(pathSegments('//a//b/')).toEqual(['a', 'b']);
    expect(pathSegments(':a:b:')).toEqual(['a', 'b']);
  });
});

describe('isPathParam', () => {
  it('returns true for path parameters with curly braces', () => {
    expect(isPathParam('{userId}')).toBe(true);
    expect(isPathParam('{productId}')).toBe(true);
    expect(isPathParam('{user_id}')).toBe(true);
    expect(isPathParam('{user_name}')).toBe(true);
  });

  it('returns false for non-parameter segments', () => {
    expect(isPathParam('users')).toBe(false);
    expect(isPathParam(':userId')).toBe(false);
    expect(isPathParam('')).toBe(false);
    expect(isPathParam('{userId')).toBe(false);
    expect(isPathParam('userId}')).toBe(false);
  });
});

describe('extractParamName', () => {
  it('extracts parameter name from braces', () => {
    expect(extractParamName('{userId}')).toBe('userId');
    expect(extractParamName('{productId}')).toBe('productId');
    expect(extractParamName('{user_id}')).toBe('user_id');
    expect(extractParamName('{user_name}')).toBe('user_name');
  });

  it('throws error for invalid parameter segments', () => {
    expect(() => extractParamName('users')).toThrow('Segment is not a path parameter: users');
    expect(() => extractParamName(':userId')).toThrow('Segment is not a path parameter: :userId');
    expect(() => extractParamName('{userId')).toThrow('Segment is not a path parameter: {userId');
    expect(() => extractParamName('userId}')).toThrow('Segment is not a path parameter: userId}');
  });
});
