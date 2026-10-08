import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { generateOutput } from '../../src/generator/client-generator.js';
import type { GeneratorConfig } from '../../src/types/client.js';
import { analyzeYaml } from '../analyze-fixture.js';
import { expectFilesCompile } from '../helpers/compile-check.js';
import { linkGenoc } from '../helpers/link-genoc.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Spec #71 T1 tracer: integer path params are typed `number` and every path
// param value is serialized through the user-overridable `formatPathParam`
// formatter (default `String`).
const INT_PATH_PARAM_SPEC = `
openapi: "3.1.0"
info: { title: Test, version: "1.0.0" }
paths:
  /pets/{id}:
    get:
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: integer, format: int32 }
      responses:
        "200": { description: OK }
`;

function generateFromYaml(yaml: string): { contracts: string; client: string } {
  const config: GeneratorConfig = { input: 'test.yaml', outputDir: '/tmp/test' };
  return generateOutput(analyzeYaml(yaml), config);
}

describe('typed path params (spec #71 T1 tracer)', () => {
  it('types an integer path param (with format) as `id: number`', () => {
    const { client } = generateFromYaml(INT_PATH_PARAM_SPEC);
    expect(client).toContain('id: number');
    expect(client).not.toContain('id: string');
  });

  it('types a plain `type: number` path param as `id: number` (3.0 dialect too)', () => {
    const spec = `
      openapi: "3.0.3"
      info: { title: Test, version: "1.0.0" }
      paths:
        /pets/{id}:
          get:
            parameters:
              - name: id
                in: path
                required: true
                schema: { type: number }
            responses:
              "200": { description: OK }
    `;
    const { client } = generateFromYaml(spec);
    expect(client).toContain('id: number');
    expect(client).not.toContain('id: string');
  });

  it('keeps schema-less path params as `string`', () => {
    const spec = `
      openapi: "3.1.0"
      info: { title: Test, version: "1.0.0" }
      paths:
        /pets/{id}:
          get:
            parameters:
              - name: id
                in: path
                required: true
            responses:
              "200": { description: OK }
    `;
    const { client } = generateFromYaml(spec);
    expect(client).toContain('id: string');
  });

  it('keeps `type: string` path params as `string` while still formatting them', () => {
    const spec = `
      openapi: "3.1.0"
      info: { title: Test, version: "1.0.0" }
      paths:
        /users/{userId}:
          get:
            parameters:
              - name: userId
                in: path
                required: true
                schema: { type: string }
            responses:
              "200": { description: OK }
    `;
    const { client } = generateFromYaml(spec);
    expect(client).toContain('userId: string');
    expect(client).toContain('encodeURIComponent(formatPathParam(userId))');
  });

  it('derives the finished path-param type in the analyzer, not the generator', () => {
    const analyzed = analyzeYaml(INT_PATH_PARAM_SPEC);
    expect(analyzed.operations[0]?.pathParams[0]?.finishedType).toBe('number');
  });

  it('declares CreateClientOptions with formatPathParam in the generated client file', () => {
    const { client } = generateFromYaml(INT_PATH_PARAM_SPEC);
    expect(client).toContain('export type CreateClientOptions = {');
    expect(client).toContain('formatPathParam?: (value: string | number | boolean) => string;');
  });

  it('gives createClient an optional second parameter and defaults the formatter to String', () => {
    const { client } = generateFromYaml(INT_PATH_PARAM_SPEC);
    expect(client).toContain(
      'export function createClient(requester: Requester, options?: CreateClientOptions) {'
    );
    expect(client).toContain('const formatPathParam = options?.formatPathParam ?? String;');
  });

  it('routes path param interpolation through the formatter before encodeURIComponent', () => {
    const { client } = generateFromYaml(INT_PATH_PARAM_SPEC);
    expect(client).toContain('`/pets/${encodeURIComponent(formatPathParam(id))}`');
    expect(client).not.toContain('encodeURIComponent(id)');
  });

  describe('generated output compiles and accepts numeric ids', () => {
    const tempDirs: string[] = [];
    let outDir = '';

    const MIXED_SPEC = `
      openapi: "3.1.0"
      info: { title: Test, version: "1.0.0" }
      paths:
        /pets/{id}:
          get:
            parameters:
              - name: id
                in: path
                required: true
                schema: { type: integer, format: int64 }
              - name: verbose
                in: query
                schema: { type: boolean }
            responses:
              "200": { description: OK }
        /users/{userId}:
          delete:
            parameters:
              - name: userId
                in: path
                required: true
                schema: { type: string }
            responses:
              "204": { description: No Content }
    `;

    beforeAll(() => {
      outDir = mkdtempSync(join(tmpdir(), 'genoc-path-param-typing-'));
      tempDirs.push(outDir);
      linkGenoc(outDir);
      const config: GeneratorConfig = { input: 'test.yaml', outputDir: outDir };
      const { contracts, client, index } = generateOutput(analyzeYaml(MIXED_SPEC), config);
      writeFileSync(join(outDir, 'contracts.ts'), contracts);
      writeFileSync(join(outDir, 'client.ts'), client);
      writeFileSync(join(outDir, 'index.ts'), index);
      writeFileSync(
        join(outDir, 'usage.ts'),
        [
          `import { createClient } from './client.js';`,
          `import type { Requester } from './client.js';`,
          ``,
          `const requester: Requester = async () => {`,
          `  throw new Error('noop');`,
          `};`,
          ``,
          // Default formatter: String stays assignable.
          `export const defaultClient = createClient(requester);`,
          `// Custom formatter receives the raw typed value.`,
          `export const customClient = createClient(requester, {`,
          `  formatPathParam: (value) => value.toString(),`,
          `});`,
          ``,
          `export async function getPet(id: number): Promise<void> {`,
          `  await defaultClient.getPetsById(id);`,
          `  await customClient.getPetsById(id);`,
          `  await customClient.deleteUsersByUserId('u-1');`,
          `}`,
          ``,
        ].join('\n')
      );
    });

    afterAll(() => {
      for (const dir of tempDirs) {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('int64 path param is typed number and client + usage compile under tsc --strict', () => {
      const generated = readFileSync(join(outDir, 'client.ts'), 'utf8');
      expect(generated).toContain('id: number');
      expect(generated).toContain('userId: string');
      expectFilesCompile([join(outDir, 'usage.ts')]);
    });
  });
});
