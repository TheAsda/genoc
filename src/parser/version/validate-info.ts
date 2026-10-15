/**
 * Shared Info Object validation for the 3.0 and 3.1 validators.
 *
 * Rules are identical across dialects — every published dialect (3.0, 3.1,
 * 3.2 alike) requires `info` to be an object carrying `title` and `version`
 * strings. Presence and type only: the spec puts no constraint on the
 * values, so `title: ""` is a valid title.
 */

import { specViolation } from './spec-links.js';

export function validateInfo(
  spec: Record<string, unknown>,
  version: '3.0' | '3.1',
  errors: string[]
): void {
  if (!spec.info || typeof spec.info !== 'object' || Array.isArray(spec.info)) {
    errors.push(
      specViolation(
        version,
        'info-object',
        "OpenAPI specification must have an 'info' field with object value"
      )
    );
    return;
  }
  const info = spec.info as Record<string, unknown>;
  if (typeof info.title !== 'string') {
    errors.push(
      specViolation(
        version,
        'info-title',
        "Info object must have a 'title' field with string value"
      )
    );
  }
  if (typeof info.version !== 'string') {
    errors.push(
      specViolation(
        version,
        'info-version',
        "Info object must have a 'version' field with string value"
      )
    );
  }
}
