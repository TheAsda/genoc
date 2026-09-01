import { describe, it, expect } from 'vitest';

import type { SchemaObject } from '../../src/types/openapi.js';
import {
  sanitizeTypeName,
  buildSchemaRenameMap,
  RESERVED_TYPE_NAMES,
  sanitizeJsDocText,
  formatJsDocValue,
  buildFieldJsDocLines,
  buildTypeJsDoc,
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

describe('sanitizeJsDocText', () => {
  it('passes plain text through unchanged', () => {
    expect(sanitizeJsDocText('plain text')).toBe('plain text');
  });

  it('escapes */ sequence', () => {
    expect(sanitizeJsDocText('has */ inside')).toBe('has *\\/ inside');
  });

  it('escapes */ inside a JSON-stringified value', () => {
    expect(sanitizeJsDocText('"a*/b"')).toBe('"a*\\/b"');
  });

  it('flattens LF newlines to single spaces', () => {
    expect(sanitizeJsDocText('line1\nline2\nline3')).toBe('line1 line2 line3');
  });

  it('normalizes CRLF before flattening', () => {
    expect(sanitizeJsDocText('line1\r\nline2')).toBe('line1 line2');
  });

  it('trims leading and trailing whitespace', () => {
    expect(sanitizeJsDocText('   padded text   ')).toBe('padded text');
  });

  it('does not wrap or truncate long lines', () => {
    const long = 'x'.repeat(500);
    expect(sanitizeJsDocText(long)).toBe(long);
  });

  it('preserves unicode text', () => {
    expect(sanitizeJsDocText('héllo → 世界 🎉')).toBe('héllo → 世界 🎉');
  });
});

describe('formatJsDocValue', () => {
  it('stringifies numbers', () => {
    expect(formatJsDocValue(42)).toBe('42');
  });

  it('stringifies strings with quotes', () => {
    expect(formatJsDocValue('hello')).toBe('"hello"');
  });

  it('stringifies null', () => {
    expect(formatJsDocValue(null)).toBe('null');
  });

  it('stringifies booleans', () => {
    expect(formatJsDocValue(true)).toBe('true');
  });

  it('stringifies objects without indent', () => {
    expect(formatJsDocValue({ a: 1 })).toBe('{"a":1}');
  });

  it('stringifies arrays without indent', () => {
    expect(formatJsDocValue([1, 2])).toBe('[1,2]');
  });

  it('returns null for undefined', () => {
    expect(formatJsDocValue(undefined)).toBeNull();
  });
});

describe('buildFieldJsDocLines', () => {
  it('returns description as first segment', () => {
    expect(buildFieldJsDocLines({ description: 'The name.' })).toEqual(['The name.']);
  });

  it('sanitizes */ in description', () => {
    expect(buildFieldJsDocLines({ description: 'a */ b' })).toEqual(['a *\\/ b']);
  });

  it('flattens multiline description (LF)', () => {
    expect(buildFieldJsDocLines({ description: 'a\nb' })).toEqual(['a b']);
  });

  it('flattens multiline description (CRLF)', () => {
    expect(buildFieldJsDocLines({ description: 'a\r\nb' })).toEqual(['a b']);
  });

  it('skips empty-string description', () => {
    expect(buildFieldJsDocLines({ description: '' })).toEqual([]);
  });

  it('skips whitespace-only description', () => {
    expect(buildFieldJsDocLines({ description: '   \n  ' })).toEqual([]);
  });

  it('passes through >200-char description unwrapped', () => {
    const long = 'y'.repeat(250);
    expect(buildFieldJsDocLines({ description: long })).toEqual([long]);
  });

  it('preserves unicode description', () => {
    expect(buildFieldJsDocLines({ description: '名前 → name' })).toEqual(['名前 → name']);
  });

  it('emits @deprecated only when deprecated === true', () => {
    expect(buildFieldJsDocLines({ deprecated: true })).toEqual(['@deprecated']);
  });

  it('does not emit @deprecated for truthy non-boolean values', () => {
    expect(buildFieldJsDocLines({ deprecated: 'yes' as unknown as boolean })).toEqual([]);
    expect(buildFieldJsDocLines({ deprecated: 1 as unknown as boolean })).toEqual([]);
  });

  it('does not emit @deprecated when false', () => {
    expect(buildFieldJsDocLines({ deprecated: false })).toEqual([]);
  });

  it('emits @default for string default, escaping */ after stringify', () => {
    expect(buildFieldJsDocLines({ default: 'a*/b' })).toEqual(['@default "a*\\/b"']);
  });

  it('emits @default null for explicit null default', () => {
    expect(buildFieldJsDocLines({ default: null })).toEqual(['@default null']);
  });

  it('emits @default for object default without indent', () => {
    expect(buildFieldJsDocLines({ default: { a: 1 } })).toEqual(['@default {"a":1}']);
  });

  it('skips @default when default is undefined', () => {
    expect(buildFieldJsDocLines({ default: undefined })).toEqual([]);
  });

  it('emits one @example per entry of the examples array', () => {
    expect(buildFieldJsDocLines({ examples: [1, 2] })).toEqual(['@example 1', '@example 2']);
  });

  it('emits 3.0 example before 3.1 examples', () => {
    expect(buildFieldJsDocLines({ example: 42, examples: [1, 2] })).toEqual([
      '@example 42',
      '@example 1',
      '@example 2',
    ]);
  });

  it('skips examples when the array is empty', () => {
    expect(buildFieldJsDocLines({ examples: [] })).toEqual([]);
  });

  it('escapes */ inside example values', () => {
    expect(buildFieldJsDocLines({ example: 'x*/y' })).toEqual(['@example "x*\\/y"']);
  });

  it('emits @title when title is truthy', () => {
    expect(buildFieldJsDocLines({ title: 'Foo' })).toEqual(['@title Foo']);
  });

  it('skips @title when title is empty', () => {
    expect(buildFieldJsDocLines({ title: '' })).toEqual([]);
  });

  it('orders all five fields exactly: description, @deprecated, @default, @example, @title', () => {
    const schema: SchemaObject = {
      description: 'Desc',
      deprecated: true,
      default: { a: 1 },
      example: 42,
      title: 'Foo',
    };
    expect(buildFieldJsDocLines(schema)).toEqual([
      'Desc',
      '@deprecated',
      '@default {"a":1}',
      '@example 42',
      '@title Foo',
    ]);
  });
});

describe('buildTypeJsDoc', () => {
  it('returns empty string when schema has no metadata', () => {
    expect(buildTypeJsDoc({})).toBe('');
  });

  it('returns empty string when description is whitespace-only', () => {
    expect(buildTypeJsDoc({ description: '   ' })).toBe('');
  });

  it('renders a single segment as a single-line JSDoc', () => {
    expect(buildTypeJsDoc({ description: 'Only line.' })).toBe('/** Only line. */');
  });

  it('renders two segments as a multiline block with blank separators', () => {
    expect(buildTypeJsDoc({ description: 'A', deprecated: true })).toBe(
      '/**\n * A\n *\n * @deprecated\n */'
    );
  });

  it('renders three segments as a multiline block', () => {
    expect(buildTypeJsDoc({ description: 'A', default: 1, title: 'T' })).toBe(
      '/**\n * A\n *\n * @default 1\n *\n * @title T\n */'
    );
  });
});
