import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { describe, expect, it, test } from 'vitest';

import { generateClient } from '../../src/generator/client-generator.js';
import { loadFromFile } from '../../src/parser/spec-reader.js';
import type { GeneratorConfig } from '../../src/types/client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINES_DIR = join(__dirname, 'baselines');

/**
 * AC-1 harness specs. Baselines under `baselines/` were captured from the
 * generator BEFORE any jsdoc-metadata change — do not regenerate them to make
 * a failing task pass; that defeats the regression gate.
 */
const SPECS = [
  { name: 'petstore-v3.0', fixture: join(__dirname, '../fixtures/v3.0/petstore.yaml') },
  { name: 'petstore-v3.1', fixture: join(__dirname, '../fixtures/petstore.yaml') },
  {
    name: 'jsdoc-metadata-v3.0',
    fixture: join(__dirname, '../fixtures/jsdoc-metadata-v3.0.yaml'),
  },
  {
    name: 'jsdoc-metadata-v3.1',
    fixture: join(__dirname, '../fixtures/jsdoc-metadata-v3.1.yaml'),
  },
] as const;

/**
 * Strip all comments from generated code and collapse whitespace, leaving only
 * the significant token stream:
 *
 * 1. Block comments (`/* ... *\/`) are removed first. URLs like `https://`
 *    inside string literals are safe here — they never contain `/*`.
 * 2. Lines whose trimmed form starts with `//` are dropped entirely. This
 *    protects URLs inside string literals: they never START a line, so a
 *    `"https://..."` string survives while `// Auto-generated ...` headers
 *    and `// Pure runtime` annotations are removed.
 * 3. All whitespace runs collapse to a single space, then the result is
 *    trimmed — so formatting-only changes never trip the baseline.
 */
export function stripAndNormalize(code: string): string {
  const withoutBlockComments = code.replace(/\/\*[\s\S]*?\*\//g, '');
  const withoutLineComments = withoutBlockComments
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
  return withoutLineComments.replace(/\s+/g, ' ').trim();
}

async function generateStripped(
  fixturePath: string
): Promise<{ contracts: string; client: string }> {
  const doc = await loadFromFile(fixturePath);
  const config: GeneratorConfig = {
    input: fixturePath,
    outputDir: '/tmp/jsdoc-equivalence',
  };
  const { contracts, client } = generateClient(doc, config);
  return { contracts: stripAndNormalize(contracts), client: stripAndNormalize(client) };
}

function readBaseline(fileName: string): string {
  return readFileSync(join(BASELINES_DIR, fileName), 'utf-8').trim();
}

describe('AC-1 stripped-token equivalence (jsdoc metadata baselines)', () => {
  for (const spec of SPECS) {
    it(`${spec.name}: stripped contracts.ts matches baseline`, async () => {
      const { contracts } = await generateStripped(spec.fixture);
      expect(contracts).toBe(readBaseline(`${spec.name}.contracts.txt`));
    });

    it(`${spec.name}: stripped client.ts matches baseline`, async () => {
      const { client } = await generateStripped(spec.fixture);
      expect(client).toBe(readBaseline(`${spec.name}.client.txt`));
    });
  }

  it('generation is deterministic — two runs produce identical bytes', async () => {
    for (const spec of SPECS) {
      const doc = await loadFromFile(spec.fixture);
      const config: GeneratorConfig = {
        input: spec.fixture,
        outputDir: '/tmp/jsdoc-equivalence',
      };
      const first = generateClient(doc, config);
      const second = generateClient(doc, config);
      expect(first.contracts).toBe(second.contracts);
      expect(first.client).toBe(second.client);
    }
  });
});

test('torture fixture full output shape', async () => {
  const v30 = await generateStripped(join(__dirname, '../fixtures/jsdoc-metadata-v3.0.yaml'));
  expect(v30.contracts).toMatchSnapshot('jsdoc-metadata-v3.0-contracts-stripped');
  expect(v30.client).toMatchSnapshot('jsdoc-metadata-v3.0-client-stripped');

  const v31 = await generateStripped(join(__dirname, '../fixtures/jsdoc-metadata-v3.1.yaml'));
  expect(v31.contracts).toMatchSnapshot('jsdoc-metadata-v3.1-contracts-stripped');
  expect(v31.client).toMatchSnapshot('jsdoc-metadata-v3.1-client-stripped');
});
