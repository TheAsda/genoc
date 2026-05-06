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
   * Check if this strategy matches the given OpenAPI specification
   */
  matches(spec: unknown): boolean {
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
      return false;
    }

    const specObj = spec as Record<string, unknown>;
    const openapiVersion = specObj.openapi;

    if (typeof openapiVersion === 'string') {
      // Match 3.2.x versions (e.g., "3.2.0", "3.2.1", etc.)
      return openapiVersion.startsWith('3.2');
    }

    return false;
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

  /**
   * Resolve a reference within the document context
   * Throws "not yet supported" error
   */
  resolveRef(_ref: string, _doc: unknown, _context?: unknown): unknown {
    throw new Error('OpenAPI 3.2 is not yet supported. Supported versions: 3.0, 3.1');
  }

  /**
   * Get supported features for this version
   * Returns empty array since version is not yet supported
   */
  getSupportedFeatures(): string[] {
    return [];
  }
}
