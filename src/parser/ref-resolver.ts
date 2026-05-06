import type { OpenAPIDocument, ReferenceObject, SchemaObject } from '../types/openapi.js';
import { parseJsonPointer } from '../utils/url.js';

const MAX_DEPTH = 10;

export class RefResolver {
  private doc: OpenAPIDocument;
  private preserveRefSiblings: boolean;

  constructor(
    doc: OpenAPIDocument,
    documentUrl?: string,
    options?: { preserveRefSiblings?: boolean }
  ) {
    this.doc = doc;
    this.preserveRefSiblings = options?.preserveRefSiblings ?? false;
    void documentUrl;
  }

  /**
   * If input has `$ref`, resolve it; otherwise return as-is.
   */
  resolve<T>(ref: ReferenceObject | T): T {
    const obj = ref as Record<string, unknown>;
    if (obj !== null && typeof obj === 'object' && '$ref' in obj) {
      const resolved = this.resolveRef(obj.$ref as string) as Record<string, unknown>;
      if (this.preserveRefSiblings) {
        const siblings: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj)) {
          if (key !== '$ref') {
            siblings[key] = value;
          }
        }
        if (Object.keys(siblings).length > 0) {
          return { ...resolved, ...siblings } as T;
        }
      }
      return resolved as T;
    }
    return ref as T;
  }

  /**
   * Resolve a JSON Pointer $ref string to the referenced object.
   * Follows chained refs up to MAX_DEPTH hops.
   * Throws on cycles, external refs, missing targets, and depth overflow.
   */
  resolveRef(refString: string): unknown {
    const resolving = new Set<string>();
    return this.resolveRefInternal(refString, resolving, 0);
  }

  /**
   * Specifically resolve schema references, following chained refs.
   * Returns a SchemaObject (never a reference).
   */
  resolveSchema(schema: SchemaObject | ReferenceObject): SchemaObject {
    const obj = schema as Record<string, unknown>;
    if (obj !== null && typeof obj === 'object' && '$ref' in obj) {
      let resolved = this.resolveRef(obj.$ref as string) as SchemaObject;

      if (this.preserveRefSiblings) {
        const siblings: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj)) {
          if (key !== '$ref') {
            siblings[key] = value;
          }
        }
        if (Object.keys(siblings).length > 0) {
          resolved = {
            ...(resolved as Record<string, unknown>),
            ...siblings,
          } as SchemaObject;
        }
      }

      if (resolved !== null && typeof resolved === 'object' && '$ref' in resolved) {
        return this.resolveSchema(resolved);
      }
      return resolved;
    }
    return schema as SchemaObject;
  }

  private resolveRefInternal(refString: string, resolving: Set<string>, depth: number): unknown {
    if (refString.startsWith('http://') || refString.startsWith('https://')) {
      throw new Error(`External $ref resolution is not supported: ${refString}`);
    }

    if (!refString.startsWith('#')) {
      throw new Error(`External $ref resolution is not supported: ${refString}`);
    }

    if (depth >= MAX_DEPTH) {
      throw new Error(`Maximum $ref depth (${MAX_DEPTH}) exceeded: ${refString}`);
    }

    if (resolving.has(refString)) {
      const cyclePath = [...resolving, refString].join(' -> ');
      throw new Error(`Circular $ref detected: ${cyclePath}`);
    }

    resolving.add(refString);

    const pointer = refString.slice(1);
    const segments = parseJsonPointer(pointer);

    let current: unknown = this.doc;
    for (let i = 0; i < segments.length; i++) {
      if (current === null || current === undefined) {
        throw new Error(
          `$ref "${refString}" could not be resolved: segment "${segments[i]}" not found`
        );
      }
      if (typeof current !== 'object') {
        throw new Error(
          `$ref "${refString}" could not be resolved: segment "${segments[i]}" is not an object`
        );
      }
      if (Array.isArray(current)) {
        const index = Number(segments[i]);
        if (Number.isNaN(index)) {
          throw new Error(
            `$ref "${refString}" could not be resolved: "${segments[i]}" is not a valid array index`
          );
        }
        current = (current as unknown[])[index];
      } else {
        current = (current as Record<string, unknown>)[segments[i]];
      }
    }

    if (current === undefined) {
      throw new Error(`$ref "${refString}" could not be resolved`);
    }

    if (
      current !== null &&
      typeof current === 'object' &&
      !Array.isArray(current) &&
      '$ref' in (current as Record<string, unknown>)
    ) {
      const chainedRef = (current as Record<string, unknown>).$ref as string;
      return this.resolveRefInternal(chainedRef, new Set(resolving), depth + 1);
    }

    return current;
  }
}
