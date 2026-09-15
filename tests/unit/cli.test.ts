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
import impl, { targetNameFromInput } from '../../src/cli/impl.js';

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
        // Discovery start directory for config file lookup (read by impl).
        cwd: () => TEST_DIR,
      },
    },
  };
}

type ImplFn = (this: unknown, flags: AppFlags, spec: string | undefined) => Promise<void | Error>;

/**
 * Invoke the impl command function directly, bypassing stricli argument parsing.
 * Returns whatever impl resolves with (undefined on success, Error on failure) —
 * the stricli error-as-return contract.
 */
function callImpl(
  context: ReturnType<typeof buildContext>['context'],
  flags: AppFlags,
  spec: string | undefined
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

/** Write a config file (JSON content is valid YAML) into the test tree. */
function writeConfigFile(
  content: Record<string, unknown>,
  filepath = join(TEST_DIR, '.genocrc.yml')
): string {
  writeFileSync(filepath, JSON.stringify(content, null, 2));
  return filepath;
}

function writeSpecFile(name = 'test.json', spec = createTestSpec()): string {
  const specPath = join(SPECS_DIR, name);
  writeFileSync(specPath, JSON.stringify(spec, null, 2));
  return specPath;
}

/** Spec whose single GET /test operation carries the given operationId. */
function createOperationIdSpec(operationId: string) {
  return createTestSpec({
    paths: {
      '/test': {
        get: {
          operationId,
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
  });
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
    expect(captured.stdout).toContain('--config');
    expect(captured.stdout).toContain('--project');
    expect(captured.stdout).toMatchSnapshot();
  });

  it('errors when spec positional, --output-dir, and config file are all missing', async () => {
    const { captured, context } = buildContext();
    await run(app, [], context);
    expect(normalizePaths(captured.stderr)).toContain('spec');
    expect(normalizePaths(captured.stderr)).toContain('--output-dir');
    expect(normalizePaths(captured.stderr)).toContain('config');
    expect(context.process.exitCode).not.toBe(0);
  });

  it('errors when --output-dir given but no spec input and no config input exist', async () => {
    const { captured, context } = buildContext();
    await run(app, ['--output-dir', OUTPUT_DIR], context);
    expect(normalizePaths(captured.stderr)).toContain('No spec input provided');
    expect(context.process.exitCode).not.toBe(0);
  });

  it('errors when --output-dir is missing with no config to supply it', async () => {
    const specPath = writeSpecFile();
    const { captured, context } = buildContext();
    await run(app, [specPath], context);
    expect(normalizePaths(captured.stderr)).toContain('No output directory provided');
    expect(normalizePaths(captured.stderr)).toContain('--output-dir');
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

  describe('config file wiring', () => {
    it('config-only: flat config with input+outputDir generates with zero args', async () => {
      const specPath = copyFixture('petstore.yaml');
      writeConfigFile({ input: specPath, outputDir: './out' });

      const { captured, context } = buildContext();
      await run(app, [], context);

      expect(captured.stderr).toBe('');
      expect(captured.stdout).toContain('✅ Success! Generated client files:');
      expect(existsSync(join(TEST_DIR, 'out', 'contracts.ts'))).toBe(true);
      expect(existsSync(join(TEST_DIR, 'out', 'client.ts'))).toBe(true);
      expect(existsSync(join(TEST_DIR, 'out', 'index.ts'))).toBe(true);
    });

    it('config-only: flat config supplies input, --output-dir overrides outputDir', async () => {
      const specPath = copyFixture('petstore.yaml');
      writeConfigFile({ input: specPath, outputDir: './out-from-config' });

      const { captured, context } = buildContext();
      await run(app, ['--output-dir', OUTPUT_DIR], context);

      expect(captured.stderr).toBe('');
      expect(existsSync(join(OUTPUT_DIR, 'client.ts'))).toBe(true);
      expect(existsSync(join(TEST_DIR, 'out-from-config'))).toBe(false);
    });

    it('positional spec supplies input; config supplies outputDir', async () => {
      const specPath = writeSpecFile();
      writeConfigFile({ outputDir: './out-from-config' });

      const { captured, context } = buildContext();
      await run(app, [specPath], context);

      expect(captured.stderr).toBe('');
      expect(existsSync(join(TEST_DIR, 'out-from-config', 'contracts.ts'))).toBe(true);
    });

    it('positional spec overrides config input (CLI > file)', async () => {
      const specPath = writeSpecFile();
      writeConfigFile({ input: join(TEST_DIR, 'nonexistent.yaml'), outputDir: './out' });

      const { captured, context } = buildContext();
      const result = await callImpl(context, baseFlags({ outputDir: OUTPUT_DIR }), specPath);

      expect(result).toBeUndefined();
      expect(captured.stderr).toBe('');
      expect(existsSync(join(OUTPUT_DIR, 'client.ts'))).toBe(true);
    });

    it('explicit --output-dir overrides config outputDir (CLI > file)', async () => {
      const specPath = writeSpecFile();
      writeConfigFile({ input: specPath, outputDir: './out-from-config' });

      const { captured, context } = buildContext();
      await run(app, [specPath, '--output-dir', OUTPUT_DIR], context);

      expect(captured.stderr).toBe('');
      expect(existsSync(join(OUTPUT_DIR, 'client.ts'))).toBe(true);
      expect(existsSync(join(TEST_DIR, 'out-from-config'))).toBe(false);
    });

    it('tri-state: file strictVersion=false wins when --strict-version is absent (no warning)', async () => {
      const specPath = writeSpecFile();
      writeConfigFile({ input: specPath, outputDir: './out', strictVersion: false });

      const { captured, context } = buildContext();
      await run(app, ['--spec-version', '3.0'], context);

      expect(captured.stderr).not.toContain('Warning: Specified version');
      expect(captured.stderr).toContain('Invalid OpenAPI specification');
      expect(context.process.exitCode).not.toBe(0);
    });

    it('tri-state: explicit --strict-version=true overrides file strictVersion=false (warning returns)', async () => {
      const specPath = writeSpecFile();
      writeConfigFile({ input: specPath, outputDir: './out', strictVersion: false });

      const { captured, context } = buildContext();
      await run(app, ['--spec-version', '3.0', '--strict-version=true'], context);

      expect(captured.stderr).toContain(
        'Warning: Specified version 3.0 does not match detected version 3.1'
      );
      expect(captured.stderr).toContain('Invalid OpenAPI specification');
    });

    it('tri-state: file specVersion flows to version strategy (mismatch warning from file value)', async () => {
      const specPath = writeSpecFile();
      writeConfigFile({ input: specPath, outputDir: './out', specVersion: '3.0' });

      const { captured, context } = buildContext();
      await run(app, [], context);

      expect(captured.stderr).toContain(
        'Warning: Specified version 3.0 does not match detected version 3.1'
      );
    });

    it('tri-state: explicit non-default flag beats file methodNameStrategy (CLI > file)', async () => {
      const specPath = writeSpecFile('op-spec.json', createOperationIdSpec('customListOp'));
      writeConfigFile({ input: specPath, outputDir: './out', methodNameStrategy: 'path-based' });

      const { captured, context } = buildContext();
      await run(app, ['--method-name-strategy=operationId'], context);

      expect(captured.stderr).toBe('');
      const clientFile = readFileSync(join(TEST_DIR, 'out', 'client.ts'), 'utf-8');
      expect(clientFile).toContain('customListOp');
    });

    it('tri-state limitation: explicit flag value equal to declared default is indistinguishable — file wins', async () => {
      const specPath = writeSpecFile('op-spec.json', createOperationIdSpec('customListOp'));
      writeConfigFile({ input: specPath, outputDir: './out', methodNameStrategy: 'operationId' });

      const { captured, context } = buildContext();
      await run(app, ['--method-name-strategy', 'path-based'], context);

      expect(captured.stderr).toBe('');
      const clientFile = readFileSync(join(TEST_DIR, 'out', 'client.ts'), 'utf-8');
      expect(clientFile).toContain('customListOp');
    });

    it('flat config with only methodNameStrategy falls back to positional spec + --output-dir', async () => {
      const specPath = writeSpecFile('op-spec.json', createOperationIdSpec('customListOp'));
      writeConfigFile({ methodNameStrategy: 'operationId' });

      const { captured, context } = buildContext();
      await run(app, [specPath, '--output-dir', OUTPUT_DIR], context);

      expect(captured.stderr).toBe('');
      const clientFile = readFileSync(join(OUTPUT_DIR, 'client.ts'), 'utf-8');
      expect(clientFile).toContain('customListOp');
    });

    it('conflict: spec positional + clients config → error mentioning --project', async () => {
      const specPath = writeSpecFile();
      writeConfigFile({
        clients: { petstore: { input: specPath, outputDir: './out-petstore' } },
      });

      const { captured, context } = buildContext();
      await run(app, [specPath, '--output-dir', OUTPUT_DIR], context);

      expect(normalizePaths(captured.stderr)).toContain('defines named clients');
      expect(normalizePaths(captured.stderr)).toContain('--project');
      expect(context.process.exitCode).not.toBe(0);
    });

    it('conflict: run-all clients + explicit --output-dir → clobber guard error', async () => {
      const specPath = writeSpecFile();
      writeConfigFile({
        clients: {
          petstore: { input: specPath, outputDir: './out-petstore' },
          billing: { input: specPath, outputDir: './out-billing' },
        },
      });

      const { captured, context } = buildContext();
      await run(app, ['--output-dir', OUTPUT_DIR], context);

      expect(normalizePaths(captured.stderr)).toContain('all clients');
      expect(normalizePaths(captured.stderr)).toContain('--project');
      expect(context.process.exitCode).not.toBe(0);
    });

    it('conflict: unknown --project name lists available client names', async () => {
      const specPath = writeSpecFile();
      writeConfigFile({
        clients: {
          petstore: { input: specPath, outputDir: './out-petstore' },
          billing: { input: specPath, outputDir: './out-billing' },
        },
      });

      const { captured, context } = buildContext();
      await run(app, ['--project', 'nope'], context);

      expect(normalizePaths(captured.stderr)).toContain('Unknown client name "nope"');
      expect(normalizePaths(captured.stderr)).toContain('petstore');
      expect(normalizePaths(captured.stderr)).toContain('billing');
      expect(context.process.exitCode).not.toBe(0);
    });

    it('conflict: --project with flat config → "defines no clients"', async () => {
      const specPath = writeSpecFile();
      writeConfigFile({ input: specPath, outputDir: './out' });

      const { captured, context } = buildContext();
      await run(app, ['--project', 'petstore'], context);

      expect(normalizePaths(captured.stderr)).toContain('defines no clients');
      expect(context.process.exitCode).not.toBe(0);
    });

    it('conflict: --project with no config file found', async () => {
      const { captured, context } = buildContext();
      await run(app, ['--project', 'petstore'], context);

      expect(normalizePaths(captured.stderr)).toContain('--project');
      expect(normalizePaths(captured.stderr)).toContain('config');
      expect(context.process.exitCode).not.toBe(0);
    });

    it('multi-client: runs all targets in declaration order with summary line', async () => {
      const petstoreSpec = writeSpecFile('petstore.json');
      const billingSpec = writeSpecFile('billing.json', createOperationIdSpec('listBilling'));
      writeConfigFile({
        clients: {
          petstore: { input: petstoreSpec, outputDir: './out-petstore' },
          billing: { input: billingSpec, outputDir: './out-billing' },
        },
      });

      const { captured, context } = buildContext();
      await run(app, [], context);

      expect(captured.stderr).toBe('');
      expect(existsSync(join(TEST_DIR, 'out-petstore', 'client.ts'))).toBe(true);
      expect(existsSync(join(TEST_DIR, 'out-billing', 'client.ts'))).toBe(true);
      expect(captured.stdout.indexOf(petstoreSpec)).toBeLessThan(
        captured.stdout.indexOf(billingSpec)
      );
      expect(captured.stdout).toContain('Generated 2/2 clients');
      expect(normalizePaths(captured.stdout)).toMatchSnapshot();
    });

    it('multi-client: partial failure continues loop and aggregates errors', async () => {
      const petstoreSpec = copyFixture('petstore.yaml');
      writeConfigFile({
        clients: {
          petstore: { input: petstoreSpec, outputDir: './out-petstore' },
          billing: { input: join(TEST_DIR, 'nonexistent.yaml'), outputDir: './out-billing' },
        },
      });

      const { captured, context } = buildContext();
      await run(app, [], context);

      expect(existsSync(join(TEST_DIR, 'out-petstore', 'contracts.ts'))).toBe(true);
      expect(existsSync(join(TEST_DIR, 'out-petstore', 'client.ts'))).toBe(true);
      expect(existsSync(join(TEST_DIR, 'out-petstore', 'index.ts'))).toBe(true);
      expect(normalizePaths(captured.stderr)).toContain('× client "billing":');
      expect(normalizePaths(captured.stderr)).toContain('1/2 targets failed');
      expect(context.process.exitCode).not.toBe(0);
    });

    it('multi-client: all targets failing reports every client', async () => {
      writeConfigFile({
        clients: {
          petstore: { input: join(TEST_DIR, 'missing-a.yaml'), outputDir: './out-petstore' },
          billing: { input: join(TEST_DIR, 'missing-b.yaml'), outputDir: './out-billing' },
        },
      });

      const { captured, context } = buildContext();
      await run(app, [], context);

      expect(normalizePaths(captured.stderr)).toContain('× client "petstore":');
      expect(normalizePaths(captured.stderr)).toContain('× client "billing":');
      expect(normalizePaths(captured.stderr)).toContain('2/2 targets failed');
    });

    it('multi-client: explicit strategy flags apply to ALL targets', async () => {
      const specA = writeSpecFile('spec-a.json', createOperationIdSpec('opA'));
      const specB = writeSpecFile('spec-b.json', createOperationIdSpec('opB'));
      writeConfigFile({
        clients: {
          petstore: { input: specA, outputDir: './out-petstore', methodNameStrategy: 'path-based' },
          billing: { input: specB, outputDir: './out-billing' },
        },
      });

      const { captured, context } = buildContext();
      await run(app, ['--method-name-strategy=operationId'], context);

      expect(captured.stderr).toBe('');
      expect(readFileSync(join(TEST_DIR, 'out-petstore', 'client.ts'), 'utf-8')).toContain('opA');
      expect(readFileSync(join(TEST_DIR, 'out-billing', 'client.ts'), 'utf-8')).toContain('opB');
    });

    it('config-driven single-target failure uses aggregated format with filename-derived name', async () => {
      const brokenSpec = writeSpecFile('broken.json', { openapi: '3.1.0' });
      writeConfigFile({ input: brokenSpec, outputDir: './out' });

      const { captured, context } = buildContext();
      await run(app, [], context);

      expect(normalizePaths(captured.stderr)).toContain('× client "broken":');
      expect(normalizePaths(captured.stderr)).toContain('1/1 targets failed');
      expect(normalizePaths(captured.stderr)).toContain('Invalid OpenAPI specification');
    });

    it('--project selects only the named client (petstore)', async () => {
      const petstoreSpec = copyFixture('petstore.yaml');
      const billingSpec = writeSpecFile('billing.json');
      writeConfigFile({
        clients: {
          petstore: { input: petstoreSpec, outputDir: './out-petstore' },
          billing: { input: billingSpec, outputDir: './out-billing' },
        },
      });

      const { captured, context } = buildContext();
      await run(app, ['--project', 'petstore'], context);

      expect(captured.stderr).toBe('');
      expect(existsSync(join(TEST_DIR, 'out-petstore', 'client.ts'))).toBe(true);
      expect(existsSync(join(TEST_DIR, 'out-billing'))).toBe(false);
    });

    it('--project selects only the named client (billing)', async () => {
      const petstoreSpec = copyFixture('petstore.yaml');
      const billingSpec = writeSpecFile('billing.json');
      writeConfigFile({
        clients: {
          petstore: { input: petstoreSpec, outputDir: './out-petstore' },
          billing: { input: billingSpec, outputDir: './out-billing' },
        },
      });

      const { captured, context } = buildContext();
      await run(app, ['--project', 'billing'], context);

      expect(captured.stderr).toBe('');
      expect(existsSync(join(TEST_DIR, 'out-billing', 'client.ts'))).toBe(true);
      expect(existsSync(join(TEST_DIR, 'out-petstore'))).toBe(false);
    });

    it('--project + --output-dir overrides the client outputDir (allowed)', async () => {
      const petstoreSpec = copyFixture('petstore.yaml');
      writeConfigFile({
        clients: {
          petstore: { input: petstoreSpec, outputDir: './out-petstore' },
          billing: { input: petstoreSpec, outputDir: './out-billing' },
        },
      });

      const { captured, context } = buildContext();
      await run(app, ['--project', 'petstore', '--output-dir', OUTPUT_DIR], context);

      expect(captured.stderr).toBe('');
      expect(existsSync(join(OUTPUT_DIR, 'client.ts'))).toBe(true);
      expect(existsSync(join(TEST_DIR, 'out-petstore'))).toBe(false);
    });

    it('--config explicit path loads config outside the discovery directory', async () => {
      const specPath = copyFixture('petstore.yaml');
      mkdirSync(join(TEST_DIR, 'conf'), { recursive: true });
      const configPath = writeConfigFile(
        { input: specPath, outputDir: './out' },
        join(TEST_DIR, 'conf', 'config.yml')
      );

      const { captured, context } = buildContext();
      await run(app, ['--config', configPath], context);

      expect(captured.stderr).toBe('');
      // Relative outputDir resolves against the config file's directory (conf/), not cwd.
      expect(existsSync(join(TEST_DIR, 'conf', 'out', 'client.ts'))).toBe(true);
    });

    it('--config nonexistent path surfaces loader UserError', async () => {
      const { captured, context } = buildContext();
      await run(
        app,
        ['--config', join(TEST_DIR, 'missing.yml'), '--output-dir', OUTPUT_DIR],
        context
      );

      expect(normalizePaths(captured.stderr)).toContain('Config file not found');
      expect(context.process.exitCode).not.toBe(0);
    });

    it('invalid config content surfaces schema UserError during wiring', async () => {
      const specPath = writeSpecFile();
      writeConfigFile({ outputDir: './x', bogusKey: 1 });

      const { captured, context } = buildContext();
      await run(app, [specPath, '--output-dir', OUTPUT_DIR], context);

      expect(normalizePaths(captured.stderr)).toContain('Invalid genocrc configuration');
      expect(context.process.exitCode).not.toBe(0);
    });

    it('targetNameFromInput derives display names from spec filename base', () => {
      expect(targetNameFromInput('petstore.yaml')).toBe('petstore');
      expect([
        targetNameFromInput('petstore.yaml'),
        targetNameFromInput('/abs/path/spec.json'),
        targetNameFromInput('https://api.example.com/openapi.json?raw=true'),
        targetNameFromInput('no-extension'),
        targetNameFromInput('C:\\specs\\api.yaml'),
      ]).toMatchSnapshot();
    });
  });
});
