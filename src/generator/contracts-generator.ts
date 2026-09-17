import { analyze, buildDescriptionJsDoc } from '../analyzer/analyze.js';
import type { AnalyzedSpec } from '../analyzer/types.js';
import { RefResolver } from '../parser/ref-resolver.js';
import type {
  OpenAPIDocument,
  SecuritySchemeObject,
  ServerVariableObject,
} from '../types/openapi.js';
import {
  DEFAULT_RUNTIME_IMPORT_PATH,
  makeHeader,
  sanitizeJsDocText,
  sanitizeTypeName,
  toPascalCase,
} from '../utils/generator-helpers.js';
import { RUNTIME_CLASS_NAMES } from '../utils/operation-naming.js';

function securitySchemeToTsType(scheme: SecuritySchemeObject): string {
  const parts: string[] = [`type: "${scheme.type}"`];

  if (scheme.description) {
    parts.push(`description: "${scheme.description}"`);
  }

  if (scheme.type === 'apiKey') {
    if (scheme.name) parts.push(`name: "${scheme.name}"`);
    if (scheme.in) parts.push(`in: "${scheme.in}"`);
  }

  if (scheme.type === 'http') {
    if (scheme.scheme) parts.push(`scheme: "${scheme.scheme}"`);
    if (scheme.bearerFormat) parts.push(`bearerFormat: "${scheme.bearerFormat}"`);
  }

  if (scheme.type === 'oauth2' && scheme.flows) {
    const flowParts: string[] = [];
    const flows = scheme.flows;
    if (flows.implicit) {
      flowParts.push(`implicit: ${oAuth2FlowToTs(flows.implicit, true)}`);
    }
    if (flows.password) {
      flowParts.push(`password: ${oAuth2FlowToTs(flows.password, false)}`);
    }
    if (flows.clientCredentials) {
      flowParts.push(`clientCredentials: ${oAuth2FlowToTs(flows.clientCredentials, false)}`);
    }
    if (flows.authorizationCode) {
      flowParts.push(`authorizationCode: ${oAuth2FlowToTs(flows.authorizationCode, true)}`);
    }
    parts.push(`flows: { ${flowParts.join('; ')} }`);
  }

  if (scheme.type === 'openIdConnect' && scheme.openIdConnectUrl) {
    parts.push(`openIdConnectUrl: "${scheme.openIdConnectUrl}"`);
  }

  return `{ ${parts.join('; ')} }`;
}

function oAuth2FlowToTs(
  flow: {
    authorizationUrl?: string;
    tokenUrl?: string;
    refreshUrl?: string;
    scopes: Record<string, string>;
  },
  hasAuthUrl: boolean
): string {
  const entries: string[] = [];
  if (hasAuthUrl && flow.authorizationUrl) {
    entries.push(`authorizationUrl: "${flow.authorizationUrl}"`);
  }
  if (flow.tokenUrl) {
    entries.push(`tokenUrl: "${flow.tokenUrl}"`);
  }
  if (flow.refreshUrl) {
    entries.push(`refreshUrl: "${flow.refreshUrl}"`);
  }
  const scopeEntries = Object.entries(flow.scopes)
    .map(([k, v]) => `"${k}": "${v}"`)
    .join('; ');
  entries.push(`scopes: { ${scopeEntries} }`);
  return `{ ${entries.join('; ')} }`;
}

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
 * 3. Security scheme types (transitional raw passthrough — T3 translates)
 * 4. Server variable types (transitional raw passthrough — T3 translates)
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

  // Section 1b: Security scheme types
  const securitySchemes = analyzed.securitySchemes;
  if (securitySchemes && Object.keys(securitySchemes).length > 0) {
    const securityTypeNames: string[] = [];
    const usedSecurityTypeNames = new Set<string>();

    for (const [schemeName, scheme] of Object.entries(securitySchemes)) {
      const baseTypeName = `${sanitizeTypeName(toPascalCase(schemeName))}Auth`;
      let typeName = baseTypeName;
      let n = 2;
      while (usedSecurityTypeNames.has(typeName)) {
        typeName = `${baseTypeName}${n}`;
        n += 1;
      }
      usedSecurityTypeNames.add(typeName);
      const tsType = securitySchemeToTsType(scheme);
      const schemeJsDoc = buildDescriptionJsDoc(scheme.description);
      if (schemeJsDoc !== '') {
        lines.push('');
        lines.push(schemeJsDoc);
      }
      lines.push('');
      lines.push(`export type ${typeName} = ${tsType};`);
      securityTypeNames.push(typeName);
    }

    if (securityTypeNames.length > 1) {
      lines.push('');
      lines.push(`export type SecuritySchemes = ${securityTypeNames.join(' | ')};`);
    }
  }

  // Section 1c: Server variable types
  const servers = analyzed.servers;
  if (servers) {
    for (let serverIdx = 0; serverIdx < servers.length; serverIdx++) {
      const server = servers[serverIdx];
      if (!server.variables || Object.keys(server.variables).length === 0) {
        continue;
      }

      const typeName = servers.length === 1 ? 'ServerParams' : `Server${serverIdx + 1}Params`;

      const props: string[] = [];
      for (const [varName, variable] of Object.entries(server.variables)) {
        const sv = variable as ServerVariableObject;
        const jsDocParts: string[] = [];
        if (sv.description) {
          const description = sanitizeJsDocText(sv.description);
          if (description !== '') {
            jsDocParts.push(description);
          }
        }
        if (sv.default !== undefined) {
          jsDocParts.push(`@default ${sanitizeJsDocText(String(sv.default))}`);
        }

        let tsType: string;
        if (sv.enum && sv.enum.length > 0) {
          tsType = sv.enum.map((v: string) => `"${v}"`).join(' | ');
        } else {
          tsType = 'string';
        }

        const jsDoc = jsDocParts.length > 0 ? `  /** ${jsDocParts.join(' ')} */` : null;
        if (jsDoc) {
          props.push(jsDoc);
        }
        props.push(`  ${varName}: ${tsType};`);
      }

      lines.push('');
      if (server.url) {
        lines.push(`/** Server: ${server.url} */`);
      }
      lines.push(`export interface ${typeName} {`);
      for (const prop of props) {
        lines.push(prop);
      }
      lines.push('}');
    }
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
