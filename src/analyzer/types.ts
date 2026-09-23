import type { RefResolver } from '../parser/ref-resolver.js';
import type { MethodNameStrategy } from '../types/client.js';
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

/**
 * Finished security scheme type declaration (contracts Section 1b): the
 * collision-deduped `{Name}Auth` type name, the rendered object type text,
 * and the description-only JSDoc block ('' when absent).
 */
export interface SecuritySchemeTypeDeclaration {
  /** Emitted `{Name}Auth` type name (sanitized, numbered on collision). */
  name: string;
  /** Rendered object type text — the `securitySchemeToTsType` output. */
  tsType: string;
  /** Description JSDoc block; '' when the scheme carries no description. */
  jsDoc: string;
}

/**
 * Finished server variable type declaration (contracts Section 1c). Names
 * are index-aware over ALL `doc.servers` — `ServerParams` when the document
 * declares a single server, `Server{i}Params` otherwise — so servers without
 * variables still occupy an index.
 */
export interface ServerTypeDeclaration {
  name: string;
  /** Server URL, emitted as the `/** Server: url *\/` comment when present. */
  url?: string;
  /** Finished interface body lines — variable JSDoc comments and property lines, indentation included. */
  propertyLines: string[];
}

/** Branded format type discovered by the schema mapper during translation. */
export interface BrandedTypeDeclaration {
  name: string;
  format: string;
  baseType: string;
}

/**
 * One multipart `FileInput` property fact from the ref-resolving walk of a
 * multipart request body ($refs followed; a resolved `format: binary`
 * property is a `file`/`file-array`, not a `field`).
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
   * Multipart `FileInput` property facts from the ref-resolving walk of the
   * request body schema (`$ref`s followed; a resolved `format: binary`
   * property is a `file`/`file-array`, not a `field`). Present exactly when
   * the operation has a multipart body WITH a schema — an empty array means a
   * zero-property body; `undefined` means no multipart schema (no FormData
   * emission). Sole fact source for the client generator's FormData appends.
   */
  fileUploadProperties?: FileUploadPropertyFact[];
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
   * one always-emitted `{Base}Variant` union per discriminator family
   * (members = mapping values ∪ implicit oneOf/anyOf refs, sourced from the
   * discriminator registry; collision-safe names) in family discovery order.
   */
  schemaTypes: TypeDeclaration[];
  /** Branded format types discovered during mapping, in discovery order. */
  brandedTypes: BrandedTypeDeclaration[];
  /** Any operation has a multipart request body → contracts emits `FileInput`. */
  hasFileUpload: boolean;
  /**
   * Finished security scheme type declarations (`{Name}Auth`), in spec key
   * order. The `SecuritySchemes` union is emitted when more than one exists.
   */
  securitySchemeTypes: SecuritySchemeTypeDeclaration[];
  /** Finished server variable interface declarations, in spec order. */
  serverTypes: ServerTypeDeclaration[];
}

/** Options for `analyze()`. */
export interface AnalyzeOptions {
  /** Resolver for `$ref` pointers; defaults to a fresh `RefResolver(doc)`. */
  resolver?: RefResolver;
  /** Method naming strategy; defaults to `'path-based'`. */
  strategy?: MethodNameStrategy;
  /**
   * Effective OpenAPI dialect, sourced from `VersionProfile.effective`.
   * Omitted is treated as `'3.1'`.
   */
  effectiveVersion?: '3.0' | '3.1';
}
