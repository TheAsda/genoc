import type { AnalyzedOperation } from '../analyzer/path-analyzer.js';
import type { SchemaObject } from '../types/openapi.js';
/**
 * TypeScript/JavaScript reserved words, matched case-sensitively: a type
 * named "Null" or "Class" is legal, only the exact lowercase keywords are.
 */
const RESERVED_WORDS: ReadonlySet<string> = new Set([
  'abstract',
  'any',
  'as',
  'asserts',
  'assert',
  'async',
  'await',
  'boolean',
  'break',
  'case',
  'catch',
  'class',
  'continue',
  'const',
  'constructor',
  'debugger',
  'declare',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'from',
  'function',
  'get',
  'if',
  'implements',
  'import',
  'in',
  'infer',
  'instanceof',
  'interface',
  'is',
  'keyof',
  'let',
  'module',
  'namespace',
  'never',
  'new',
  'null',
  'number',
  'object',
  'package',
  'private',
  'protected',
  'public',
  'readonly',
  'require',
  'return',
  'satisfies',
  'set',
  'static',
  'string',
  'super',
  'switch',
  'symbol',
  'this',
  'throw',
  'true',
  'try',
  'type',
  'typeof',
  'undefined',
  'unique',
  'unknown',
  'var',
  'void',
  'while',
  'with',
  'yield',
]);

function isReservedTypeName(name: string): boolean {
  return RESERVED_WORDS.has(name);
}

/**
 * Reserved type names used by the generated output's built-in classes,
 * functions, and types. User-defined schema names that collide with these
 * are automatically renamed with a suffix to prevent duplicate identifiers.
 */
export const RESERVED_TYPE_NAMES: ReadonlySet<string> = new Set([
  // Classes in contracts.ts
  'StreamResponse',
  'ErrorResponse',
  'ApiError',
  'UnspecifiedApiError',
  'DefaultApiError',
  'RequesterFailError',
  // Types / functions in client.ts
  'Requester',
  'isDefinedError',
  'decorateWithErrors',
  'ApiClient',
  // Interface in contracts.ts (when file uploads present)
  'FileInput',
]);

/** Default module specifier generated code imports shared runtime classes from. */
export const DEFAULT_RUNTIME_IMPORT_PATH = 'genoc/runtime';

/**
 * Sanitize a schema type name into a valid TypeScript identifier.
 *
 * Any run of non-identifier characters (dots, brackets, backticks, hyphens,
 * spaces, slashes, ...) splits the name into segments that are re-joined in
 * PascalCase:
 *
 *   "Api.Error"  → "ApiError"
 *   "User[Dto]"  → "UserDto"
 *   "my-schema"  → "MySchema"
 *   "payment id" → "PaymentId"
 *
 * Names that are already valid identifiers pass through unchanged
 * ("User", "my_schema", "mySchema", "$Foo", "Данные"). Results that would
 * start with a digit ("2FA") get an "_" prefix, as do exact reserved words
 * ("class" → "_class"). Names with no usable characters collapse to "_".
 */
export function sanitizeTypeName(name: string): string {
  if (!name) return '_';

  // Exact reserved words keep their casing and get an "_" prefix
  // ("class" → "_class"), while "Null" / "Class" are legal and pass through.
  if (isReservedTypeName(name)) return `_${name}`;

  const isValidIdentifier = /^[\p{ID_Start}$_][\p{ID_Continue}$]*$/u.test(name);
  if (isValidIdentifier) return name;

  const segments = name.match(/[\p{ID_Continue}$]+/gu) ?? [];
  const result = segments
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join('');

  if (result === '') return '_';
  if (/^\d/.test(result)) return `_${result}`;
  if (isReservedTypeName(result)) return `_${result}`;
  return result;
}

/**
 * Build a mapping of raw schema names → renamed names for any whose
 * sanitized name collides with a reserved type name or with another
 * schema's sanitized name (e.g. "User-Dto" and "User[Dto]" both → "UserDto").
 *
 * The map is keyed by the raw schema name (component keys are unique by
 * construction), so callers resolve raw $ref segments / schema keys first
 * and fall back to sanitizeTypeName for the common no-collision case.
 * Numbered suffixes are used when the first renamed candidate also collides.
 */
export function buildSchemaRenameMap(
  schemaNames: Iterable<string>,
  reserved: ReadonlySet<string>,
  suffix = 'Model'
): Map<string, string> {
  const renameMap = new Map<string, string>();
  const used = new Set<string>(reserved);

  for (const name of schemaNames) {
    const sanitized = sanitizeTypeName(name);
    if (!used.has(sanitized)) {
      used.add(sanitized);
      continue;
    }
    let candidate = `${sanitized}${suffix}`;
    let counter = 2;
    while (used.has(candidate)) {
      candidate = `${sanitized}${suffix}${counter}`;
      counter += 1;
    }
    used.add(candidate);
    renameMap.set(name, candidate);
  }
  return renameMap;
}

