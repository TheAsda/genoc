import { parseJsonPointer } from '../../../utils/url.js';
import type { ValidationResult } from '../../validators.js';
import type { NormalizedSpec } from '../normalized-spec.js';
import type { VersionStrategy } from '../version-strategy.js';
import { normalizeSpec30 } from './normalizer.js';
import { validateSpec30 } from './validator.js';

const MAX_REF_DEPTH = 10;

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

  matches(spec: unknown): boolean {
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
      return false;
    }
    const specObj = spec as Record<string, unknown>;
    const openapiVersion = specObj.openapi;
    if (typeof openapiVersion === 'string') {
      return openapiVersion.startsWith('3.0');
    }
    return false;
  }

  normalizeSpec(rawSpec: unknown): NormalizedSpec {
    return normalizeSpec30(rawSpec);
  }

  validateSpec(spec: NormalizedSpec): ValidationResult {
    return validateSpec30(spec);
  }

  /**
   * Resolve a $ref within the document. For OpenAPI 3.0, sibling properties
   * alongside `$ref` are ignored — only the $ref target is returned.
   */
  resolveRef(ref: string, doc: unknown, _context?: unknown): unknown {
    const resolving = new Set<string>();
    return this.resolveRefInternal(ref, doc, resolving, 0);
  }

  getSupportedFeatures(): string[] {
    return ['nullable', 'example'];
  }

  private resolveRefInternal(
    ref: string,
    doc: unknown,
    resolving: Set<string>,
    depth: number
  ): unknown {
    if (ref.startsWith('http://') || ref.startsWith('https://')) {
      throw new Error(`External $ref resolution is not supported: ${ref}`);
    }

    if (!ref.startsWith('#')) {
      throw new Error(`External $ref resolution is not supported: ${ref}`);
    }

    if (depth >= MAX_REF_DEPTH) {
      throw new Error(`Maximum $ref depth (${MAX_REF_DEPTH}) exceeded: ${ref}`);
    }

    if (resolving.has(ref)) {
      const cyclePath = [...resolving, ref].join(' -> ');
      throw new Error(`Circular $ref detected: ${cyclePath}`);
    }

    resolving.add(ref);

    const pointer = ref.slice(1);
    const segments = parseJsonPointer(pointer);

    let current: unknown = doc;
    for (const segment of segments) {
      if (current === null || current === undefined) {
        throw new Error(`$ref "${ref}" could not be resolved: segment "${segment}" not found`);
      }
      if (typeof current !== 'object') {
        throw new Error(
          `$ref "${ref}" could not be resolved: segment "${segment}" is not an object`
        );
      }
      if (Array.isArray(current)) {
        const index = Number(segment);
        if (Number.isNaN(index)) {
          throw new Error(
            `$ref "${ref}" could not be resolved: "${segment}" is not a valid array index`
          );
        }
        current = (current as unknown[])[index];
      } else {
        current = (current as Record<string, unknown>)[segment];
      }
    }

    if (current === undefined) {
      throw new Error(`$ref "${ref}" could not be resolved`);
    }

    if (
      current !== null &&
      typeof current === 'object' &&
      !Array.isArray(current) &&
      '$ref' in (current as Record<string, unknown>)
    ) {
      const chainedRef = (current as Record<string, unknown>).$ref as string;
      return this.resolveRefInternal(chainedRef, doc, new Set(resolving), depth + 1);
    }

    return current;
  }
}
