import type { ValidationResult } from '../validate.js';

/**
 * Validate a raw OpenAPI 3.1.x specification.
 *
 * 3.1-specific validation rules:
 * - `openapi` must start with "3.1"
 * - at least one of `paths`, `components`, or `webhooks` (unlike 3.0 where `paths` is required)
 * - `info` with `title` and `version` required
 * - `paths` must be an object when present
 * - `components.schemas` entries must be objects
 */
export function validateSpec31(spec: unknown): ValidationResult {
  const errors: string[] = [];

  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    errors.push('Document must be an object');
    return { valid: false, errors };
  }

  const s = spec as Record<string, unknown>;

  if (!s.openapi || typeof s.openapi !== 'string') {
    errors.push("OpenAPI specification must have an 'openapi' field with string value");
  } else if (!s.openapi.startsWith('3.1')) {
    errors.push(`OpenAPI version must start with '3.1', got: ${s.openapi}`);
  }

  if (!s.info || typeof s.info !== 'object' || Array.isArray(s.info)) {
    errors.push("OpenAPI specification must have an 'info' field with object value");
  } else {
    const info = s.info as Record<string, unknown>;
    if (!info.title || typeof info.title !== 'string') {
      errors.push("Info object must have a 'title' field with string value");
    }
    if (!info.version || typeof info.version !== 'string') {
      errors.push("Info object must have a 'version' field with string value");
    }
  }

  if (!s.paths && !s.components && !s.webhooks) {
    errors.push(
      "OpenAPI specification must have at least one of 'paths', 'components', or 'webhooks'"
    );
  }

  if (s.paths) {
    if (typeof s.paths !== 'object' || Array.isArray(s.paths)) {
      errors.push("'paths' field must be an object");
    }
  }

  if (s.components && typeof s.components === 'object' && !Array.isArray(s.components)) {
    const components = s.components as Record<string, unknown>;
    if (components.schemas) {
      if (typeof components.schemas !== 'object' || Array.isArray(components.schemas)) {
        errors.push("'components.schemas' must be an object");
      } else {
        for (const [key, schema] of Object.entries(components.schemas)) {
          if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
            errors.push(`Schema '${key}' must be an object`);
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
