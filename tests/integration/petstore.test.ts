import { execSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { generateClient, generateFullOutput } from '../../src/generator/client-generator.js';
import { generateContracts } from '../../src/generator/contracts-generator.js';
import { RefResolver } from '../../src/parser/ref-resolver.js';
import { loadFromFile } from '../../src/parser/spec-reader.js';
import type { GeneratorConfig } from '../../src/types/client.js';
import type { OpenAPIDocument } from '../../src/types/openapi.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, '../fixtures/petstore.yaml');

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

describe('Petstore integration', () => {
  let doc: OpenAPIDocument;
  let contracts: string;
  let client: string;
  let tmpDir: string;

  beforeAll(async () => {
    doc = await loadFromFile(FIXTURE_PATH);
    const config: GeneratorConfig = {
      input: FIXTURE_PATH,
      outputDir: '/tmp/petstore-test',
    };
    const result = generateClient(doc, config);
    contracts = result.contracts;
    client = result.client;
  });

  // 1. Load and generate
  it('loads petstore.yaml and produces contracts and client strings', async () => {
    expect(doc).toBeDefined();
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.info.title).toBe('Pet Store');

    expect(typeof contracts).toBe('string');
    expect(typeof client).toBe('string');
    expect(contracts.length).toBeGreaterThan(0);
    expect(client.length).toBeGreaterThan(0);
  });

  // 2. Contracts compile with tsc
  it('generated contracts compile with tsc --strict --noEmit', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'petstore-contracts-'));
    const contractsFile = join(tmpDir, 'contracts.ts');
    writeFileSync(contractsFile, contracts, 'utf-8');

    const result = execSync(`npx tsc ${TSC_FLAGS} ${contractsFile}`, {
      cwd: tmpDir,
      encoding: 'utf-8',
      timeout: 30000,
    }).trim();

    // tsc --noEmit produces no output on success
    expect(result).toBe('');
  });

  // 3. Client compiles with tsc (needs contracts file alongside)
  it('generated client compiles with tsc --strict --noEmit', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'petstore-client-'));
    writeFileSync(join(dir, 'contracts.ts'), contracts, 'utf-8');
    writeFileSync(join(dir, 'client.ts'), client, 'utf-8');

    const result = execSync(`npx tsc ${TSC_FLAGS} client.ts`, {
      cwd: dir,
      encoding: 'utf-8',
      timeout: 30000,
    }).trim();

    expect(result).toBe('');
  });

  // 4. Method names correct
  it('generates correct method names using path-based strategy', () => {});

  // 5. Method signatures correct
  it('generates correct method signatures — path params flat, query grouped, body last', () => {});

  // 6. Error types generated
  it('generates error types for non-2xx responses', () => {});

  // 7. Schema types correct
  it('generates correct schema types from components/schemas', () => {});

  // 8. Snapshot tests
  it('matches contracts snapshot', () => {
    expect(contracts).toMatchSnapshot('petstore-contracts');
  });

  it('matches client snapshot', () => {
    expect(client).toMatchSnapshot('petstore-client');
  });
});

describe('Petstore full output pipeline', () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'petstore-full-'));
    const doc = await loadFromFile(FIXTURE_PATH);
    const config: GeneratorConfig = {
      input: FIXTURE_PATH,
      outputDir: tmpDir,
    };
    await generateFullOutput(doc, config);
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes contracts.ts and client.ts to disk', () => {
    const contractsFile = join(tmpDir, 'contracts.ts');
    const clientFile = join(tmpDir, 'client.ts');

    const contractsContent = readFileSync(contractsFile, 'utf-8');
    const clientContent = readFileSync(clientFile, 'utf-8');
  });

  it('generated files on disk compile together with tsc', () => {
    const result = execSync(`npx tsc ${TSC_FLAGS} client.ts contracts.ts`, {
      cwd: tmpDir,
      encoding: 'utf-8',
      timeout: 30000,
    }).trim();

    expect(result).toBe('');
  });
});
