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

// Spec #71 T1 tracer: integer path params are typed `number | string` (the
// `| string` arm is the caller's pre-formatting escape hatch) and every path
// param value is serialized inline with `String()`.
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
  it('types an integer path param (with format) as `id: number | string`', () => {
    const { client } = generateFromYaml(INT_PATH_PARAM_SPEC);
    expect(client).toContain('id: number | string');
    // Not a bare `string` signature: the schema type leads the union.
    expect(client).not.toMatch(/id: string[,)]/);
  });

  it('types a plain `type: number` path param as `id: number | string` (3.0 dialect too)', () => {
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
    expect(client).toContain('id: number | string');
    expect(client).not.toMatch(/id: string[,)]/);
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

  it('keeps `type: string` path params as bare `string` (no `| string` noise)', () => {
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
    expect(client).toContain('encodeURIComponent(String(userId))');
  });

  it('derives the finished path-param type in the analyzer, not the generator', () => {
    const analyzed = analyzeYaml(INT_PATH_PARAM_SPEC);
    expect(analyzed.operations[0]?.pathParams[0]?.finishedType).toBe('number');
  });

  // Spec #71 T2: full schema coverage — boolean, enum unions and $ref named
  // types, in both dialects.
  const T2_BOOLEAN_SPEC = (version: '3.0.3' | '3.1.0'): string => `
    openapi: "${version}"
    info: { title: Test, version: "1.0.0" }
    paths:
      /flags/{flag}:
        get:
          parameters:
            - name: flag
              in: path
              required: true
              schema: { type: boolean }
          responses:
            "200": { description: OK }
  `;

  const T2_ENUM_SPEC = (version: '3.0.3' | '3.1.0'): string => `
    openapi: "${version}"
    info: { title: Test, version: "1.0.0" }
    paths:
      /jobs/{mode}:
        get:
          parameters:
            - name: mode
              in: path
              required: true
              schema: { type: string, enum: [fast, slow] }
          responses:
            "200": { description: OK }
  `;

  const T2_REF_SPEC = (version: '3.0.3' | '3.1.0'): string => `
    openapi: "${version}"
    info: { title: Test, version: "1.0.0" }
    components:
      schemas:
        PetId: { type: string }
    paths:
      /pets/{petId}:
        get:
          parameters:
            - name: petId
              in: path
              required: true
              schema: { $ref: '#/components/schemas/PetId' }
          responses:
            "200": { description: OK }
  `;

  it('types a boolean path param as `flag: boolean | string` in both dialects', () => {
    for (const version of ['3.0.3', '3.1.0'] as const) {
      const { client } = generateFromYaml(T2_BOOLEAN_SPEC(version));
      expect(client, version).toContain('flag: boolean | string');
      expect(client, version).toContain('`/flags/${encodeURIComponent(String(flag))}`');
    }
  });

  it('emits enum path params widened to `string` in both dialects (TS collapses the union)', () => {
    for (const version of ['3.0.3', '3.1.0'] as const) {
      const { client } = generateFromYaml(T2_ENUM_SPEC(version));
      // The emitted signature is the literal union widened by `| string`;
      // TypeScript collapses that to plain `string` — deliberate (see
      // buildParameters in method-generator), pinned here so the widening
      // stays a conscious choice.
      expect(client, version).toContain("mode: 'fast' | 'slow' | string");
      expect(client, version).toContain('`/jobs/${encodeURIComponent(String(mode))}`');
    }
  });

  it('resolves a $ref path param to the named contract type in both dialects', () => {
    for (const version of ['3.0.3', '3.1.0'] as const) {
      const analyzed = analyzeYaml(T2_REF_SPEC(version));
      expect(analyzed.operations[0]?.pathParams[0]?.finishedType, version).toBe('PetId');
      const { contracts, client } = generateOutput(analyzed, {
        input: 'test.yaml',
        outputDir: '/tmp/test',
      });
      expect(contracts, version).toContain('export type PetId = string;');
      expect(client, version).toContain('petId: PetId | string');
      expect(client, version).toContain('`/pets/${encodeURIComponent(String(petId))}`');
    }
  });

  it('produces identical typing shape for 3.0 and 3.1 dialects (boolean, enum, $ref)', () => {
    const normalize = (text: string): string => text.replace(/OpenAPI 3\.\d+\.\d+/, 'OpenAPI');
    const specs = [T2_BOOLEAN_SPEC, T2_ENUM_SPEC, T2_REF_SPEC];
    for (const spec of specs) {
      const v30 = generateFromYaml(spec('3.0.3'));
      const v31 = generateFromYaml(spec('3.1.0'));
      expect(normalize(v30.contracts)).toBe(normalize(v31.contracts));
      expect(normalize(v30.client)).toBe(normalize(v31.client));
    }
  });

  // Review-fix scenarios: nullable path params, a param literally named
  // `formatPathParam`, and non-primitive $ref params (inline-serialization
  // fallback to `string`).

  const NULLABLE_PARAM_SPEC = (version: '3.0.3' | '3.1.0'): string => `
    openapi: "${version}"
    info: { title: Test, version: "1.0.0" }
    paths:
      /pets/{id}:
        get:
          parameters:
            - name: id
              in: path
              required: true
              schema: ${version === '3.1.0' ? "{ type: [integer, 'null'] }" : '{ type: integer, nullable: true }'}
          responses:
            "200": { description: OK }
  `;

  const SHADOWING_PARAM_SPEC = `
    openapi: "3.1.0"
    info: { title: Test, version: "1.0.0" }
    paths:
      /echo/{formatPathParam}:
        get:
          parameters:
            - name: formatPathParam
              in: path
              required: true
              schema: { type: string }
          responses:
            "200": { description: OK }
  `;

  const OBJECT_REF_PARAM_SPEC = (version: '3.0.3' | '3.1.0'): string => `
    openapi: "${version}"
    info: { title: Test, version: "1.0.0" }
    components:
      schemas:
        Pet:
          type: object
          properties:
            name: { type: string }
    paths:
      /pets/{petId}:
        get:
          parameters:
            - name: petId
              in: path
              required: true
              schema: { $ref: '#/components/schemas/Pet' }
          responses:
            "200": { description: OK }
  `;

  it('types a nullable path param as `number | null | string` in both dialects', () => {
    for (const version of ['3.0.3', '3.1.0'] as const) {
      const analyzed = analyzeYaml(NULLABLE_PARAM_SPEC(version));
      expect(analyzed.operations[0]?.pathParams[0]?.finishedType, version).toBe('number | null');
      const { client } = generateFromYaml(NULLABLE_PARAM_SPEC(version));
      expect(client, version).toContain('id: number | null | string');
    }
  });

  it('treats a path param named formatPathParam as a plain string param (no formatter local)', () => {
    const { client } = generateFromYaml(SHADOWING_PARAM_SPEC);
    expect(client).toContain('formatPathParam: string');
    expect(client).toContain('`/echo/${encodeURIComponent(String(formatPathParam))}`');
    expect(client).not.toContain('__formatPathParam');
  });

  it('falls back to `string` for a $ref to an object schema (no defined string form)', () => {
    for (const version of ['3.0.3', '3.1.0'] as const) {
      const analyzed = analyzeYaml(OBJECT_REF_PARAM_SPEC(version));
      expect(analyzed.operations[0]?.pathParams[0]?.finishedType, version).toBe('string');
      const { contracts, client } = generateOutput(analyzed, {
        input: 'test.yaml',
        outputDir: '/tmp/test',
      });
      expect(client, version).toContain('petId: string');
      // The named object type stays in contracts but never reaches the client
      // file (no signature reference, no `import type`).
      expect(contracts, version).toMatch(/export type Pet = \{/);
      expect(client, version).not.toMatch(/\bPet\b/);
      expect(client, version).toContain('`/pets/${encodeURIComponent(String(petId))}`');
    }
  });

  it('does not declare CreateClientOptions or any formatter plumbing', () => {
    const { client } = generateFromYaml(INT_PATH_PARAM_SPEC);
    expect(client).not.toContain('CreateClientOptions');
    expect(client).not.toContain('formatPathParam?:');
  });

  it('gives createClient a single requester parameter', () => {
    const { client } = generateFromYaml(INT_PATH_PARAM_SPEC);
    expect(client).toContain('export function createClient(requester: Requester) {');
  });

  it('serializes path params with String() inside encodeURIComponent', () => {
    const { client } = generateFromYaml(INT_PATH_PARAM_SPEC);
    expect(client).toContain('`/pets/${encodeURIComponent(String(id))}`');
    expect(client).not.toContain('__formatPathParam');
  });

  describe('generated output compiles and accepts numeric ids', () => {
    const tempDirs: string[] = [];
    let outDir = '';

    const MIXED_SPEC = `
      openapi: "3.1.0"
      info: { title: Test, version: "1.0.0" }
      components:
        schemas:
          PetId: { type: string }
          Pet:
            type: object
            properties:
              name: { type: string }
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
        /jobs/{mode}/{petId}:
          get:
            parameters:
              - name: mode
                in: path
                required: true
                schema: { type: string, enum: [fast, slow] }
              - name: petId
                in: path
                required: true
                schema: { $ref: '#/components/schemas/PetId' }
            responses:
              "200": { description: OK }
        /nullable/{id}:
          get:
            parameters:
              - name: id
                in: path
                required: true
                schema: { type: [integer, 'null'] }
            responses:
              "200": { description: OK }
        /echo/{formatPathParam}:
          get:
            parameters:
              - name: formatPathParam
                in: path
                required: true
                schema: { type: string }
            responses:
              "200": { description: OK }
        /shelters/{resident}:
          get:
            parameters:
              - name: resident
                in: path
                required: true
                schema: { $ref: '#/components/schemas/Pet' }
            responses:
              "200": { description: OK }
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
          `export const client = createClient(requester);`,
          ``,
          `export async function getPet(id: number): Promise<void> {`,
          `  await client.getPetsById(id);`,
          `  // Pre-formatted string escape hatch: the union accepts a string.`,
          `  await client.getPetsById(String(7).padStart(4, '0'));`,
          `  await client.deleteUsersByUserId('u-1');`,
          `  await client.getJobsByModeByPetId('fast', 'p-1');`,
          `  // Literal unions widen to string: a non-member string compiles.`,
          `  await client.getJobsByModeByPetId('whatever', 'p-1');`,
          `  await client.getNullableById(null);`,
          `  await client.getEchoByFormatPathParam('raw value');`,
          `  await client.getSheltersByResident('resident-1');`,
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

    it('path params are typed `T | string` and client + usage compile under tsc --strict', () => {
      const generated = readFileSync(join(outDir, 'client.ts'), 'utf8');
      expect(generated).toContain('id: number | string');
      expect(generated).toContain('userId: string');
      expect(generated).toContain("mode: 'fast' | 'slow' | string");
      expect(generated).toContain('petId: PetId | string');
      expect(generated).toContain('id: number | null | string');
      expect(generated).toContain('formatPathParam: string');
      // Non-primitive $ref path param falls back to bare `string`.
      expect(generated).toContain('resident: string');
      expect(generated).not.toMatch(/\bresident: Pet\b/);
      expectFilesCompile([join(outDir, 'usage.ts')]);
    });
  });
});
