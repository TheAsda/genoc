import type { VersionStrategy } from './version/version-strategy.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateOpenAPIVersion(version: string): boolean {
  return typeof version === 'string' && version.startsWith('3.1');
}

export function validateSpec(doc: unknown, strategy?: VersionStrategy): ValidationResult {
  if (strategy) {
    try {
      const normalized = strategy.normalizeSpec(doc);
      return strategy.validateSpec(normalized);
    } catch (error) {
      // normalizeSpec may throw for structurally invalid specs;
      // but re-throw "not yet supported" errors
      if (typeof error === 'object' && error !== null && 'message' in error) {
        const errorMessage = (error as { message: string }).message;
        if (errorMessage.includes('not yet supported')) {
          throw error;
        }
      }
      // fall through to default 3.1-only validation below
    }
  }

  const errors: string[] = [];

  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    errors.push('Document must be an object');
    return { valid: false, errors };
  }

  const spec = doc as Record<string, unknown>;

  // Check openapi field
  if (!spec.openapi || typeof spec.openapi !== 'string') {
    errors.push("OpenAPI specification must have an 'openapi' field with string value");
  } else if (!validateOpenAPIVersion(spec.openapi)) {
    errors.push(`OpenAPI version must start with '3.1', got: ${spec.openapi}`);
  }

  // Check info field
  if (!spec.info || typeof spec.info !== 'object' || Array.isArray(spec.info)) {
    errors.push("OpenAPI specification must have an 'info' field with object value");
  } else {
    const info = spec.info as Record<string, unknown>;

    if (!info.title || typeof info.title !== 'string') {
      errors.push("Info object must have a 'title' field with string value");
    }

    if (!info.version || typeof info.version !== 'string') {
      errors.push("Info object must have a 'version' field with string value");
    }
  }

  // Check at least one of paths, components, webhooks exists
  if (!spec.paths && !spec.components && !spec.webhooks) {
    errors.push(
      "OpenAPI specification must have at least one of 'paths', 'components', or 'webhooks'"
    );
  }

  // Validate paths if it exists
  if (spec.paths) {
    if (Array.isArray(spec.paths) || typeof spec.paths !== 'object') {
      errors.push("'paths' field must be an object");
    }
  }

  // Validate components.schemas if it exists
  if (spec.components && typeof spec.components === 'object' && !Array.isArray(spec.components)) {
    const components = spec.components as Record<string, unknown>;
    if (components.schemas) {
      if (Array.isArray(components.schemas) || typeof components.schemas !== 'object') {
        errors.push("'components.schemas' must be an object");
      } else {
        const schemas = components.schemas as Record<string, unknown>;
        for (const [key, schema] of Object.entries(schemas)) {
          if (typeof schema !== 'object' || Array.isArray(schema)) {
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
