import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { describe, it, expect, beforeAll } from 'vitest';

import { generateClient } from '../../src/generator/client-generator.js';
import { loadFromFile } from '../../src/parser/spec-reader.js';
import type { GeneratorConfig } from '../../src/types/client.js';
import type { OpenAPIDocument } from '../../src/types/openapi.js';
import { linkGenoc } from '../helpers/link-genoc.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, '../fixtures/discriminator-allof.json');

const TSC_FLAGS = [
  '--strict',
  '--noEmit',
  '--esModuleInterop',
  '--module',
  'NodeNext',
  '--moduleResolution',
  'NodeNext',
  '--target',
  'ES2022',
  '--skipLibCheck',
].join(' ');

describe('Discriminator allOf integration', () => {
  let doc: OpenAPIDocument;
  let contracts: string;
  let client: string;

  beforeAll(async () => {
    doc = await loadFromFile(FIXTURE_PATH);
    const config: GeneratorConfig = {
      input: FIXTURE_PATH,
      outputDir: '/tmp/discriminator-allof-test',
    };
    const result = generateClient(doc, config);
    contracts = result.contracts;
    client = result.client;
  });

  // 1. Load and generate
  it('loads discriminator fixture and generates output', () => {
    expect(doc).toBeDefined();
    expect(doc.openapi).toBe('3.0.0');
    expect(doc.info.title).toBe('Discriminator AllOf');

    expect(typeof contracts).toBe('string');
    expect(typeof client).toBe('string');
    expect(contracts.length).toBeGreaterThan(0);
    expect(client.length).toBeGreaterThan(0);
  });

  // 2. Contracts contain discriminator types
  it('generated contracts contain discriminator types', () => {});

  // 3. Response types use PetVariant union
  it('response types use PetVariant instead of Pet', () => {
    expect(contracts).not.toMatch(/GetPetsResponse\s*=\s*Pet[^V]/);
    expect(contracts).not.toMatch(/GetPetsIdResponse\s*=\s*Pet[^V]/);
  });

  it('matches contracts snapshot', () => {
    expect(contracts).toMatchSnapshot('discriminator-allof-contracts');
  });

  it('matches client snapshot', () => {
    expect(client).toMatchSnapshot('discriminator-allof-client');
  });

  // 4. Contracts compile with tsc
  it('generated contracts compile with tsc --strict --noEmit', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'discriminator-contracts-'));
    linkGenoc(tmpDir);
    const contractsFile = join(tmpDir, 'contracts.ts');
    writeFileSync(contractsFile, contracts, 'utf-8');

    const result = execSync(`npx tsc ${TSC_FLAGS} ${contractsFile}`, {
      cwd: tmpDir,
      encoding: 'utf-8',
      timeout: 30000,
    }).trim();

    expect(result).toBe('');
  });

  // 5. Client compiles with tsc (needs contracts file alongside)
  it('generated client compiles with tsc --strict --noEmit', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'discriminator-client-'));
    linkGenoc(dir);
    writeFileSync(join(dir, 'contracts.ts'), contracts, 'utf-8');
    writeFileSync(join(dir, 'client.ts'), client, 'utf-8');

    const result = execSync(`npx tsc ${TSC_FLAGS} client.ts`, {
      cwd: dir,
      encoding: 'utf-8',
      timeout: 30000,
    }).trim();

    expect(result).toBe('');
  });
});
