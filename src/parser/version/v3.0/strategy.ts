import type { ValidationResult } from '../../validators.js';
import type { NormalizedSpec } from '../normalized-spec.js';
import type { VersionStrategy } from '../version-strategy.js';
import { normalizeSpec30 } from './normalizer.js';
import { validateSpec30 } from './validator.js';

/**
 * Version strategy for OpenAPI 3.0.x specifications.
 *
 * OpenAPI 3.0 is the original version of the OpenAPI specification and differs
 * from 3.1 in several key ways:
 * - `nullable` keyword (not type arrays with "null")
 * - `exclusiveMinimum`/`exclusiveMaximum` as booleans modifying `minimum`/`maximum`
 * - `$ref` siblings are ignored (not merged)
 * - `example` keyword (not `examples`)
 * - `paths` is required
 */
export class V3_0_VersionStrategy implements VersionStrategy {
  version(): string {
    return '3.0';
  }

  normalizeSpec(rawSpec: unknown): NormalizedSpec {
    return normalizeSpec30(rawSpec);
  }

  validateSpec(spec: NormalizedSpec): ValidationResult {
    return validateSpec30(spec);
  }
}
