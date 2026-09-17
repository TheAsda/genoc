import { analyze } from '../analyzer/analyze.js';
import type { AnalyzedSpec } from '../analyzer/types.js';
import { RefResolver } from '../parser/ref-resolver.js';
import type { OpenAPIDocument } from '../types/openapi.js';
import { DEFAULT_RUNTIME_IMPORT_PATH, makeHeader } from '../utils/generator-helpers.js';
import { RUNTIME_CLASS_NAMES } from '../utils/operation-naming.js';

/**
 * Build the import + re-export block for the shared runtime classes.
 * Generated code re-uses the genoc runtime as the single source of truth
 * for class identity, so `instanceof` checks work across module boundaries.
 */
function buildRuntimeReexport(runtimeImportPath: string): string[] {
  return [
    '',
    `import { ApiError, StreamResponse } from '${runtimeImportPath}';`,
    'export {',
    ...RUNTIME_CLASS_NAMES.map((name) => `  ${name},`),
    `} from '${runtimeImportPath}';`,
  ];
}

/**
 * Render the complete `*.contracts.ts` file content from the analyzed model.
 * Pure string assembly — reads ONLY the AnalyzedSpec, never the raw spec or
 * a resolver.
 *
 * Sections produced:
 * 1. Header comment
 * 2. Schema types from `components/schemas` (finished model entries)
 * 3. Security scheme types (finished model entries; `SecuritySchemes` union
 *    when more than one)
 * 4. Server variable types (finished model entries)
 * 5. `FileInput` when any operation uploads files
 * 6. Operation-derived types (finished emission lines from the model)
 * 7. Runtime re-export block (shared classes from the genoc runtime package)
 */
export function renderContracts(
  analyzed: AnalyzedSpec,
  runtimeImportPath: string = DEFAULT_RUNTIME_IMPORT_PATH
): string {
  const lines: string[] = [];

  lines.push(makeHeader(analyzed.specVersion));

  const runtimeReexport = buildRuntimeReexport(runtimeImportPath);
  lines.push(...runtimeReexport);

  // Section 1: Schema types (finished entries; emission order — topologically
  // sorted schemas, then discriminator variant unions — was fixed by analyze()).
  for (const entry of analyzed.schemaTypes) {
    lines.push('');
    if (entry.jsDoc) {
      lines.push(entry.jsDoc);
    }
    lines.push(entry.definition);
  }

  // Section 1b: Security scheme types (finished entries in spec key order)
  if (analyzed.securitySchemeTypes.length > 0) {
    for (const entry of analyzed.securitySchemeTypes) {
      if (entry.jsDoc !== '') {
        lines.push('');
        lines.push(entry.jsDoc);
      }
      lines.push('');
      lines.push(`export type ${entry.name} = ${entry.tsType};`);
    }

    if (analyzed.securitySchemeTypes.length > 1) {
      const unionMembers = analyzed.securitySchemeTypes.map((entry) => entry.name).join(' | ');
      lines.push('');
      lines.push(`export type SecuritySchemes = ${unionMembers};`);
    }
  }

  // Section 1c: Server variable types (finished entries in spec order)
  for (const entry of analyzed.serverTypes) {
    lines.push('');
    if (entry.url) {
      lines.push(`/** Server: ${entry.url} */`);
    }
    lines.push(`export interface ${entry.name} {`);
    for (const prop of entry.propertyLines) {
      lines.push(prop);
    }
    lines.push('}');
  }

  if (analyzed.hasFileUpload) {
    lines.push('');
    lines.push('export interface FileInput {');
    lines.push('  data: Blob;');
    lines.push('  filename: string;');
    lines.push('}');
  }

  // Sections 2-4: Operation-derived types (finished emission lines assembled
  // by analyze(); spilled unchanged with a blank line before each).
  for (const op of analyzed.operations) {
    for (const line of op.contractsLines) {
      lines.push('');
      lines.push(line);
    }
  }

  // Emit branded type definitions after header, before everything else
  if (analyzed.brandedTypes.length > 0) {
    const brandLines: string[] = [];
    for (const brand of analyzed.brandedTypes) {
      brandLines.push(
        `export type ${brand.name} = ${brand.baseType} & { readonly __format?: '${brand.format}' };`
      );
    }
    lines.splice(1 + runtimeReexport.length, 0, '', ...brandLines);
  }

  return lines.join('\n');
}

/**
 * Generate the complete `*.contracts.ts` file content as a string.
 * transitional T1 bridge — translation moved into `analyze()`; this wrapper
 * keeps the historical signature for existing callers and is deleted in T4.
 */
export function generateContracts(
  doc: OpenAPIDocument,
  resolver: RefResolver,
  runtimeImportPath: string = DEFAULT_RUNTIME_IMPORT_PATH
): string {
  return renderContracts(analyze(doc, { resolver }), runtimeImportPath);
}
