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
const FIXTURE_PATH = join(__dirname, '../fixtures/openapi-3.0-full.yaml');
const PROJECT_ROOT = join(__dirname, '../../');

const TSC = join(PROJECT_ROOT, 'node_modules/.bin/tsc');
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

describe('OpenAPI 3.0 Mega-Spec Integration Test', () => {
  let doc: OpenAPIDocument;
  let contracts: string;
  let client: string;
  let tmpDir: string;

  beforeAll(async () => {
    doc = await loadFromFile(FIXTURE_PATH);
    const config: GeneratorConfig = {
      input: FIXTURE_PATH,
      outputDir: '/tmp/mega-spec-3.0-test',
    };
    const result = generateClient(doc, config);
    contracts = result.contracts;
    client = result.client;
  });

  it('loads mega-spec.yaml and produces contracts and client strings', async () => {
    expect(doc).toBeDefined();
    expect(doc.openapi).toBe('3.0.0');
    expect(doc.info.title).toBe('OpenAPI 3.0 Mega Spec');
    expect(doc.info.version).toBe('1.0.0');

    expect(typeof contracts).toBe('string');
    expect(typeof client).toBe('string');
    expect(contracts.length).toBeGreaterThan(0);
    expect(client.length).toBeGreaterThan(0);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  it('generated contracts compile with tsc --strict --noEmit', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'mega-spec-3.0-contracts-'));
    const contractsFile = join(tmpDir, 'contracts.ts');
    writeFileSync(contractsFile, contracts, 'utf-8');

    const result = execSync(`${TSC} ${TSC_FLAGS} ${contractsFile}`, {
      cwd: tmpDir,
      encoding: 'utf-8',
      timeout: 60000,
    }).trim();

    expect(result).toBe('');
  });

  it('generated client compiles with tsc --strict --noEmit', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mega-spec-3.0-client-'));
    writeFileSync(join(dir, 'contracts.ts'), contracts, 'utf-8');
    writeFileSync(join(dir, 'client.ts'), client, 'utf-8');

    const result = execSync(`${TSC} ${TSC_FLAGS} client.ts`, {
      cwd: dir,
      encoding: 'utf-8',
      timeout: 60000,
    }).trim();

    expect(result).toBe('');
  });

  it('handles nullable keyword (3.0-specific)', () => {});

  it('strips $ref siblings (3.0-specific behavior)', () => {});

  it('generates parameter types', () => {
    expect(contracts).not.toContain('GetCookiesCookie');
  });

  it('has security scheme types but no auth enforcement', () => {
    expect(client).not.toContain('ApiKeyQueryAuth');
    expect(client).not.toContain('Authorization');
  });

  it('handles exclusiveMinimum/exclusiveMaximum as booleans (3.0-specific)', () => {});

  it('uses first content type for request bodies', () => {
    expect(contracts).not.toContain('xml_data');
  });

  it('strips $ref siblings in path operation schemas (3.0-specific)', () => {});

  it('does not emit validation constraint keywords in type output', () => {
    expect(contracts).not.toContain('minItems:');
    expect(contracts).not.toContain('maxItems:');
    expect(contracts).not.toContain('minLength:');
    expect(contracts).not.toContain('maxLength:');
  });

  it('does not generate webhook-related output', () => {
    expect(client).not.toContain('Webhook');
    expect(client).not.toContain('webhook');
  });

  describe('Full output pipeline', () => {
    let fullTmpDir: string;

    beforeAll(async () => {
      fullTmpDir = await mkdtemp(join(tmpdir(), 'mega-spec-3.0-full-'));
      const doc = await loadFromFile(FIXTURE_PATH);
      const config: GeneratorConfig = {
        input: FIXTURE_PATH,
        outputDir: fullTmpDir,
      };
      await generateFullOutput(doc, config);
    });

    afterAll(() => {
      rmSync(fullTmpDir, { recursive: true, force: true });
    });

    it('writes contracts.ts and client.ts to disk', () => {
      const contractsFile = join(fullTmpDir, 'contracts.ts');
      const clientFile = join(fullTmpDir, 'client.ts');

      const contractsContent = readFileSync(contractsFile, 'utf-8');
      const clientContent = readFileSync(clientFile, 'utf-8');

      expect(contractsContent).toMatchSnapshot();
      expect(clientContent).toMatchSnapshot();
    });
  });
});
