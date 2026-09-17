import type { ValidationResult } from '../../validators.js';
import type { NormalizedSpec } from '../normalized-spec.js';
import type { VersionStrategy } from '../version-strategy.js';

/**
 * Stub strategy for OpenAPI 3.2.x specifications
 *
 * This strategy matches OpenAPI 3.2.x specifications but throws
 * "not yet supported" errors until full implementation is available.
 */
export class V3_2_VersionStrategy implements VersionStrategy {
  /**
   * Get the supported OpenAPI version
   */
  version(): string {
    return '3.2';
  }

  /**
   * Normalize a raw OpenAPI specification to a consistent format
   * Throws "not yet supported" error
   */
  normalizeSpec(_rawSpec: unknown): NormalizedSpec {
    throw new Error('OpenAPI 3.2 is not yet supported. Supported versions: 3.0, 3.1');
  }

  /**
   * Validate the normalized specification
   * Throws "not yet supported" error
   */
  validateSpec(_spec: NormalizedSpec): ValidationResult {
    throw new Error('OpenAPI 3.2 is not yet supported. Supported versions: 3.0, 3.1');
  }
}