/**
 * Convert a string to PascalCase, handling camelCase, kebab-case, snake_case,
 * and colon-separated segments.
 */
export function toPascalCase(str: string): string {
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[-_\s:]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

/**
 * Build a PascalCase type-name prefix from an operation's method + path.
 * get + /api/v1/products → "GetApiV1Products"
 */
export function getOperationTypePrefix(op: AnalyzedOperation): string {
  const methodPascal = op.method.charAt(0).toUpperCase() + op.method.slice(1).toLowerCase();

  const segments = op.path
    .split('/')
    .filter((s) => s.length > 0)
    .map((s) => {
      const cleaned = s.replace(/[{}]/g, '');
      return sanitizeTypeName(toPascalCase(cleaned));
    });

  return methodPascal + segments.join('');
}

/**
 * Determine the success return type for an operation.
 */
export function getSuccessType(op: AnalyzedOperation): string {
  const successResponses = op.responses.filter((r) => r.isSuccess);

  if (successResponses.length === 0) {
    return 'unknown';
  }

  const noContent = successResponses.find((r) => r.tsType === 'void');
  const hasOnlyNoContent = noContent && successResponses.every((r) => r.tsType === 'void');
  if (hasOnlyNoContent) {
    return 'void';
  }

  const withSchema = successResponses.filter((r) => r.tsType !== 'void');

  if (withSchema.length === 0) {
    return 'void';
  }

  const prefix = getOperationTypePrefix(op);
  const types = withSchema.map(() => `${prefix}Response`);

  const unique = [...new Set(types)];
  return unique.join(' | ');
}

/**
 * Determine the error type name for an operation.
 */
export function getErrorType(op: AnalyzedOperation): string {
  const prefix = getOperationTypePrefix(op);
  const errorResponses = op.responses.filter((r) => !r.isSuccess && r.statusCode !== 'default');
  if (errorResponses.length === 0) {
    return 'never';
  }
  return `${prefix}Errors`;
}

/**
 * Generate the auto-generated header comment.
 */
export function makeHeader(version: string): string {
  return `// Auto-generated by genoc from OpenAPI ${version} spec. DO NOT EDIT.`;
}

/**
 * Sanitize free-form text for safe inclusion inside a JSDoc comment.
 *
 * Normalizes CRLF to LF, flattens remaining newlines into single spaces,
 * escapes the comment-closing sequence (asterisk + slash) as `*\/`, and
 * trims leading/trailing whitespace. No other transformation is applied —
 * no HTML stripping, no markdown processing, no wrapping.
 */
export function sanitizeJsDocText(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\n/g, ' ').replace(/\*\//g, '*\\/').trim();
}

/**
 * Format an arbitrary metadata value for a JSDoc tag using JSON.stringify
 * (no indent). Returns `null` when stringify yields `undefined` (e.g. for
 * `undefined` or function values) — callers should skip the tag entirely.
 */
export function formatJsDocValue(value: unknown): string | null {
  const json = JSON.stringify(value);
  return json === undefined ? null : json;
}

/**
 * Build the ordered JSDoc content segments for a schema-backed property.
 *
 * Order (frozen): description → `@deprecated` → `@default` → `@example`(s)
 * → `@title`. Segments are skipped when their value is absent, empty, or
 * whitespace-only. Sanitization is applied AFTER stringification for
 * `@default` / `@example` values.
 */
export function buildFieldJsDocLines(schema: SchemaObject): string[] {
  const lines: string[] = [];

  if (schema.description !== undefined && schema.description.trim() !== '') {
    lines.push(sanitizeJsDocText(schema.description));
  }

  if (schema.deprecated === true) {
    lines.push('@deprecated');
  }

  if (schema.default !== undefined) {
    const formatted = formatJsDocValue(schema.default);
    if (formatted !== null) {
      lines.push(`@default ${sanitizeJsDocText(formatted)}`);
    }
  }

  if (schema.example !== undefined) {
    const formatted = formatJsDocValue(schema.example);
    if (formatted !== null) {
      lines.push(`@example ${sanitizeJsDocText(formatted)}`);
    }
  }

  if (schema.examples !== undefined) {
    for (const value of schema.examples) {
      const formatted = formatJsDocValue(value);
      if (formatted !== null) {
        lines.push(`@example ${sanitizeJsDocText(formatted)}`);
      }
    }
  }

  if (schema.title) {
    lines.push(`@title ${sanitizeJsDocText(schema.title)}`);
  }

  return lines;
}

/**
 * Render a schema's JSDoc metadata as a complete comment block.
 *
 * 0 segments → `''`; exactly 1 segment → single-line `/** text *\/`;
 * ≥2 segments → multiline block with a blank ` *` line between segments.
 */
export function buildTypeJsDoc(schema: SchemaObject): string {
  const lines = buildFieldJsDocLines(schema);
  if (lines.length === 0) return '';
  if (lines.length === 1) return `/** ${lines[0]} */`;
  return `/**\n${lines.map((line) => ` * ${line}`).join('\n *\n')}\n */`;
}
