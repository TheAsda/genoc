import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'fs';
import { join } from 'path';

import { run } from '@stricli/core';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { app } from '../../src/cli/app.js';

const TEST_DIR = join(process.cwd(), 'tmp-test');
const OUTPUT_DIR = join(TEST_DIR, 'output');
const SPECS_DIR = join(TEST_DIR, 'specs');

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

describe('CLI Entry Point', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(SPECS_DIR, { recursive: true });
    mkdirSync(OUTPUT_DIR, { recursive: true });
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

  it('shows version when --version flag is used', async () => {
    const { captured, context } = buildContext();
    await run(app, ['--version'], context);
    expect(captured.stdout).toMatchSnapshot();
  });

  it('errors when spec positional is missing', async () => {
    const { captured, context } = buildContext();
    await run(app, ['--output-dir', OUTPUT_DIR], context);
    expect(captured.stderr).toMatchSnapshot();
    expect(context.process.exitCode).not.toBe(0);
  });

  it('errors when --output-dir is missing', async () => {
    const { captured, context } = buildContext();
    const specPath = join(SPECS_DIR, 'test.json');
    writeFileSync(specPath, JSON.stringify(createTestSpec(), null, 2));
    await run(app, [specPath], context);
    expect(captured.stderr).toMatchSnapshot();
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
    expect(captured.stderr).toMatchSnapshot();
    expect(context.process.exitCode).not.toBe(0);
  });

  it('generates files from JSON spec', async () => {
    const spec = createTestSpec();
    const specPath = join(SPECS_DIR, 'test.json');
    writeFileSync(specPath, JSON.stringify(spec, null, 2));

    const { captured, context } = buildContext();
    await run(app, [specPath, '--output-dir', OUTPUT_DIR], context);

    expect(captured.stdout).toMatchSnapshot();
    expect(existsSync(join(OUTPUT_DIR, 'contracts.ts'))).toBe(true);
    expect(existsSync(join(OUTPUT_DIR, 'client.ts'))).toBe(true);
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

    expect(captured.stdout).toMatchSnapshot();
    expect(existsSync(join(OUTPUT_DIR, 'contracts.ts'))).toBe(true);
    expect(existsSync(join(OUTPUT_DIR, 'client.ts'))).toBe(true);

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

    expect(captured.stdout).toMatchSnapshot();
    expect(existsSync(join(OUTPUT_DIR, 'contracts.ts'))).toBe(true);
    expect(existsSync(join(OUTPUT_DIR, 'client.ts'))).toBe(true);

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

    expect(captured.stderr).toMatchSnapshot();
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

    expect(captured.stderr).toMatchSnapshot();
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
  });
});
