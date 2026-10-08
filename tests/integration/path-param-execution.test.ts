import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';

import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { generateOutput } from '../../src/generator/client-generator.js';
import type { GeneratorConfig } from '../../src/types/client.js';
import { analyzeYaml } from '../analyze-fixture.js';
import { linkGenoc } from '../helpers/link-genoc.js';

// Spec #71 T3 execution seam: the only place path-param serialization is
// observed as behavior. Generated output is compiled to JS, the client is
// dynamically imported, and a mock Requester captures the (method, URL) it is
// invoked with — proving what the client emits instead of inferring it from
// generated text.

const EXECUTION_SPEC = `
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
  /files/{name}:
    get:
      parameters:
        - name: name
          in: path
          required: true
          schema: { type: string }
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
`;

interface CapturedCall {
  method: string;
  path: string;
}

/**
 * Minimal mock `Requester`: captures the HTTP method and URL it is invoked
 * with and returns a plain success value. The generated method body only
 * requires that the result is not an `ErrorResponse` / `StreamResponse`
 * instance, so an empty object passes straight through.
 */
function makeCapturingRequester(calls: CapturedCall[]) {
  return async (method: string, path: string) => {
    calls.push({ method, path });
    return {};
  };
}

/**
 * Compile generated TS output to ESM JS in place (same flags as the shared
 * type-check helper, but with emit enabled) so it can be dynamically
 * imported. Throws with formatted diagnostics when the program has errors.
 */
function emitToJs(entryFiles: string[]): void {
  const program = ts.createProgram(entryFiles, {
    strict: true,
    noEmit: false,
    esModuleInterop: true,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2022,
    skipLibCheck: true,
  });
  const format = (diagnostic: ts.Diagnostic): string => {
    let location = '';
    if (diagnostic.file !== undefined && diagnostic.start !== undefined) {
      const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
      location = `${diagnostic.file.fileName}:${line + 1}:${character + 1} - `;
    }
    return `${location}error TS${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`;
  };
  const errors = ts
    .getPreEmitDiagnostics(program)
    .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  const emitResult = program.emit();
  const emitErrors = emitResult.diagnostics.filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error
  );
  const all = [...errors, ...emitErrors];
  if (all.length > 0) {
    throw new Error(
      `Compile-to-JS failed for ${entryFiles.join(', ')}:\n${all.map(format).join('\n')}`
    );
  }
}

describe('path-param execution seam (spec #71 T3)', () => {
  let outDir = '';
  type Client = Record<string, (...args: never[]) => unknown>;
  let createClient: (requester: unknown) => Client;

  beforeAll(async () => {
    outDir = mkdtempSync(join(tmpdir(), 'genoc-path-param-execution-'));
    linkGenoc(outDir);
    const config: GeneratorConfig = { input: 'test.yaml', outputDir: outDir };
    const { contracts, client, index } = generateOutput(analyzeYaml(EXECUTION_SPEC), config);
    // Mirror a real consumer: the output directory is an ESM package.
    writeFileSync(join(outDir, 'package.json'), JSON.stringify({ type: 'module', private: true }));
    writeFileSync(join(outDir, 'contracts.ts'), contracts);
    writeFileSync(join(outDir, 'client.ts'), client);
    writeFileSync(join(outDir, 'index.ts'), index);
    emitToJs([join(outDir, 'client.ts'), join(outDir, 'index.ts')]);
    // @vite-ignore + variable specifier: bypass vitest's transform pipeline so
    // the emitted module is loaded natively, resolving `genoc/runtime` through
    // the `linkGenoc` symlink exactly like a real consumer would.
    const clientUrl = pathToFileURL(join(outDir, 'client.js')).href;
    const imported = (await import(/* @vite-ignore */ clientUrl)) as {
      createClient: (requester: unknown) => Record<string, (...args: never[]) => unknown>;
    };
    createClient = imported.createClient;
  });

  afterAll(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  it('String() serializes an integer path param into the expected URL segment', async () => {
    const calls: CapturedCall[] = [];
    const client = createClient(makeCapturingRequester(calls));

    await client.getPetsById(42);

    expect(calls).toEqual([{ method: 'GET', path: '/pets/42' }]);
  });

  it('a pre-formatted string is accepted for a typed param and passes through verbatim', async () => {
    // `T | string` is the caller's escape hatch: pre-format on your side and
    // pass a plain string — the client must not reformat it.
    const calls: CapturedCall[] = [];
    const client = createClient(makeCapturingRequester(calls));

    await client.getPetsById('0042');

    expect(calls).toEqual([{ method: 'GET', path: '/pets/0042' }]);
  });

  it('values containing special characters come out URL-encoded in the final path', async () => {
    const calls: CapturedCall[] = [];
    const client = createClient(makeCapturingRequester(calls));

    await client.getFilesByName('docs/a b ü?x=1#f');

    expect(calls).toEqual([{ method: 'GET', path: '/files/docs%2Fa%20b%20%C3%BC%3Fx%3D1%23f' }]);
  });

  it('a null path param serializes via String(null) (rendering the "null" segment)', async () => {
    const calls: CapturedCall[] = [];
    const client = createClient(makeCapturingRequester(calls));

    await client.getNullableById(null);

    expect(calls).toEqual([{ method: 'GET', path: '/nullable/null' }]);
  });

  it('a path param named formatPathParam serializes like any other string param', async () => {
    // With the formatter option gone there is no local left to shadow; the
    // name is an ordinary parameter and percent-encoding still applies.
    const calls: CapturedCall[] = [];
    const client = createClient(makeCapturingRequester(calls));

    await client.getEchoByFormatPathParam('a b');

    expect(calls).toEqual([{ method: 'GET', path: '/echo/a%20b' }]);
  });
});
