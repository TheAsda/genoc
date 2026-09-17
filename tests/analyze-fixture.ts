import { parse as parseYaml } from 'yaml';

import { analyze } from '../src/analyzer/analyze.js';
import type { AnalyzedSpec } from '../src/analyzer/types.js';
import { RefResolver } from '../src/parser/ref-resolver.js';
import type { MethodNameStrategy } from '../src/types/client.js';
import type { OpenAPIDocument } from '../src/types/openapi.js';

export interface AnalyzeFixtureOptions {
  strategy?: MethodNameStrategy;
  preserveRefSiblings?: boolean;
}

/**
 * Analyze an inline OpenAPI document into an AnalyzedSpec, mirroring the
 * production pipeline: a RefResolver over the doc (preserveRefSiblings
 * opt-in, matching the plain `new RefResolver(doc)` the tests used before
 * the T4 rebase) and the single `analyze()` pass.
 */
export function analyzeFixture(
  doc: OpenAPIDocument,
  options?: AnalyzeFixtureOptions
): AnalyzedSpec {
  return analyze(doc, {
    resolver: new RefResolver(doc, { preserveRefSiblings: options?.preserveRefSiblings }),
    strategy: options?.strategy,
  });
}

/**
 * Analyze a YAML spec string into an AnalyzedSpec (parse + `analyzeFixture`).
 */
export function analyzeYaml(yaml: string, options?: AnalyzeFixtureOptions): AnalyzedSpec {
  return analyzeFixture(parseYaml(yaml) as OpenAPIDocument, options);
}
