import { writeFileSync, readFileSync, rmSync } from 'fs';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { generateClient, generateFullOutput } from '../../src/generator/client-generator.js';
import { loadFromFile } from '../../src/parser/spec-reader.js';
import type { GeneratorConfig } from '../../src/types/client.js';
import type { OpenAPIDocument } from '../../src/types/openapi.js';
import { expectFilesCompile } from '../helpers/compile-check.js';
import { linkGenoc } from '../helpers/link-genoc.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, '../fixtures/vendor-binary-ref.yaml');

describe('Vendor binary $ref integration', () => {
  let doc: OpenAPIDocument;
  let contracts: string;
  let client: string;

  beforeAll(async () => {
    doc = await loadFromFile(FIXTURE_PATH);
    const config: GeneratorConfig = {
      input: FIXTURE_PATH,
      outputDir: '/tmp/vendor-binary-test',
    };
    const result = generateClient(doc, config);
    contracts = result.contracts;
    client = result.client;
  });

  it('loads vendor-binary-ref.yaml as an OpenAPI 3.0 spec', () => {
    expect(doc.openapi).toBe('3.0.3');
    expect(doc.info.title).toBe('Vendor Binary API');
  });

  it('emits StreamResponse for the vendor-CT $ref-ed binary response', () => {
    expect(contracts).toContain('export type GetFilesIdResponse = StreamResponse;');
  });

  it('emits Blob for the vendor-CT $ref-ed binary request body', () => {
    expect(contracts).toContain('export type PostFilesIdBody = Blob;');
  });

  it('emits the JSON error type for the 404 response', () => {
    expect(contracts).toContain('export type GetFilesIdError404 = NotFoundError;');
  });

  it('client requests the binary download with expectStream exactly once', () => {
    expect(client.match(/expectStream: true/g)).toHaveLength(1);
    expect(client).toContain('expectStream: true');
  });

  it('client guards the binary download with the expected-stream check', () => {
    expect(client).toContain(
      'throw new RequesterFailError(new Error("Expected stream response"));'
    );
    expect(client.match(/"Expected stream response"/g)).toHaveLength(1);
    expect(client).toContain('"Unexpected stream response"');
  });

  it('generated contracts and client compile with tsc --strict --noEmit', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vendor-binary-compile-'));
    linkGenoc(dir);
    writeFileSync(join(dir, 'contracts.ts'), contracts, 'utf-8');
    writeFileSync(join(dir, 'client.ts'), client, 'utf-8');

    expectFilesCompile([join(dir, 'client.ts'), join(dir, 'contracts.ts')]);

    rmSync(dir, { recursive: true, force: true });
  });

  it('matches contracts snapshot', () => {
    expect(contracts).toMatchSnapshot('vendor-binary-contracts');
  });

  it('matches client snapshot', () => {
    expect(client).toMatchSnapshot('vendor-binary-client');
  });
});

describe('Vendor binary full output pipeline', () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'vendor-binary-full-'));
    linkGenoc(tmpDir);
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
    expect(readFileSync(join(tmpDir, 'contracts.ts'), 'utf-8')).toContain(
      'export type GetFilesIdResponse = StreamResponse;'
    );
    expect(readFileSync(join(tmpDir, 'client.ts'), 'utf-8')).toContain('expectStream: true');
  });

  it('generated files on disk compile together with tsc', () => {
    expectFilesCompile([
      join(tmpDir, 'client.ts'),
      join(tmpDir, 'contracts.ts'),
      join(tmpDir, 'index.ts'),
    ]);
  });
});
