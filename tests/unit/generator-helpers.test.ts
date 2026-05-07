import { describe, it, expect } from 'vitest';

import {
  sanitizeTypeName,
  buildSchemaRenameMap,
  RESERVED_TYPE_NAMES,
} from '../../src/utils/generator-helpers.js';

describe('sanitizeTypeName', () => {
  it('returns name unchanged when it has no dots', () => {
    expect(sanitizeTypeName('User')).toBe('User');
  });

  it('converts single-dot name to PascalCase', () => {
    expect(sanitizeTypeName('Api.Error')).toBe('ApiError');
  });

  it('converts multi-dot name to PascalCase', () => {
    expect(sanitizeTypeName('Namespace.Namespace2.Class')).toBe('NamespaceNamespace2Class');
  });

  it('preserves already PascalCase names without dots', () => {
    expect(sanitizeTypeName('MyType')).toBe('MyType');
  });

  it('handles single-character segments', () => {
    expect(sanitizeTypeName('a.b')).toBe('AB');
  });

  it('handles leading dot', () => {
    expect(sanitizeTypeName('.User')).toBe('User');
  });
});

describe('buildSchemaRenameMap', () => {
  it('detects collision after sanitization', () => {
    const map = buildSchemaRenameMap(['Api.Error'], RESERVED_TYPE_NAMES);
    expect(map.get('ApiError')).toBe('ApiErrorModel');
  });

  it('does not rename non-colliding dotted names', () => {
    const map = buildSchemaRenameMap(['Models.User'], RESERVED_TYPE_NAMES);
    expect(map.has('ModelsUser')).toBe(false);
  });

  it('detects direct collision without dots', () => {
    const map = buildSchemaRenameMap(['ApiError'], RESERVED_TYPE_NAMES);
    expect(map.get('ApiError')).toBe('ApiErrorModel');
  });

  it('returns empty map when no collisions', () => {
    const map = buildSchemaRenameMap(['User', 'Product'], RESERVED_TYPE_NAMES);
    expect(map.size).toBe(0);
  });
});
