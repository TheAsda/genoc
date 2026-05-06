import type { ValidationResult } from '../../validators.js';

/**
 * Validate a raw OpenAPI 3.0.x specification.
 *
 * 3.0-specific validation rules:
 * - `openapi` must start with "3.0"
 * - `paths` is required (unlike 3.1 where paths/components/webhooks is flexible)
 * - `info` with `title` and `version` required
 * - Warns about 3.1-only features: `webhooks`, `$schema` in schemas, `type` as array
 * - Accepts `nullable` and `example` (valid in 3.0, not in 3.1)
 * - Errors on `items` as array (3.1-only tuple syntax)
 */
export function validateSpec30(spec: unknown): ValidationResult {
  const errors: string[] = [];

  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    errors.push('Document must be an object');
    return { valid: false, errors };
  }

  const s = spec as Record<string, unknown>;

  if (!s.openapi || typeof s.openapi !== 'string') {
    errors.push("OpenAPI specification must have an 'openapi' field with string value");
  } else if (!s.openapi.startsWith('3.0')) {
    errors.push(`OpenAPI version must start with '3.0', got: ${s.openapi}`);
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

  if (!s.paths || typeof s.paths !== 'object' || Array.isArray(s.paths)) {
    errors.push("OpenAPI 3.0 specification must have a 'paths' field with object value");
  }

  if (s.paths && typeof s.paths === 'object' && !Array.isArray(s.paths)) {
    for (const [pathKey, pathItem] of Object.entries(s.paths as Record<string, unknown>)) {
      if (!pathItem || typeof pathItem !== 'object' || Array.isArray(pathItem)) {
        errors.push(`Path item '${pathKey}' must be an object`);
      }
    }
  }

  if (s.components && typeof s.components === 'object' && !Array.isArray(s.components)) {
    const components = s.components as Record<string, unknown>;
    if (components.schemas) {
      if (Array.isArray(components.schemas) || typeof components.schemas !== 'object') {
        errors.push("'components.schemas' must be an object");
      } else {
        const schemas = components.schemas as Record<string, unknown>;
        for (const [key, schema] of Object.entries(schemas)) {
          if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
            errors.push(`Schema '${key}' must be an object`);
          } else {
            validateSchema30(schema, `components.schemas.${key}`, errors);
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

/**
 * Recursively validate a schema object for 3.0-specific rules.
 * Detects 3.1-only features and reports them as errors.
 */
function validateSchema30(schema: unknown, path: string, errors: string[]): void {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return;
  }

  const s = schema as Record<string, unknown>;

  if (Array.isArray(s.type)) {
    errors.push(`Schema '${path}' uses 'type' as an array which is a 3.1-only feature`);
  }

  if ('$schema' in s) {
    errors.push(`Schema '${path}' uses '$schema' which is a 3.1-only feature`);
  }

  if (s.items !== undefined && Array.isArray(s.items)) {
    errors.push(
      `Schema '${path}' uses 'items' as an array (tuple syntax) which is a 3.1-only feature`
    );
  }

  if (s.properties && typeof s.properties === 'object' && !Array.isArray(s.properties)) {
    for (const [key, prop] of Object.entries(s.properties as Record<string, unknown>)) {
      validateSchema30(prop, `${path}.properties.${key}`, errors);
    }
  }

  if (s.items && typeof s.items === 'object' && !Array.isArray(s.items)) {
    validateSchema30(s.items, `${path}.items`, errors);
  }

  if (
    s.additionalProperties &&
    typeof s.additionalProperties === 'object' &&
    !Array.isArray(s.additionalProperties)
  ) {
    validateSchema30(s.additionalProperties, `${path}.additionalProperties`, errors);
  }

  if (Array.isArray(s.allOf)) {
    (s.allOf as unknown[]).forEach((item, i) => {
      validateSchema30(item, `${path}.allOf[${i}]`, errors);
    });
  }

  if (Array.isArray(s.oneOf)) {
    (s.oneOf as unknown[]).forEach((item, i) => {
      validateSchema30(item, `${path}.oneOf[${i}]`, errors);
    });
  }

  if (Array.isArray(s.anyOf)) {
    (s.anyOf as unknown[]).forEach((item, i) => {
      validateSchema30(item, `${path}.anyOf[${i}]`, errors);
    });
  }
}
