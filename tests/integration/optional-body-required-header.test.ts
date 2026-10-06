import { readFileSync, rmSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadFromFile } from '../../src/parser/spec-reader.js';
import { generateFullOutput } from '../../src/pipeline.js';
import type { GeneratorConfig } from '../../src/types/client.js';
import { expectFilesCompile } from '../helpers/compile-check.js';
import { linkGenoc } from '../helpers/link-genoc.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, '../fixtures/optional-body-required-header.yaml');

const tempDirs: string[] = [];

describe('Optional body + required header signature', () => {
  let client = '';

  beforeAll(async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'genoc-opt-body-req-header-'));
    tempDirs.push(outDir);
    linkGenoc(outDir);
    const config: GeneratorConfig = {
      input: FIXTURE_PATH,
      outputDir: outDir,
    };
    await generateFullOutput(await loadFromFile(FIXTURE_PATH), config);
    client = readFileSync(join(outDir, 'client.ts'), 'utf8');
  });

  afterAll(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('sample spec contains query + optional body + required header operation', async () => {
    const doc = await loadFromFile(FIXTURE_PATH);
    const post = (doc.paths as Record<string, { post?: { parameters?: unknown[] } }>)[
      '/api/v1/entity'
    ].post;
    expect(post?.parameters).toHaveLength(2);
  });

  it('never places an optional (?:) parameter before a required one', () => {
    // postApiV1Entity = path-based naming for POST /api/v1/entity.
    const signatureLine = client.split('\n').find((line) => line.includes('postApiV1Entity:'));
    expect(signatureLine).toBeDefined();

    // Optional body before required headers must use `| undefined`, not `?:`.
    expect(signatureLine).toContain('body: PostApiV1EntityBody | undefined');
    expect(signatureLine).not.toContain('body?:');
    expect(signatureLine).toContain('headers: PostApiV1EntityHeaders');
  });

  it('generated output compiles under tsc --strict', () => {
    const outDir = tempDirs[0]!;
    expectFilesCompile([join(outDir, 'index.ts')]);
  });

  it('writes contracts alongside client (sanity)', () => {
    const outDir = tempDirs[0]!;
    expect(readFileSync(join(outDir, 'contracts.ts'), 'utf8')).toContain(
      'export type PostApiV1EntityBody'
    );
  });
});
