import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  generateClient,
  GeneratorConfig,
  ApiClient,
  ApiError,
  loadSpec,
  DefaultApiError,
  GenerationOptions,
} from '../../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, '../../tests/fixtures');

describe('Programmatic API', () => {
  const tempDir = path.join(FIXTURES, 'temp-test-output');
  const minimalSpecPath = path.join(FIXTURES, 'minimal-spec.json');
  const operationsSpecPath = path.join(FIXTURES, 'operations-spec.json');

  beforeAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('generateClient function', () => {
    it('successfully generates client with minimal spec', async () => {
      const config: GeneratorConfig = {
        input: minimalSpecPath,
        outputDir: tempDir,
      };

      await expect(generateClient(config)).resolves.not.toThrow();

      // Debug: Check what's in the temp directory
      const tempContents = await fs.readdir(tempDir);
      console.log('Temp directory contents:', tempContents);

      // Check that output files were created
      const contractsFile = path.join(tempDir, 'contracts.ts');
      const clientFile = path.join(tempDir, 'client.ts');

      // fs.access throws if file doesn't exist, so we expect it not to throw
      await expect(fs.access(contractsFile)).resolves.toBeUndefined();
      await expect(fs.access(clientFile)).resolves.toBeUndefined();
    });

    it('throws error for invalid OpenAPI specification', async () => {
      const invalidSpecPath = path.join(FIXTURES, 'invalid-version.json');
      const config: GeneratorConfig = {
        input: invalidSpecPath,
        outputDir: tempDir,
      };

      await expect(generateClient(config)).rejects.toThrow('Unsupported OpenAPI version');
    });

    it('generates client with operations spec', async () => {
      const config: GeneratorConfig = {
        input: operationsSpecPath,
        outputDir: tempDir,
        methodNameStrategy: 'path-based',
      };

      await expect(generateClient(config)).resolves.not.toThrow();

      // Check that output files contain expected content
      const clientFile = path.join(tempDir, 'client.ts');
      const clientContent = await fs.readFile(clientFile, 'utf-8');

      expect(clientContent).toContain('export function createClient');
      expect(clientContent).toContain('getApiV1Products');
      expect(clientContent).toContain('postApiV1Products');
    });

    it('throws error for invalid OpenAPI specification', async () => {
      const invalidSpecPath = path.join(FIXTURES, 'invalid-version.json');
      const config: GeneratorConfig = {
        input: invalidSpecPath,
        outputDir: tempDir,
      };

      await expect(generateClient(config)).rejects.toThrow('Unsupported OpenAPI version');
    });

    it('generates client with operations spec', async () => {
      const config: GeneratorConfig = {
        input: operationsSpecPath,
        outputDir: tempDir,
        methodNameStrategy: 'path-based',
      };

      await expect(generateClient(config)).resolves.not.toThrow();

      // Check that output files contain expected content
      const clientFile = path.join(tempDir, 'client.ts');
      const clientContent = await fs.readFile(clientFile, 'utf-8');

      expect(clientContent).toContain('export function createClient');
      expect(clientContent).toContain('getApiV1Products');
      expect(clientContent).toContain('postApiV1Products');
    });

    it('generates client with operations spec', async () => {
      const config: GeneratorConfig = {
        input: operationsSpecPath,
        outputDir: tempDir,
        methodNameStrategy: 'path-based',
      };

      await expect(generateClient(config)).resolves.not.toThrow();

      const clientFile = path.join(tempDir, 'client.ts');
      const clientContent = await fs.readFile(clientFile, 'utf-8');

      expect(clientContent).toContain('export function createClient');
      expect(clientContent).toContain('getApiV1Products');
      expect(clientContent).toContain('postApiV1Products');
    });
  });

  describe('Type exports', () => {
    it('exports GeneratorConfig type', () => {
      const config: GeneratorConfig = {
        input: minimalSpecPath,
        outputDir: tempDir,
        methodNameStrategy: 'path-based',
      };
      expect(config.input).toBe(minimalSpecPath);
      expect(config.outputDir).toBe(tempDir);
      expect(config.methodNameStrategy).toBe('path-based');
    });

    it('exports ApiClient type', () => {
      const typeCheck: ApiClient = {} as any;
      expect(typeCheck).toBeDefined();
    });

    it('exports ApiError type', () => {
      const errorType: ApiError<number, unknown> = {} as any;
      expect(typeof errorType).toBe('object');
    });

    it('exports ApiClient type', () => {
      // This test ensures the type is available at compile time
      const typeCheck: ApiClient = {} as any;
      expect(typeCheck).toBeDefined();
    });

    it('exports ApiError type', () => {
      const errorType: ApiError<number, unknown> = {} as any;
      expect(typeof errorType).toBe('object');
    });
  });

  describe('Module re-exports', () => {
    it('exports loadSpec function', async () => {
      const doc = await loadSpec(minimalSpecPath);
      expect(doc.openapi).toBe('3.1.0');
      expect(doc.info.title).toBe('Test API');
    });
  });
});
