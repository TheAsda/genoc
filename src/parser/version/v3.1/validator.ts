import { specViolation, type SpecLinkKey } from '../spec-links.js';
import { validateSecurity } from '../validate-security.js';
import type { ValidationResult } from '../validate.js';

/**
 * Every violation in this file belongs to the 3.1 dialect;
 * bind it once so call sites stay key-and-message only.
 */
const violation = (key: SpecLinkKey, message: string): string => specViolation('3.1', key, message);

/**
 * Validate a raw OpenAPI 3.1.x specification.
 *
 * 3.1-specific validation rules:
 * - `openapi` must start with "3.1"
 * - at least one of `paths`, `components`, or `webhooks` (unlike 3.0 where `paths` is required)
 * - `info` with `title` and `version` required
 * - `paths` must be an object when present
 * - `components.schemas` entries must be objects, validated recursively for 3.0-only features
 * - Warns about 3.0-only features in schemas: `nullable`, boolean `exclusiveMinimum`/`exclusiveMaximum`,
 *   array-form `items` (tuples must use `prefixItems` in 3.1)
 * - Accepts `type` as array, `$schema`, `$id`, `$comment`, `const`, `examples`, and `$ref` siblings
 *   (all legal in 3.1 via JSON Schema 2020-12)
 * - Accepts schema-level `example` (deprecated in 3.1 but still legal)
 * - Validates `components.securitySchemes` and `security` requirements (shared rules;
 *   `mutualTLS` accepted, non-empty scopes for non-oauth2/openIdConnect schemes allowed as role names)
 */
export function validateSpec31(spec: unknown): ValidationResult {
  const errors: string[] = [];

  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    errors.push(violation('document-root', 'Document must be an object'));
    return { valid: false, errors };
  }

  const s = spec as Record<string, unknown>;

  if (!s.openapi || typeof s.openapi !== 'string') {
    errors.push(
      violation(
        'openapi-field',
        "OpenAPI specification must have an 'openapi' field with string value"
      )
    );
  } else if (!s.openapi.startsWith('3.1')) {
    errors.push(
      violation('openapi-field', `OpenAPI version must start with '3.1', got: ${s.openapi}`)
    );
  }

  if (!s.info || typeof s.info !== 'object' || Array.isArray(s.info)) {
    errors.push(
      violation('info-object', "OpenAPI specification must have an 'info' field with object value")
    );
  } else {
    const info = s.info as Record<string, unknown>;
    if (typeof info.title !== 'string') {
      errors.push(
        violation('info-title', "Info object must have a 'title' field with string value")
      );
    }
    if (typeof info.version !== 'string') {
      errors.push(
        violation('info-version', "Info object must have a 'version' field with string value")
      );
    }
  }

  if (!s.paths && !s.components && !s.webhooks) {
    // Not a spec violation: all three fields are optional in 3.1; the check
    // exists because an empty document gives genoc nothing to generate.
    errors.push(
      "OpenAPI specification must have at least one of 'paths', 'components', or 'webhooks'"
    );
  }

  if (s.paths) {
    if (typeof s.paths !== 'object' || Array.isArray(s.paths)) {
      errors.push(violation('paths-object', "'paths' field must be an object"));
    }
  }

  if (s.components && typeof s.components === 'object' && !Array.isArray(s.components)) {
    const components = s.components as Record<string, unknown>;
    if (components.schemas) {
      if (typeof components.schemas !== 'object' || Array.isArray(components.schemas)) {
        errors.push(violation('components-schemas', "'components.schemas' must be an object"));
      } else {
        for (const [key, schema] of Object.entries(components.schemas)) {
          if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
            errors.push(violation('schema-object', `Schema '${key}' must be an object`));
          } else {
            validateSchema31(schema, `components.schemas.${key}`, errors);
          }
        }
      }
    }
  }

  validateSecurity(s, '3.1', errors);

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Recursively validate a schema object for 3.1-specific rules.
 * Detects 3.0-only features and reports them as errors.
 */
function validateSchema31(schema: unknown, path: string, errors: string[]): void {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return;
  }

  const s = schema as Record<string, unknown>;

  if ('nullable' in s) {
    errors.push(
      violation('schema-object', `Schema '${path}' uses 'nullable' which is a 3.0-only feature`)
    );
  }

  if (typeof s.exclusiveMinimum === 'boolean') {
    errors.push(
      violation(
        'schema-object',
        `Schema '${path}' uses 'exclusiveMinimum' as a boolean which is a 3.0-only feature`
      )
    );
  }

  if (typeof s.exclusiveMaximum === 'boolean') {
    errors.push(
      violation(
        'schema-object',
        `Schema '${path}' uses 'exclusiveMaximum' as a boolean which is a 3.0-only feature`
      )
    );
  }

  if (s.items !== undefined && Array.isArray(s.items)) {
    errors.push(
      violation(
        'schema-object',
        `Schema '${path}' uses 'items' as an array which is not allowed in 3.1 (use 'prefixItems')`
      )
    );
  }

  if (s.properties && typeof s.properties === 'object' && !Array.isArray(s.properties)) {
    for (const [key, prop] of Object.entries(s.properties as Record<string, unknown>)) {
      validateSchema31(prop, `${path}.properties.${key}`, errors);
    }
  }

  if (s.items && typeof s.items === 'object' && !Array.isArray(s.items)) {
    validateSchema31(s.items, `${path}.items`, errors);
  }

  if (
    s.additionalProperties &&
    typeof s.additionalProperties === 'object' &&
    !Array.isArray(s.additionalProperties)
  ) {
    validateSchema31(s.additionalProperties, `${path}.additionalProperties`, errors);
  }

  if (Array.isArray(s.allOf)) {
    (s.allOf as unknown[]).forEach((item, i) => {
      validateSchema31(item, `${path}.allOf[${i}]`, errors);
    });
  }

  if (Array.isArray(s.oneOf)) {
    (s.oneOf as unknown[]).forEach((item, i) => {
      validateSchema31(item, `${path}.oneOf[${i}]`, errors);
    });
  }

  if (Array.isArray(s.anyOf)) {
    (s.anyOf as unknown[]).forEach((item, i) => {
      validateSchema31(item, `${path}.anyOf[${i}]`, errors);
    });
  }

  if (Array.isArray(s.prefixItems)) {
    (s.prefixItems as unknown[]).forEach((item, i) => {
      validateSchema31(item, `${path}.prefixItems[${i}]`, errors);
    });
  }
}
