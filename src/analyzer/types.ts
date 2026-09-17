import type { RefResolver } from '../parser/ref-resolver.js';
import type { MethodNameStrategy } from '../types/client.js';
import type { SecuritySchemeObject, ServerObject } from '../types/openapi.js';
import type { AnalyzedOperation } from './path-analyzer.js';

/**
 * Finished (render-ready) type declaration for the contracts file: the emitted
 * type name, its complete definition statement, and an optional type-level
 * JSDoc block rendered above it.
 */
export interface TypeDeclaration {
  /** Emitted type name (rename-aware). */
  name: string;
  /** Complete definition statement, e.g. `export type User = { … };`. */
  definition: string;
  /** Type-level JSDoc block, when the source carries renderable metadata. */
  jsDoc?: string;
}

/** Branded format type discovered by the schema mapper during translation. */
export interface BrandedTypeDeclaration {
  name: string;
  format: string;
  baseType: string;
}

/**
 * One multipart `FileInput` property fact from the ref-resolving (contracts)
 * walk of a multipart request body.
 *
 * transitional — carried on the model since T1; consumed by the client
 * generator in T2, replacing its divergent non-ref-resolving walk.
 */
export interface FileUploadPropertyFact {
  /** Property name in the multipart schema. */
  name: string;
  /** Whether the property is listed in the schema's `required` array. */
  required: boolean;
  /** `file` → `FileInput`, `file-array` → `FileInput[]`, `field` → `string`. */
  kind: 'file' | 'file-array' | 'field';
}

/**
 * Analyzed operation plus its finished translation results.
 *
 * The structural fields are the plain `AnalyzedOperation`; the added fields
 * carry the real-mapper output the contracts renderer emits verbatim.
 */
export interface FinishedOperation extends AnalyzedOperation {
  /**
   * Finished contracts-file emission lines for this operation (Sections 2–4:
   * query/header/body/response/error types, with JSDoc attached), in emission
   * order. Assembled by `analyze()`; `renderContracts` spills them unchanged.
   */
  contractsLines: string[];
  /**
   * Multipart `FileInput` property facts from the ref-resolving (contracts)
   * walk. Empty when the operation has no multipart request body.
   * transitional — consumed in T2.
   */
  fileUploadProperties: FileUploadPropertyFact[];
}

/**
 * Single-pass analysis model of an OpenAPI document — the ONLY input every
 * generator renderer consumes. Renderers get the model plus config; they never
 * touch the raw spec or a `RefResolver`.
 */
export interface AnalyzedSpec {
  /** `doc.openapi` verbatim (e.g. `"3.1.0"`) — feeds generated file headers. */
  specVersion: string;
  /** Operations with structural facts and finished contracts emission lines. */
  operations: FinishedOperation[];
  /**
   * Section-1 component schema declarations as finished entries, in the
   * pre-refactor emission order: topologically sorted schemas first, then
   * discriminator `{Base}Variant` unions in discovery order.
   */
  schemaTypes: TypeDeclaration[];
  /** Branded format types discovered during mapping, in discovery order. */
  brandedTypes: BrandedTypeDeclaration[];
  /** Any operation has a multipart request body → contracts emits `FileInput`. */
  hasFileUpload: boolean;
  /**
   * Raw `doc.components.securitySchemes` passthrough.
   * transitional — translated to finished types in T3; the contracts renderer
   * still renders from this raw field.
   */
  securitySchemes: Record<string, SecuritySchemeObject> | undefined;
  /**
   * Raw `doc.servers` passthrough.
   * transitional — translated to finished types in T3; the contracts renderer
   * still renders from this raw field.
   */
  servers: ServerObject[] | undefined;
}

/** Options for `analyze()`. */
export interface AnalyzeOptions {
  /** Resolver for `$ref` pointers; defaults to a fresh `RefResolver(doc)`. */
  resolver?: RefResolver;
  /** Method naming strategy; defaults to `'path-based'`. */
  strategy?: MethodNameStrategy;
}
