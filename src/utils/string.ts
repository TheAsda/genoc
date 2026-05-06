/**
 * String utility functions for OpenAPI client generator
 */

/**
 * Indent each line of a string by the specified level (2 spaces per level)
 * @param str The string to indent
 * @param level Number of levels to indent (each level = 2 spaces)
 * @returns Indented string, or empty string if input is empty
 */
export function indent(str: string, level: number): string {
  if (!str) return '';

  const prefix = '  '.repeat(Math.max(0, level));
  return str
    .split('\n')
    .map((line) => (line ? `${prefix}${line}` : line)) // preserve empty lines without adding extra indentation
    .join('\n');
}

/**
 * Capitalize the first character of a string
 * @param str The string to capitalize
 * @returns String with first character uppercase, rest unchanged
 */
export function capitalize(str: string): string {
  if (!str) return str;
  return str[0].toUpperCase() + str.slice(1);
}

/**
 * Check if a string is a JavaScript/TypeScript reserved word
 * @param str The string to check
 * @returns True if the string is a reserved word
 */
export function isReservedWord(str: string): boolean {
  if (!str) return false;

  const reservedWords = new Set([
    // Keywords
    'class',
    'return',
    'const',
    'let',
    'var',
    'function',
    'if',
    'else',
    'for',
    'while',
    'do',
    'switch',
    'case',
    'break',
    'continue',
    'try',
    'catch',
    'finally',
    'throw',
    'new',
    'this',
    'super',
    'extends',
    'implements',
    'interface',
    'type',
    'enum',
    'abstract',
    'async',
    'await',
    'yield',
    'import',
    'export',
    'from',
    'default',
    'delete',
    'in',
    'instanceof',
    'typeof',
    'void',
    'with',
    'debugger',

    // Literals
    'null',
    'true',
    'false',
    'undefined',
    'nan',
    'NaN',
    'Infinity',

    // TypeScript specific
    'of',
    'as',
    'keyof',
    'readonly',
    'declare',
    'namespace',
    'module',
    'require',
    'public',
    'private',
    'protected',
    'static',
    'constructor',
  ]);

  return reservedWords.has(str.toLowerCase());
}

/**
 * Sanitize a string to make it safe for TypeScript identifier usage
 * @param str The string to sanitize
 * @returns Safe TypeScript identifier
 */
export function sanitizeIdentifier(str: string): string {
  if (!str) return '_';

  if (/^\d/.test(str)) {
    return `_${str}`;
  }

  if (isReservedWord(str)) {
    return `_${str}`;
  }

  const segments = str
    .replace(/[^a-zA-Z0-9]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const commonReserved = new Set([
    'class',
    'const',
    'function',
    'if',
    'else',
    'for',
    'while',
    'return',
    'var',
    'let',
  ]);
  if (segments.length > 0 && commonReserved.has(segments[0].toLowerCase())) {
    const sanitized = str.replace(/[^a-zA-Z0-9]/g, '_');
    const final = sanitized.replace(/_+/g, '_');
    return `_${final}`;
  }

  const ascii = str.replace(/[üöäÜÖÄ]/g, (match) => {
    switch (match) {
      case 'ü':
        return 'u';
      case 'ö':
        return 'o';
      case 'ä':
        return 'a';
      case 'Ü':
        return 'U';
      case 'Ö':
        return 'O';
      case 'Ä':
        return 'A';
      default:
        return match;
    }
  });

  const sanitized = ascii.replace(/[^a-zA-Z0-9$]/g, '_');
  const final = sanitized.replace(/_+/g, '_');

  if (!final || final === '_' || final === '$' || /^[_$]+$/.test(final)) {
    return '_';
  }

  return final;
}

/**
 * Quote a key if needed for TypeScript object literals
 * @param key The key to potentially quote
 * @returns Quoted key if needed, original key otherwise
 */
export function quoteKey(key: string): string {
  if (!key) return '""';

  // Check if the key needs quoting
  const needsQuoting =
    isReservedWord(key) ||
    /[^a-zA-Z0-9_$]/.test(key) ||
    key.startsWith(' ') ||
    key.endsWith(' ') ||
    key === '' ||
    /^\d/.test(key);

  return needsQuoting ? `"${key}"` : key;
}
