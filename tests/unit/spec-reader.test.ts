import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import { load, loadFromFile } from '../../src/parser/spec-reader.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, '../fixtures');

describe('spec-reader', () => {
  describe('loadFromFile', () => {
    it('loads a JSON spec from file', async () => {
      const doc = await loadFromFile(path.join(FIXTURES, 'minimal-spec.json'));
      expect(doc.openapi).toBe('3.1.0');
      expect(doc.info.title).toBe('Test API');
      expect(doc.info.version).toBe('1.0.0');
      expect(doc.paths).toEqual({});
    });

    it('loads a YAML spec from file', async () => {
      const doc = await loadFromFile(path.join(FIXTURES, 'minimal-spec.yaml'));
      expect(doc.openapi).toBe('3.1.0');
      expect(doc.info.title).toBe('Test API');
      expect(doc.info.version).toBe('1.0.0');
      expect(doc.paths).toEqual({});
    });

    it('produces identical output for JSON and YAML specs', async () => {
      const jsonDoc = await loadFromFile(path.join(FIXTURES, 'minimal-spec.json'));
      const yamlDoc = await loadFromFile(path.join(FIXTURES, 'minimal-spec.yaml'));
      expect(jsonDoc).toEqual(yamlDoc);
    });

    it('throws descriptive error for unsupported OpenAPI version', async () => {
      await expect(loadFromFile(path.join(FIXTURES, 'invalid-version.json'))).rejects.toThrow(
        'Unsupported OpenAPI version: 2.0.0. Supported versions: 3.0, 3.1, 3.2'
      );
    });

    it('throws descriptive error for non-existent file', async () => {
      await expect(loadFromFile(path.join(FIXTURES, 'does-not-exist.json'))).rejects.toThrow(
        /Failed to load spec/
      );
    });

    it('rejects unsupported file extensions', async () => {
      await expect(loadFromFile('spec.xml')).rejects.toThrow(
        'Unsupported file extension: ".xml". Supported extensions: .json, .yaml, .yml'
      );
    });

    it('rejects .txt extension', async () => {
      await expect(loadFromFile('readme.txt')).rejects.toThrow(
        'Unsupported file extension: ".txt"'
      );
    });

    it('accepts .yml extension', async () => {
      const ymlPath = path.join(FIXTURES, 'minimal-spec.yml');
      const { writeFileSync, unlinkSync, existsSync } = await import('node:fs');
      const yamlContent = await import('node:fs/promises').then((fs) =>
        fs.readFile(path.join(FIXTURES, 'minimal-spec.yaml'), 'utf-8')
      );
      writeFileSync(ymlPath, yamlContent);
      try {
        const doc = await loadFromFile(ymlPath);
        expect(doc.openapi).toBe('3.1.0');
      } finally {
        if (existsSync(ymlPath)) unlinkSync(ymlPath);
      }
    });

    it('throws parse error for invalid JSON', async () => {
      const invalidJsonPath = path.join(FIXTURES, 'invalid-parse.json');
      const { writeFileSync, unlinkSync, existsSync } = await import('node:fs');
      writeFileSync(invalidJsonPath, '{ not valid json }}}');
      try {
        await expect(loadFromFile(invalidJsonPath)).rejects.toThrow(/Failed to parse/);
      } finally {
        if (existsSync(invalidJsonPath)) unlinkSync(invalidJsonPath);
      }
    });

    it('throws parse error for invalid YAML', async () => {
      const invalidYamlPath = path.join(FIXTURES, 'invalid-parse.yaml');
      const { writeFileSync, unlinkSync, existsSync } = await import('node:fs');
      writeFileSync(invalidYamlPath, 'just a string not an object');
      try {
        await expect(loadFromFile(invalidYamlPath)).rejects.toThrow();
      } finally {
        if (existsSync(invalidYamlPath)) unlinkSync(invalidYamlPath);
      }
    });
  });

  describe('load', () => {
    it('delegates to loadFromFile for non-URL source', async () => {
      const doc = await load(path.join(FIXTURES, 'minimal-spec.json'));
      expect(doc.openapi).toBe('3.1.0');
    });
  });
});
