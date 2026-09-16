import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { loadConfigFile } from '../../src/cli/config-loader.js';
import { UserError } from '../../src/cli/errors.js';

const FLAT_YML = 'input: ./specs/petstore.yaml\noutputDir: ./src/api\n';

const tmpRoots: string[] = [];

function makeTmpDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'genoc-config-loader-'));
  tmpRoots.push(dir);
  return dir;
}

function makeDir(parent: string, name: string): string {
  const dir = path.join(parent, name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeConfigFile(dir: string, name: string, content: string): string {
  const filepath = path.join(dir, name);
  writeFileSync(filepath, content, 'utf-8');
  return filepath;
}

async function expectUserError(promise: Promise<unknown>): Promise<UserError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(UserError);
    return error as UserError;
  }
  throw new Error('expected loadConfigFile to reject with a UserError, but it resolved');
}

afterEach(() => {
  for (const root of tmpRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('loadConfigFile — discovery (order, upward search, git boundary)', () => {
  it('prefers .genocrc.yml over .genocrc.json in the same directory', async () => {
    const dir = makeTmpDir();
    const ymlPath = writeConfigFile(dir, '.genocrc.yml', FLAT_YML);
    writeConfigFile(
      dir,
      '.genocrc.json',
      JSON.stringify({ input: './other.json', outputDir: './other-out' })
    );

    const result = await loadConfigFile({ searchDir: dir });

    expect(result).not.toBeNull();
    expect(result?.filepath).toBe(ymlPath);
    expect(path.isAbsolute(result?.filepath ?? '')).toBe(true);
    expect(result?.config).toEqual({
      input: path.resolve(dir, 'specs/petstore.yaml'),
      outputDir: path.resolve(dir, 'src/api'),
    });
  });

  it('finds a .genocrc.json in the search dir before walking up to a parent .genocrc.yml', async () => {
    const repo = makeTmpDir();
    mkdirSync(path.join(repo, '.git'), { recursive: true });
    writeConfigFile(repo, '.genocrc.yml', FLAT_YML);
    const sub = makeDir(repo, 'sub');
    const jsonPath = writeConfigFile(
      sub,
      '.genocrc.json',
      JSON.stringify({
        clients: {
          petstore: { input: './specs/petstore.yaml', outputDir: './src/petstore' },
        },
      })
    );

    const result = await loadConfigFile({ searchDir: sub });

    expect(result?.filepath).toBe(jsonPath);
    expect(result?.config).toEqual({
      clients: {
        petstore: {
          input: path.resolve(sub, 'specs/petstore.yaml'),
          outputDir: path.resolve(sub, 'src/petstore'),
        },
      },
    });
  });

  it('walks up to the git root and finds the config there (stopDir is inclusive)', async () => {
    const repo = makeTmpDir();
    mkdirSync(path.join(repo, '.git'), { recursive: true });
    const ymlPath = writeConfigFile(repo, '.genocrc.yml', FLAT_YML);
    const deep = makeDir(makeDir(repo, 'sub'), 'deep');

    const result = await loadConfigFile({ searchDir: deep });

    expect(result?.filepath).toBe(ymlPath);
  });

  it('does not search above the git boundary (config above the git root is not found)', async () => {
    const tree = makeTmpDir();
    // Above the git root: reachable only if the upward search ignores the boundary.
    writeConfigFile(tree, '.genocrc.yml', FLAT_YML);
    const repo = makeDir(tree, 'repo');
    mkdirSync(path.join(repo, '.git'), { recursive: true });
    const sub = makeDir(repo, 'sub');

    const result = await loadConfigFile({ searchDir: sub });

    expect(result).toBeNull();
  });

  it('ignores .genocrc.yaml (unsupported)', async () => {
    const dir = makeTmpDir();
    writeConfigFile(dir, '.genocrc.yaml', FLAT_YML);

    expect(await loadConfigFile({ searchDir: dir })).toBeNull();
  });

  it('genoc.config.json is not discovered', async () => {
    const dir = makeTmpDir();
    writeConfigFile(
      dir,
      'genoc.config.json',
      JSON.stringify({ input: './other.json', outputDir: './other-out' })
    );

    expect(await loadConfigFile({ searchDir: dir })).toBeNull();
  });

  it('returns null when no config file exists anywhere up to the git boundary', async () => {
    const repo = makeTmpDir();
    mkdirSync(path.join(repo, '.git'), { recursive: true });
    const sub = makeDir(repo, 'sub');

    expect(await loadConfigFile({ searchDir: sub })).toBeNull();
  });

  it('keeps walking up when there is no git repository (fs-root fallback)', async () => {
    const tree = makeTmpDir();
    const ymlPath = writeConfigFile(tree, '.genocrc.yml', FLAT_YML);
    const deep = makeDir(makeDir(tree, 'a'), 'b');

    const result = await loadConfigFile({ searchDir: deep });

    expect(result?.filepath).toBe(ymlPath);
  });

  it('defaults searchDir to process.cwd()', async () => {
    const dir = makeTmpDir();
    const ymlPath = writeConfigFile(dir, '.genocrc.yml', FLAT_YML);
    const previousCwd = process.cwd();
    process.chdir(dir);
    try {
      const result = await loadConfigFile();
      expect(result?.filepath).toBe(ymlPath);
    } finally {
      process.chdir(previousCwd);
    }
  });
});

describe('loadConfigFile — explicit path (--config)', () => {
  it('rejects a nonexistent path with a UserError', async () => {
    const dir = makeTmpDir();
    const missing = path.join(dir, 'missing.yml');

    const err = await expectUserError(loadConfigFile({ explicitPath: missing }));

    expect(err.message).toContain('not found');
    expect(err.message).toContain(missing);
  });

  it('rejects a directory path with a UserError', async () => {
    const dir = makeTmpDir();

    const err = await expectUserError(loadConfigFile({ explicitPath: dir }));

    expect(err.message).toContain('directory');
    expect(err.message).toContain(dir);
  });

  it('rejects an unsupported .toml extension listing supported extensions', async () => {
    const dir = makeTmpDir();
    const tomlPath = writeConfigFile(dir, 'config.toml', 'input = "./spec.yml"\n');

    const err = await expectUserError(loadConfigFile({ explicitPath: tomlPath }));

    expect(err.message).toContain('.toml');
    expect(err.message).toContain('.yml');
    expect(err.message).toContain('.json');
  });

  it('rejects an unsupported .js extension listing supported extensions', async () => {
    const dir = makeTmpDir();
    const jsPath = writeConfigFile(dir, '.genocrc.js', 'export default {};\n');

    const err = await expectUserError(loadConfigFile({ explicitPath: jsPath }));

    expect(err.message).toContain('.js');
    expect(err.message).toContain('.yml');
    expect(err.message).toContain('.json');
  });

  it('rejects a .yaml extension (only .yml is supported)', async () => {
    const dir = makeTmpDir();
    const yamlPath = writeConfigFile(dir, '.genocrc.yaml', FLAT_YML);

    const err = await expectUserError(loadConfigFile({ explicitPath: yamlPath }));

    expect(err.message).toContain('.yaml');
    expect(err.message).toContain('Supported extensions');
  });

  it('loads a valid .yml file and skips discovery', async () => {
    const dir = makeTmpDir();
    // Would win discovery if it ran; the explicit path must take precedence.
    writeConfigFile(dir, '.genocrc.yml', FLAT_YML);
    const other = makeDir(dir, 'other');
    const explicit = writeConfigFile(
      other,
      'custom-name.yml',
      'input: ./explicit-spec.yaml\noutputDir: ./explicit-out\n'
    );

    const result = await loadConfigFile({ explicitPath: explicit, searchDir: dir });

    expect(result?.filepath).toBe(explicit);
    expect(result?.config).toEqual({
      input: path.resolve(other, 'explicit-spec.yaml'),
      outputDir: path.resolve(other, 'explicit-out'),
    });
  });

  it('loads a valid .json file', async () => {
    const dir = makeTmpDir();
    const jsonPath = writeConfigFile(
      dir,
      'custom.json',
      JSON.stringify({ input: './a.yaml', outputDir: './out' })
    );

    const result = await loadConfigFile({ explicitPath: jsonPath });

    expect(result?.filepath).toBe(jsonPath);
    expect(result?.config).toEqual({
      input: path.resolve(dir, 'a.yaml'),
      outputDir: path.resolve(dir, 'out'),
    });
  });

  it('--config accepts a file named genoc.config.json (explicit paths are name-agnostic)', async () => {
    const dir = makeTmpDir();
    const jsonPath = writeConfigFile(
      dir,
      'genoc.config.json',
      JSON.stringify({ input: './a.yaml', outputDir: './out' })
    );

    const result = await loadConfigFile({ explicitPath: jsonPath });

    expect(result?.filepath).toBe(jsonPath);
    expect(result?.config).toEqual({
      input: path.resolve(dir, 'a.yaml'),
      outputDir: path.resolve(dir, 'out'),
    });
  });

  it('resolves a relative explicit path against process.cwd()', async () => {
    const dir = makeTmpDir();
    const ymlPath = writeConfigFile(dir, '.genocrc.yml', FLAT_YML);
    const previousCwd = process.cwd();
    process.chdir(dir);
    try {
      const result = await loadConfigFile({ explicitPath: '.genocrc.yml' });
      expect(result?.filepath).toBe(ymlPath);
    } finally {
      process.chdir(previousCwd);
    }
  });
});

describe('loadConfigFile — parse errors', () => {
  it('maps a malformed YAML document to a UserError with the file path and line number', async () => {
    const dir = makeTmpDir();
    // Tab-indented line 3 — YAML refuses tabs as indentation.
    const ymlPath = writeConfigFile(
      dir,
      '.genocrc.yml',
      'input: ./spec.yml\noutputDir:\n\t./src/api\n'
    );

    const err = await expectUserError(loadConfigFile({ searchDir: dir }));

    expect(err.message).toContain(ymlPath);
    expect(err.message).toMatch(/line 3/);
  });

  it('rejects multi-document YAML with a UserError', async () => {
    const dir = makeTmpDir();
    const ymlPath = writeConfigFile(dir, '.genocrc.yml', 'input: ./a.yml\n---\noutputDir: ./out\n');

    const err = await expectUserError(loadConfigFile({ searchDir: dir }));

    expect(err.message).toContain(ymlPath);
    expect(err.message).toMatch(/multiple documents/i);
  });

  it('rejects an empty discovered config file', async () => {
    const dir = makeTmpDir();
    const ymlPath = writeConfigFile(dir, '.genocrc.yml', '');

    const err = await expectUserError(loadConfigFile({ searchDir: dir }));

    expect(err.message).toContain('empty');
    expect(err.message).toContain(ymlPath);
  });

  it('rejects a YAML document that parses to null', async () => {
    const dir = makeTmpDir();
    writeConfigFile(dir, '.genocrc.yml', 'null\n');

    const err = await expectUserError(loadConfigFile({ searchDir: dir }));

    expect(err.message).toContain('empty');
  });

  it('rejects an empty file given via explicit path', async () => {
    const dir = makeTmpDir();
    const jsonPath = writeConfigFile(dir, 'empty.json', '');

    const err = await expectUserError(loadConfigFile({ explicitPath: jsonPath }));

    expect(err.message).toContain('empty');
    expect(err.message).toContain(jsonPath);
  });

  it('rejects an empty object config via parseConfig ("no configuration keys")', async () => {
    const dir = makeTmpDir();
    writeConfigFile(dir, '.genocrc.yml', '{}\n');

    const err = await expectUserError(loadConfigFile({ searchDir: dir }));

    expect(err.message).toMatch(/no configuration keys/i);
  });

  it('rejects an invalid JSON config file with a UserError', async () => {
    const dir = makeTmpDir();
    const jsonPath = writeConfigFile(dir, '.genocrc.json', '{ not json');

    const err = await expectUserError(loadConfigFile({ searchDir: dir }));

    expect(err.message).toContain(jsonPath);
  });
});

describe('loadConfigFile — validation and path resolution', () => {
  it('validates the loaded document through parseConfig (unknown key)', async () => {
    const dir = makeTmpDir();
    writeConfigFile(dir, '.genocrc.yml', 'output-dir: ./src/api\n');

    const err = await expectUserError(loadConfigFile({ searchDir: dir }));

    expect(err.message).toContain("unknown key 'output-dir'");
    expect(err.message).toContain('allowed keys');
  });

  it('resolves relative flat input/outputDir against the config file directory', async () => {
    const dir = makeTmpDir();
    const ymlPath = writeConfigFile(dir, '.genocrc.yml', FLAT_YML);

    const result = await loadConfigFile({ searchDir: dir });

    expect(result?.filepath).toBe(ymlPath);
    expect(result?.config).toEqual({
      input: path.resolve(dir, 'specs/petstore.yaml'),
      outputDir: path.resolve(dir, 'src/api'),
    });
  });

  it('leaves URL inputs untouched', async () => {
    const dir = makeTmpDir();
    writeConfigFile(
      dir,
      '.genocrc.yml',
      'input: https://api.example.com/openapi.json\noutputDir: ./out\n'
    );

    const result = await loadConfigFile({ searchDir: dir });

    const config = result?.config as { input?: string; outputDir?: string };
    expect(config.input).toBe('https://api.example.com/openapi.json');
    expect(config.outputDir).toBe(path.resolve(dir, 'out'));
  });

  it('leaves absolute paths untouched', async () => {
    const dir = makeTmpDir();
    writeConfigFile(
      dir,
      '.genocrc.json',
      JSON.stringify({ input: '/abs/spec.json', outputDir: '/abs/out' })
    );

    const result = await loadConfigFile({ searchDir: dir });

    expect(result?.config).toEqual({ input: '/abs/spec.json', outputDir: '/abs/out' });
  });

  it('rejects duplicate outputDirs that only collide after path resolution', async () => {
    const dir = makeTmpDir();
    // './src/a' and 'a/../src/a' are raw-distinct (schema check passes) but
    // resolve to the same absolute directory — the loader must reject this.
    writeConfigFile(
      dir,
      '.genocrc.json',
      JSON.stringify({
        clients: {
          a: { input: './a.yaml', outputDir: './src/a' },
          b: { input: './b.yaml', outputDir: 'a/../src/a' },
        },
      })
    );

    const err = await expectUserError(loadConfigFile({ searchDir: dir }));

    expect(err.message).toContain(path.resolve(dir, 'src/a'));
    expect(err.message).toContain("'a'");
    expect(err.message).toContain("'b'");
  });

  it('accepts distinct resolved outputDirs across clients', async () => {
    const dir = makeTmpDir();
    writeConfigFile(
      dir,
      '.genocrc.json',
      JSON.stringify({
        clients: {
          petstore: { input: './petstore.yaml', outputDir: './src/petstore' },
          billing: { input: 'https://x/y.json', outputDir: './src/billing' },
        },
      })
    );

    const result = await loadConfigFile({ searchDir: dir });

    expect(result?.config).toEqual({
      clients: {
        petstore: {
          input: path.resolve(dir, 'petstore.yaml'),
          outputDir: path.resolve(dir, 'src/petstore'),
        },
        billing: { input: 'https://x/y.json', outputDir: path.resolve(dir, 'src/billing') },
      },
    });
  });
});
