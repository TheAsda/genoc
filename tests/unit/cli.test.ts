import {
  copyFileSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  rmSync,
  mkdtempSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';

import { run } from '@stricli/core';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { app } from '../../src/cli/app.js';
import type { AppFlags } from '../../src/cli/app.js';
import { UserError } from '../../src/cli/errors.js';
import impl from '../../src/cli/impl.js';

let TEST_DIR: string;
let OUTPUT_DIR: string;
let SPECS_DIR: string;

/** Replace the temp directory path with a stable placeholder for deterministic snapshots. */
function normalizePaths(output: string): string {
  return output.replaceAll(TEST_DIR, '<TEMP_DIR>');
}

function createTestSpec(spec = {}) {
  return {
    openapi: '3.1.0',
    info: { title: 'Test API', version: '1.0.0' },
    paths: {
      '/test': {
        get: {
          summary: 'Test endpoint',
          responses: {
            '200': {
              description: 'Success',
              content: { 'application/json': { schema: { type: 'string' } } },
            },
          },
        },
      },
    },
    ...spec,
  };
}

function buildContext() {
  const captured = { stdout: '', stderr: '', exitCode: undefined as number | undefined };
  const stdout = {
    write: (msg: string) => {
      captured.stdout += msg;
    },
  };
  const stderr = {
    write: (msg: string) => {
      captured.stderr += msg;
    },
  };
  return {
    captured,
    context: {
      process: {
        stdout,
        stderr,
        exitCode: captured.exitCode,
        env: process.env,
      },
    },
  };
}

type ImplFn = (this: unknown, flags: AppFlags, spec: string) => Promise<void | Error>;

/**
 * Invoke the impl command function directly, bypassing stricli argument parsing.
 * Returns whatever impl resolves with (undefined on success, Error on failure) —
 * the stricli error-as-return contract.
 */
function callImpl(
  context: ReturnType<typeof buildContext>['context'],
  flags: AppFlags,
  spec: string
): Promise<void | Error> {
  return (impl as unknown as ImplFn).call(context, flags, spec);
}

/** Mirrors the flags stricli's parser produces for `genoc <spec> --output-dir <dir>`. */
function baseFlags(overrides: Partial<AppFlags> = {}): AppFlags {
  return {
    outputDir: OUTPUT_DIR,
    methodNameStrategy: 'path-based',
    strictVersion: true,
    ...overrides,
  };
}

function copyFixture(name: string): string {
  const specPath = join(SPECS_DIR, name);
  copyFileSync(join(fileURLToPath(new URL('../fixtures', import.meta.url)), name), specPath);
  return specPath;
}

describe('CLI Entry Point', () => {
  beforeEach(() => {
    TEST_DIR = mkdtempSync(join(tmpdir(), 'genoc-cli-test-'));
    OUTPUT_DIR = join(TEST_DIR, 'output');
    SPECS_DIR = join(TEST_DIR, 'specs');
    mkdirSync(SPECS_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  it('shows help when --help flag is used', async () => {
    const { captured, context } = buildContext();
    await run(app, ['--help'], context);
    expect(captured.stdout).toMatchSnapshot();
  });

  it('errors when spec positional is missing', async () => {
    const { captured, context } = buildContext();
    await run(app, ['--output-dir', OUTPUT_DIR], context);
    expect(normalizePaths(captured.stderr)).toMatchSnapshot();
    expect(context.process.exitCode).not.toBe(0);
  });

  it('errors when --output-dir is missing', async () => {
    const { captured, context } = buildContext();
    const specPath = join(SPECS_DIR, 'test.json');
    writeFileSync(specPath, JSON.stringify(createTestSpec(), null, 2));
    await run(app, [specPath], context);
    expect(normalizePaths(captured.stderr)).toMatchSnapshot();
    expect(context.process.exitCode).not.toBe(0);
  });

  it('errors when invalid methodNameStrategy is used', async () => {
    const { captured, context } = buildContext();
    const specPath = join(SPECS_DIR, 'test.json');
    writeFileSync(specPath, JSON.stringify(createTestSpec(), null, 2));
    await run(
      app,
      [specPath, '--output-dir', OUTPUT_DIR, '--method-name-strategy', 'invalid'],
      context
    );
    expect(normalizePaths(captured.stderr)).toMatchSnapshot();
    expect(context.process.exitCode).not.toBe(0);
  });

  it('generates files from JSON spec', async () => {
    const spec = createTestSpec();
    const specPath = join(SPECS_DIR, 'test.json');
    writeFileSync(specPath, JSON.stringify(spec, null, 2));

    const { captured, context } = buildContext();
    await run(app, [specPath, '--output-dir', OUTPUT_DIR], context);

    expect(normalizePaths(captured.stdout)).toMatchSnapshot();
    expect(existsSync(join(OUTPUT_DIR, 'contracts.ts'))).toBe(true);
    expect(existsSync(join(OUTPUT_DIR, 'client.ts'))).toBe(true);
    expect(existsSync(join(OUTPUT_DIR, 'index.ts'))).toBe(true);
  });

  it('generates files with operationId strategy', async () => {
    const spec = {
      openapi: '3.1.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/test': {
          get: {
            operationId: 'getTest',
            summary: 'Test endpoint',
            responses: {
              '200': {
                description: 'Success',
                content: { 'application/json': { schema: { type: 'string' } } },
              },
            },
          },
        },
      },
    };

    const specPath = join(SPECS_DIR, 'test.json');
    writeFileSync(specPath, JSON.stringify(spec, null, 2));

    const { captured, context } = buildContext();
    await run(
      app,
      [specPath, '--output-dir', OUTPUT_DIR, '--method-name-strategy', 'operationId'],
      context
    );

    expect(normalizePaths(captured.stdout)).toMatchSnapshot();
    expect(existsSync(join(OUTPUT_DIR, 'contracts.ts'))).toBe(true);
    expect(existsSync(join(OUTPUT_DIR, 'client.ts'))).toBe(true);
    expect(existsSync(join(OUTPUT_DIR, 'index.ts'))).toBe(true);

    const clientFile = readFileSync(join(OUTPUT_DIR, 'client.ts'), 'utf-8');
    expect(clientFile).toMatchSnapshot();
  });

  it('generates files with operationId-with-fallback strategy', async () => {
    const spec = {
      openapi: '3.1.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/test': {
          get: {
            operationId: 'getTest',
            summary: 'Test endpoint',
            responses: {
              '200': {
                description: 'Success',
                content: { 'application/json': { schema: { type: 'string' } } },
              },
            },
          },
        },
      },
    };

    const specPath = join(SPECS_DIR, 'test.json');
    writeFileSync(specPath, JSON.stringify(spec, null, 2));

    const { captured, context } = buildContext();
    await run(
      app,
      [specPath, '--output-dir', OUTPUT_DIR, '--method-name-strategy', 'operationId-with-fallback'],
      context
    );

    expect(normalizePaths(captured.stdout)).toMatchSnapshot();
    expect(existsSync(join(OUTPUT_DIR, 'contracts.ts'))).toBe(true);
    expect(existsSync(join(OUTPUT_DIR, 'client.ts'))).toBe(true);
    expect(existsSync(join(OUTPUT_DIR, 'index.ts'))).toBe(true);

    const clientFile = readFileSync(join(OUTPUT_DIR, 'client.ts'), 'utf-8');
    expect(clientFile).toMatchSnapshot();
  });

  it('handles invalid OpenAPI version', async () => {
    const invalidSpec = {
      openapi: '4.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {},
    };

    const specPath = join(SPECS_DIR, 'invalid.json');
    writeFileSync(specPath, JSON.stringify(invalidSpec, null, 2));

    const { captured, context } = buildContext();
    await run(app, [specPath, '--output-dir', OUTPUT_DIR], context);

    expect(normalizePaths(captured.stderr)).toMatchSnapshot();
    expect(context.process.exitCode).not.toBe(0);
  });

  it('handles missing required fields', async () => {
    const invalidSpec = {
      openapi: '3.1.0',
    };

    const specPath = join(SPECS_DIR, 'invalid.json');
    writeFileSync(specPath, JSON.stringify(invalidSpec, null, 2));

    const { captured, context } = buildContext();
    await run(app, [specPath, '--output-dir', OUTPUT_DIR], context);

    expect(normalizePaths(captured.stderr)).toMatchSnapshot();
    expect(context.process.exitCode).not.toBe(0);
  });

  it('creates output directory if it does not exist', async () => {
    rmSync(OUTPUT_DIR, { recursive: true, force: true });
    expect(existsSync(OUTPUT_DIR)).toBe(false);

    const spec = createTestSpec();
    const specPath = join(SPECS_DIR, 'test.json');
    writeFileSync(specPath, JSON.stringify(spec, null, 2));

    const { captured, context } = buildContext();
    await run(app, [specPath, '--output-dir', OUTPUT_DIR], context);

    expect(existsSync(OUTPUT_DIR)).toBe(true);
    expect(existsSync(join(OUTPUT_DIR, 'contracts.ts'))).toBe(true);
    expect(existsSync(join(OUTPUT_DIR, 'client.ts'))).toBe(true);
    expect(existsSync(join(OUTPUT_DIR, 'index.ts'))).toBe(true);
  });

  it('[characterization] happy path emits exact stdout byte sequence for petstore fixture', async () => {
    const specPath = copyFixture('petstore.yaml');

    const { captured, context } = buildContext();
    await run(app, [specPath, '--output-dir', OUTPUT_DIR], context);

    expect(captured.stderr).toBe('');
    expect(captured.stdout).toBe(
      [
        `Loading spec from ${specPath}...\n`,
        'Loaded OpenAPI 3.1.0 spec\n',
        'Generating client...\n',
        '✅ Success! Generated client files:\n',
        `  - ${OUTPUT_DIR}/contracts.ts\n`,
        `  - ${OUTPUT_DIR}/client.ts\n`,
        `  - ${OUTPUT_DIR}/index.ts\n`,
      ].join('')
    );
    expect(existsSync(join(OUTPUT_DIR, 'contracts.ts'))).toBe(true);
    expect(existsSync(join(OUTPUT_DIR, 'client.ts'))).toBe(true);
    expect(existsSync(join(OUTPUT_DIR, 'index.ts'))).toBe(true);
  });

  it('[characterization] methodNameStrategy undefined produces byte-identical output to explicit "path-based"', async () => {
    const specPath = join(SPECS_DIR, 'test.json');
    writeFileSync(specPath, JSON.stringify(createTestSpec(), null, 2));

    const generateWith = async (strategy: AppFlags['methodNameStrategy']) => {
      const outDir = join(TEST_DIR, `out-${strategy ?? 'undefined'}`);
      const { context } = buildContext();
      const result = await callImpl(
        context,
        baseFlags({ outputDir: outDir, methodNameStrategy: strategy }),
        specPath
      );
      expect(result).toBeUndefined();
      return {
        client: readFileSync(join(outDir, 'client.ts'), 'utf-8'),
        contracts: readFileSync(join(outDir, 'contracts.ts'), 'utf-8'),
        index: readFileSync(join(outDir, 'index.ts'), 'utf-8'),
      };
    };

    const implicit = await generateWith(undefined);
    const explicit = await generateWith('path-based');

    expect(implicit).toEqual(explicit);
    expect(explicit.client).toContain('getTest');
  });

  it('[characterization] strictVersion gate: mismatch warning emitted by default', async () => {
    const specPath = join(SPECS_DIR, 'test.json');
    writeFileSync(specPath, JSON.stringify(createTestSpec(), null, 2));

    const { captured, context } = buildContext();
    await run(app, [specPath, '--output-dir', OUTPUT_DIR, '--spec-version', '3.0'], context);

    expect(captured.stderr).toContain(
      'Warning: Specified version 3.0 does not match detected version 3.1'
    );
  });

  it('[characterization] strictVersion gate: strictVersion=false suppresses the warning (direct impl)', async () => {
    const specPath = join(SPECS_DIR, 'test.json');
    writeFileSync(specPath, JSON.stringify(createTestSpec(), null, 2));

    const { captured, context } = buildContext();
    const result = await callImpl(
      context,
      baseFlags({ specVersion: '3.0', strictVersion: false }),
      specPath
    );

    expect(captured.stderr).toBe('');
    expect(result).toBeInstanceOf(UserError);
    expect((result as UserError).message).toContain('Invalid OpenAPI specification');
  });

  it('[characterization] strictVersion gate: --strict-version=false suppresses the warning via CLI', async () => {
    const specPath = join(SPECS_DIR, 'test.json');
    writeFileSync(specPath, JSON.stringify(createTestSpec(), null, 2));

    const { captured, context } = buildContext();
    await run(
      app,
      [specPath, '--output-dir', OUTPUT_DIR, '--spec-version', '3.0', '--strict-version=false'],
      context
    );

    expect(captured.stderr).not.toContain('Warning: Specified version');
  });

  it('[characterization] proxy: invalid proxy URL returns UserError before any output', async () => {
    const specPath = join(SPECS_DIR, 'test.json');
    writeFileSync(specPath, JSON.stringify(createTestSpec(), null, 2));

    const { captured, context } = buildContext();
    const result = await callImpl(
      context,
      baseFlags({ proxy: 'socks5://127.0.0.1:1080' }),
      specPath
    );

    expect(result).toBeInstanceOf(UserError);
    expect((result as UserError).message).toContain('Invalid proxy URL');
    expect((result as UserError).name).toBe('UserError');
    expect(captured.stdout).toBe('');
    expect(captured.stderr).toBe('');
  });

  it('[characterization] proxy: flows to load() only — generated bytes identical with and without proxy', async () => {
    const specPath = join(SPECS_DIR, 'test.json');
    writeFileSync(specPath, JSON.stringify(createTestSpec(), null, 2));

    const outPlain = join(TEST_DIR, 'out-plain');
    const outProxy = join(TEST_DIR, 'out-proxy');

    const plainResult = await callImpl(
      buildContext().context,
      baseFlags({ outputDir: outPlain }),
      specPath
    );
    const proxyResult = await callImpl(
      buildContext().context,
      baseFlags({ outputDir: outProxy, proxy: 'http://127.0.0.1:9' }),
      specPath
    );

    expect(plainResult).toBeUndefined();
    expect(proxyResult).toBeUndefined();

    for (const file of ['contracts.ts', 'client.ts', 'index.ts']) {
      expect(readFileSync(join(outProxy, file))).toEqual(readFileSync(join(outPlain, file)));
    }
  });

  it('[characterization] invalid spec resolves with UserError (stricli error-as-return contract)', async () => {
    const specPath = join(SPECS_DIR, 'invalid.json');
    writeFileSync(specPath, JSON.stringify({ openapi: '3.1.0' }, null, 2));

    const { captured, context } = buildContext();
    const result = await callImpl(context, baseFlags(), specPath);

    expect(result).toBeInstanceOf(UserError);
    expect((result as UserError).message).toContain('Invalid OpenAPI specification');
    expect((result as UserError).name).toBe('UserError');
  });
});
