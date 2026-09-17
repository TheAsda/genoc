import type { ValidationResult } from '../validators.js';
import type { NormalizedSpec } from './normalized-spec.js';

/**
 * Version strategy interface for multi-version OpenAPI support
 */
export interface VersionStrategy {
  /**
   * Get the supported OpenAPI version
   */
  version(): string;

  /**
   * Normalize a raw OpenAPI specification to a consistent format
   */
  normalizeSpec(rawSpec: unknown): NormalizedSpec;

  /**
   * Validate the normalized specification
   */
  validateSpec(spec: NormalizedSpec): ValidationResult;
}
