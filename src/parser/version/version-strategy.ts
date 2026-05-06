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
   * Check if this strategy matches the given OpenAPI specification
   */
  matches(spec: unknown): boolean;

  /**
   * Normalize a raw OpenAPI specification to a consistent format
   */
  normalizeSpec(rawSpec: unknown): NormalizedSpec;

  /**
   * Validate the normalized specification
   */
  validateSpec(spec: NormalizedSpec): ValidationResult;

  /**
   * Resolve a reference within the document context
   */
  resolveRef(ref: string, doc: unknown, context?: unknown): unknown;

  /**
   * Get supported features for this version
   */
  getSupportedFeatures(): string[];
}
