import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { describe, it, expect, beforeAll } from 'vitest';

import { generateClient } from '../../src/generator/client-generator.js';
import { generateContracts } from '../../src/generator/contracts-generator.js';
import { RefResolver } from '../../src/parser/ref-resolver.js';
import { loadFromFile } from '../../src/parser/spec-reader.js';
import type { GeneratorConfig } from '../../src/types/client.js';
import { linkGenoc } from '../helpers/link-genoc.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, '../fixtures/dotted-schema-names.json');

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

describe('Dotted schema names integration', () => {
  let contracts: string;
  let client: string;

  beforeAll(async () => {
    const doc = await loadFromFile(FIXTURE_PATH);
    const config: GeneratorConfig = {
      input: FIXTURE_PATH,
      outputDir: '/tmp/dotted-test',
    };
    const result = generateClient(doc, config);
    contracts = result.contracts;
    client = result.client;
  });

  it('sanitizes dotted schema names to PascalCase', () => {});

  it('renames Api.Error to ApiErrorModel due to collision with built-in ApiError', () => {
    expect(contracts).not.toContain('export type Api.Error');
  });

  it('produces no dots in any type names', () => {
    const typeExportPattern = /export type \S+/g;
    const matches = contracts.match(typeExportPattern) ?? [];
    for (const match of matches) {
      expect(match).not.toContain('.');
    }
  });

  it('uses sanitized type names in response refs', () => {});

  it('contracts compile with tsc --strict --noEmit', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'dotted-contracts-'));
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

  it('client compiles with tsc --strict --noEmit', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dotted-client-'));
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

  it('matches contracts snapshot', () => {
    expect(contracts).toMatchSnapshot('dotted-schema-contracts');
  });

  it('matches client snapshot', () => {
    expect(client).toMatchSnapshot('dotted-schema-client');
  });
});
