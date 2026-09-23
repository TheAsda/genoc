import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

import { analyze } from './analyzer/analyze.js';
import { generateOutput } from './generator/client-generator.js';
import { RefResolver } from './parser/ref-resolver.js';
import type { GeneratorConfig } from './types/client.js';
import type { OpenAPIDocument } from './types/openapi.js';

/** Options for controlling generation behavior. */
export interface GenerationOptions {
  /** When true, sibling properties alongside $ref are preserved (OpenAPI 3.1 behavior). */
  preserveRefSiblings?: boolean;
  /** Effective OpenAPI dialect, sourced from `VersionProfile.effective`. */
  effectiveVersion?: '3.0' | '3.1';
}

/**
 * Generate and write all output files to disk: builds the resolver, runs the
 * single `analyze()` pass, feeds both renderers via `generateOutput`, and
 * writes contracts.ts / client.ts / index.ts into the configured directory.
 */
export async function generateFullOutput(
  doc: OpenAPIDocument,
  config: GeneratorConfig,
  options?: GenerationOptions
): Promise<void> {
  const resolver = new RefResolver(doc, {
    preserveRefSiblings: options?.preserveRefSiblings,
  });

  const analyzed = analyze(doc, {
    resolver,
    strategy: config.methodNameStrategy ?? 'path-based',
    effectiveVersion: options?.effectiveVersion,
  });

  const { contracts, client, index } = generateOutput(analyzed, config);

  await mkdir(config.outputDir, { recursive: true });

  await writeFile(join(config.outputDir, 'contracts.ts'), contracts, 'utf-8');
  await writeFile(join(config.outputDir, 'client.ts'), client, 'utf-8');
  await writeFile(join(config.outputDir, 'index.ts'), index, 'utf-8');
}
