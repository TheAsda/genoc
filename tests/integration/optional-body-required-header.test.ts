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

// OpenAPI 3.0 and 3.1 fixtures share the same operation shape (POST
// /api/v1/entity: optional query, optional JSON body, required header) so the
// optional-before-required rendering rule is asserted per dialect.
const DIALECT_CASES = [
  ['3.0', join(__dirname, '../fixtures/optional-body-required-header.yaml')],
  ['3.1', join(__dirname, '../fixtures/optional-body-required-header-3.1.yaml')],
] as const;

const tempDirs: string[] = [];

describe.each(DIALECT_CASES)(
  'Optional body + required header signature (OpenAPI %s)',
  (version, fixturePath) => {
    let client = '';
    let outDir = '';

    beforeAll(async () => {
      outDir = mkdtempSync(
        join(tmpdir(), `genoc-opt-body-req-header-${version.replace('.', '')}-`)
      );
      tempDirs.push(outDir);
      linkGenoc(outDir);
      const config: GeneratorConfig = {
        input: fixturePath,
        outputDir: outDir,
      };
      await generateFullOutput(await loadFromFile(fixturePath), config);
      client = readFileSync(join(outDir, 'client.ts'), 'utf8');
    });

    afterAll(() => {
      for (const dir of tempDirs) {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('sample spec contains query + optional body + required header operation', async () => {
      const doc = await loadFromFile(fixturePath);
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
      // The all-optional query slot widens too; headers (required, last) stay
      // untouched — no `| undefined` on the headers slot.
      expect(signatureLine).toContain('query: PostApiV1EntityQuery | undefined');
      expect(signatureLine).not.toContain('query?:');
      expect(signatureLine).not.toContain('headers: PostApiV1EntityHeaders | undefined');
      expect(signatureLine).toContain('headers: PostApiV1EntityHeaders');
    });

    it('generated output compiles under tsc --strict', () => {
      expectFilesCompile([join(outDir, 'index.ts')]);
    });

    it('writes contracts alongside client (sanity)', () => {
      expect(readFileSync(join(outDir, 'contracts.ts'), 'utf8')).toContain(
        'export type PostApiV1EntityBody'
      );
    });
  }
);
