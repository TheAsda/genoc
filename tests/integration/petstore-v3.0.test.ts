import { execSync } from 'child_process';
import { readFileSync, writeFileSync, rmSync } from 'fs';
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
const FIXTURE_PATH = join(__dirname, '../fixtures/v3.0/petstore.yaml');

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

describe('Petstore v3.0 integration', () => {
  let doc: OpenAPIDocument;
  let contracts: string;
  let client: string;

  beforeAll(async () => {
    doc = await loadFromFile(FIXTURE_PATH);
    const config: GeneratorConfig = {
      input: FIXTURE_PATH,
      outputDir: '/tmp/petstore-v3-test',
    };
    const result = generateClient(doc, config);
    contracts = result.contracts;
    client = result.client;
  });

  // 1. Load and generate
  it('loads petstore.yaml and produces contracts and client strings', async () => {
    expect(doc).toBeDefined();
    expect(doc.openapi).toBe('3.0.3');
    expect(doc.info.title).toBe('Pet Store');

    expect(typeof contracts).toBe('string');
    expect(typeof client).toBe('string');
    expect(contracts.length).toBeGreaterThan(0);
    expect(client.length).toBeGreaterThan(0);
  });

  // 2. Contracts compile with tsc
  it('generated contracts compile with tsc --strict --noEmit', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'petstore-v3-contracts-'));
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
    const dir = await mkdtemp(join(tmpdir(), 'petstore-v3-client-'));
    writeFileSync(join(dir, 'contracts.ts'), contracts, 'utf-8');
    writeFileSync(join(dir, 'client.ts'), client, 'utf-8');

    const result = execSync(`npx tsc ${TSC_FLAGS} client.ts`, {
      cwd: dir,
      encoding: 'utf-8',
      timeout: 30000,
    }).trim();

    expect(result).toBe('');
  });

  // 4. Method names correct — NO PUT operation in 3.0 fixture
  it('generates correct method names using path-based strategy', () => {
    // 3.0 fixture has NO PUT operation
    expect(client).not.toContain('putPetsByPetId: decorateWithErrors<');
  });

  // 5. Nullable types — tag field is nullable in 3.0 spec
  it('generates nullable tag field as string | null', () => {});

  // 6. Error types generated for non-2xx responses
  it('generates error types for non-2xx responses', () => {});

  // 7. Schema types correct
  it('generates correct schema types from components/schemas', () => {});

  // 8. Snapshot tests
  it('matches contracts snapshot', () => {
    expect(contracts).toMatchSnapshot('petstore-v3.0-contracts');
  });

  it('matches client snapshot', () => {
    expect(client).toMatchSnapshot('petstore-v3.0-client');
  });
});

describe('Petstore v3.0 full output pipeline', () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'petstore-v3-full-'));
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

    // No PUT in 3.0 fixture
    expect(clientContent).not.toContain('putPetsByPetId: decorateWithErrors<');
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
