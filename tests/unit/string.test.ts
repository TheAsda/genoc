import { describe, it, expect } from 'vitest';

import {
  indent,
  capitalize,
  sanitizeIdentifier,
  isReservedWord,
  quoteKey,
} from '../../src/utils/string';

describe('string utilities', () => {
  describe('indent', () => {
    it('should indent by default level (0)', () => {
      expect(indent('hello', 0)).toBe('hello');
    });

    it('should indent by 2 spaces per level', () => {
      expect(indent('hello', 1)).toBe('  hello');
      expect(indent('hello', 2)).toBe('    hello');
      expect(indent('hello', 3)).toBe('      hello');
    });

    it('should handle empty string', () => {
      expect(indent('', 2)).toBe('');
      expect(indent('  ', 1)).toBe('    ');
    });

    it('should handle single line strings', () => {
      expect(indent('hello world', 1)).toBe('  hello world');
      expect(indent('test', 2)).toBe('    test');
    });

    it('should handle multiple lines with proper indentation', () => {
      const input = 'line1\nline2\nline3';
      const output = '  line1\n  line2\n  line3';
      expect(indent(input, 1)).toBe(output);
    });

    it('should preserve trailing newlines', () => {
      expect(indent('hello\n', 1)).toBe('  hello\n');
      expect(indent('hello\nworld\n', 2)).toBe('    hello\n    world\n');
    });

    it('should handle empty lines correctly', () => {
      const input = 'line1\n\nline2';
      const output = '  line1\n\n  line2';
      expect(indent(input, 1)).toBe(output);
    });

    it('should handle negative levels by not indenting', () => {
      expect(indent('hello', -1)).toBe('hello');
      expect(indent('hello', -5)).toBe('hello');
    });
  });

  describe('capitalize', () => {
    it('should capitalize first character', () => {
      expect(capitalize('hello')).toBe('Hello');
      expect(capitalize('world')).toBe('World');
      expect(capitalize('test string')).toBe('Test string');
    });

    it('should handle single character', () => {
      expect(capitalize('a')).toBe('A');
      expect(capitalize('z')).toBe('Z');
    });

    it('should handle already capitalized', () => {
      expect(capitalize('Hello')).toBe('Hello');
      expect(capitalize('World')).toBe('World');
    });

    it('should handle empty string', () => {
      expect(capitalize('')).toBe('');
    });

    it('should handle numbers and symbols', () => {
      expect(capitalize('1hello')).toBe('1hello');
      expect(capitalize('@hello')).toBe('@hello');
    });

    it('should handle unicode characters', () => {
      expect(capitalize('über')).toBe('Über');
      expect(capitalize('été')).toBe('Été');
    });
  });

  describe('isReservedWord', () => {
    it('should identify reserved words', () => {
      expect(isReservedWord('class')).toBe(true);
      expect(isReservedWord('return')).toBe(true);
      expect(isReservedWord('const')).toBe(true);
      expect(isReservedWord('let')).toBe(true);
      expect(isReservedWord('var')).toBe(true);
      expect(isReservedWord('function')).toBe(true);
      expect(isReservedWord('if')).toBe(true);
      expect(isReservedWord('else')).toBe(true);
      expect(isReservedWord('for')).toBe(true);
      expect(isReservedWord('while')).toBe(true);
    });

    it('should identify reserved words case-insensitively', () => {
      expect(isReservedWord('Class')).toBe(true);
      expect(isReservedWord('RETURN')).toBe(true);
      expect(isReservedWord('Const')).toBe(true);
    });

    it('should identify literals as reserved words', () => {
      expect(isReservedWord('null')).toBe(true);
      expect(isReservedWord('true')).toBe(true);
      expect(isReservedWord('false')).toBe(true);
      expect(isReservedWord('undefined')).toBe(true);
      expect(isReservedWord('NaN')).toBe(true);
    });

    it('should identify TypeScript-specific reserved words', () => {
      expect(isReservedWord('interface')).toBe(true);
      expect(isReservedWord('type')).toBe(true);
      expect(isReservedWord('enum')).toBe(true);
      expect(isReservedWord('abstract')).toBe(true);
      expect(isReservedWord('readonly')).toBe(true);
      expect(isReservedWord('keyof')).toBe(true);
    });

    it('should return false for non-reserved words', () => {
      expect(isReservedWord('hello')).toBe(false);
      expect(isReservedWord('world')).toBe(false);
      expect(isReservedWord('myVar')).toBe(false);
      expect(isReservedWord('foo')).toBe(false);
      expect(isReservedWord('bar')).toBe(false);
    });

    it('should handle empty string', () => {
      expect(isReservedWord('')).toBe(false);
    });

    it('should handle mixed case reserved words', () => {
      expect(isReservedWord('As')).toBe(true);
      expect(isReservedWord('Import')).toBe(true);
      expect(isReservedWord('Export')).toBe(true);
    });
  });

  describe('sanitizeIdentifier', () => {
    it('should leave valid identifiers unchanged', () => {
      expect(sanitizeIdentifier('hello')).toBe('hello');
      expect(sanitizeIdentifier('world')).toBe('world');
      expect(sanitizeIdentifier('myVar')).toBe('myVar');
      expect(sanitizeIdentifier('foo123')).toBe('foo123');
    });

    it('should prefix reserved words with underscore', () => {
      expect(sanitizeIdentifier('class')).toBe('_class');
      expect(sanitizeIdentifier('const')).toBe('_const');
      expect(sanitizeIdentifier('function')).toBe('_function');
      expect(sanitizeIdentifier('if')).toBe('_if');
      expect(sanitizeIdentifier('else')).toBe('_else');
    });

    it('should prefix digit-starting identifiers with underscore', () => {
      expect(sanitizeIdentifier('123abc')).toBe('_123abc');
      expect(sanitizeIdentifier('1test')).toBe('_1test');
      expect(sanitizeIdentifier('9lives')).toBe('_9lives');
    });

    it('should replace special characters with underscores', () => {
      expect(sanitizeIdentifier('my-var')).toBe('my_var');
      expect(sanitizeIdentifier('test@var')).toBe('test_var');
      expect(sanitizeIdentifier('hello.world')).toBe('hello_world');
      expect(sanitizeIdentifier('foo#bar')).toBe('foo_bar');
      expect(sanitizeIdentifier('test-var[0]')).toBe('test_var_0_');
    });

    it('should handle complex sanitization', () => {
      expect(sanitizeIdentifier('class-123-var')).toBe('_class_123_var');
      expect(sanitizeIdentifier('const@var123')).toBe('_const_var123');
      expect(sanitizeIdentifier('if-else-for')).toBe('_if_else_for');
    });

    it('should handle empty string', () => {
      expect(sanitizeIdentifier('')).toBe('_');
    });

    it('should return underscore for all-special-character strings', () => {
      expect(sanitizeIdentifier('!@#$%^&*()')).toBe('_');
    });

    it('should preserve $ and _ in identifiers', () => {
      expect(sanitizeIdentifier('my$var')).toBe('my$var');
      expect(sanitizeIdentifier('_private')).toBe('_private');
      expect(sanitizeIdentifier('$_private')).toBe('$_private');
    });
  });

  describe('quoteKey', () => {
    it('should not quote valid identifier keys', () => {
      expect(quoteKey('hello')).toBe('hello');
      expect(quoteKey('world')).toBe('world');
      expect(quoteKey('myVar')).toBe('myVar');
      expect(quoteKey('foo123')).toBe('foo123');
      expect(quoteKey('_private')).toBe('_private');
    });

    it('should quote reserved words', () => {
      expect(quoteKey('class')).toBe('"class"');
      expect(quoteKey('const')).toBe('"const"');
      expect(quoteKey('function')).toBe('"function"');
      expect(quoteKey('if')).toBe('"if"');
    });

    it('should quote keys with special characters', () => {
      expect(quoteKey('my-var')).toBe('"my-var"');
      expect(quoteKey('test@var')).toBe('"test@var"');
      expect(quoteKey('hello world')).toBe('"hello world"');
      expect(quoteKey('foo#bar')).toBe('"foo#bar"');
    });

    it('should quote keys that start or end with spaces', () => {
      expect(quoteKey(' hello')).toBe('" hello"');
      expect(quoteKey('hello ')).toBe('"hello "');
      expect(quoteKey(' hello ')).toBe('" hello "');
    });

    it('should quote empty string', () => {
      expect(quoteKey('')).toBe('""');
    });

    it('should not quote numbers at start if valid identifier', () => {
      expect(quoteKey('123abc')).toBe('"123abc"');
      expect(quoteKey('1test')).toBe('"1test"');
    });

    it('should quote compound identifiers with special chars', () => {
      expect(quoteKey('my-object.id')).toBe('"my-object.id"');
      expect(quoteKey('user[0]')).toBe('"user[0]"');
      expect(quoteKey('array:items')).toBe('"array:items"');
    });

    it('should quote boolean-like strings', () => {
      expect(quoteKey('true')).toBe('"true"');
      expect(quoteKey('false')).toBe('"false"');
      expect(quoteKey('null')).toBe('"null"');
    });
  });

  describe('edge cases', () => {
    it('should handle unicode characters properly', () => {
      expect(capitalize('über')).toBe('Über');
      expect(sanitizeIdentifier('über-var')).toBe('uber_var');
      expect(quoteKey('über')).toBe('"über"');
    });

    it('should handle very long strings', () => {
      const longStr = 'a'.repeat(1000);
      expect(indent(longStr, 3).length).toBe(1006);
      expect(sanitizeIdentifier(longStr)).toBe(longStr);
    });

    it('should handle strings with newlines in various functions', () => {
      expect(indent('line1\nline2', 1)).toBe('  line1\n  line2');
      expect(sanitizeIdentifier('line\nwith\nnewlines')).toBe('line_with_newlines');
      expect(quoteKey('line\nwith\nnewlines')).toBe('"line\nwith\nnewlines"');
    });
  });
});
