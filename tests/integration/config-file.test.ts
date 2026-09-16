import { spawnSync } from 'child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

import { afterAll, describe, expect, it } from 'vitest';

import { expectFilesCompile } from '../helpers/compile-check.js';
import { linkGenoc } from '../helpers/link-genoc.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CLI_ENTRY = join(REPO_ROOT, 'dist/cli/index.js');
const PETSTORE_31_FIXTURE = join(REPO_ROOT, 'tests/fixtures/petstore.yaml');
const PETSTORE_30_FIXTURE = join(REPO_ROOT, 'tests/fixtures/v3.0/petstore.yaml');

const GENERATED_FILES = ['contracts.ts', 'client.ts', 'index.ts'] as const;

const tempDirs: string[] = [];

function makeProject(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), `genocrc-e2e-${prefix}-`));
  tempDirs.push(dir);
  return dir;
}

type CliResult = { status: number | null; stdout: string; stderr: string };

/** Runs the built CLI (`dist/cli/index.js`) as a real child process — never src/. */
function runCli(args: string[], cwd: string): CliResult {
  const result = spawnSync(process.execPath, [CLI_ENTRY, ...args], {
    cwd,
    encoding: 'utf8',
  });
  if (result.error !== undefined) {
    throw new Error(`Failed to spawn CLI: ${String(result.error)}`);
  }
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function writeConfig(dir: string, content: Record<string, unknown>, name = '.genocrc.yml'): string {
  // JSON is valid YAML — keeps configs readable and quoting-free.
  const filepath = join(dir, name);
  writeFileSync(filepath, JSON.stringify(content, null, 2));
  return filepath;
}

function copyFixtureIn(dir: string, fixturePath: string, name: string): string {
  const target = join(dir, name);
  copyFileSync(fixturePath, target);
  return target;
}

function expectGeneratedFiles(dir: string): void {
  for (const file of GENERATED_FILES) {
    expect(existsSync(join(dir, file)), `${dir}/${file} should exist`).toBe(true);
  }
}

describe('Config file end-to-end (real CLI process)', () => {
  afterAll(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('dist/cli/index.js exists (build before running this suite)', () => {
    expect(existsSync(CLI_ENTRY)).toBe(true);
  });

  // Scenario 1 — flat config happy path
  it('flat .genocrc.yml with input+outputDir generates with zero arguments', () => {
    const root = makeProject('flat');
    copyFixtureIn(root, PETSTORE_31_FIXTURE, 'petstore.yaml');
    writeConfig(root, { input: './petstore.yaml', outputDir: './out' });

    const result = runCli([], root);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('✅ Success! Generated client files:');
    expect(result.stdout).toContain('Generated 1/1 clients');
    expectGeneratedFiles(join(root, 'out'));
  });

  // Scenario 1b — flat .genocrc.json happy path
  it('flat .genocrc.json with input+outputDir generates with zero arguments', () => {
    const root = makeProject('flat-json');
    copyFixtureIn(root, PETSTORE_31_FIXTURE, 'petstore.yaml');
    writeConfig(root, { input: './petstore.yaml', outputDir: './out' }, '.genocrc.json');

    const result = runCli([], root);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('✅ Success! Generated client files:');
    expect(result.stdout).toContain('Generated 1/1 clients');
    expectGeneratedFiles(join(root, 'out'));
  });

  // Scenario 2 — multi-client config, both targets, declaration order, compile check
  it('multi-client config generates both targets in declaration order and output compiles', () => {
    const root = makeProject('multi');
    copyFixtureIn(root, PETSTORE_30_FIXTURE, 'petstore-v3-0.yaml');
    copyFixtureIn(root, PETSTORE_31_FIXTURE, 'petstore-v3-1.yaml');
    writeConfig(root, {
      clients: {
        petstore30: { input: './petstore-v3-0.yaml', outputDir: './out-30' },
        petstore31: { input: './petstore-v3-1.yaml', outputDir: './out-31' },
      },
    });

    const result = runCli([], root);

    expect(result.status).toBe(0);
    // v3.0 petstore fixture legitimately triggers the nullable deprecation
    // warning on stderr — only assert no failure markers there.
    expect(result.stderr).not.toContain('× client');
    expect(result.stderr).not.toContain('targets failed');
    expect(result.stdout).toContain('Loaded OpenAPI 3.0.3 spec');
    expect(result.stdout).toContain('Loaded OpenAPI 3.1.0 spec');
    expect(result.stdout.indexOf('out-30')).toBeLessThan(result.stdout.indexOf('out-31'));
    expect(result.stdout).toContain('Generated 2/2 clients');

    const out30 = join(root, 'out-30');
    const out31 = join(root, 'out-31');
    expectGeneratedFiles(out30);
    expectGeneratedFiles(out31);

    // tsc --strict on BOTH generated outputs via the shared helper.
    linkGenoc(out30);
    linkGenoc(out31);
    expectFilesCompile(GENERATED_FILES.map((file) => join(out30, file)));
    expectFilesCompile(GENERATED_FILES.map((file) => join(out31, file)));
  });

  // Scenario 3 — --project selection
  it('--project selects only the named client', () => {
    const root = makeProject('project');
    copyFixtureIn(root, PETSTORE_31_FIXTURE, 'petstore.yaml');
    writeConfig(root, {
      clients: {
        alpha: { input: './petstore.yaml', outputDir: './out-alpha' },
        beta: { input: './petstore.yaml', outputDir: './out-beta' },
      },
    });

    const result = runCli(['--project', 'alpha'], root);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expectGeneratedFiles(join(root, 'out-alpha'));
    expect(existsSync(join(root, 'out-beta'))).toBe(false);
  });

  // Scenario 4 — invalid config: unknown key names the key path
  it('unknown config key exits 1 and stderr names the offending key path', () => {
    const root = makeProject('invalid-key');
    copyFixtureIn(root, PETSTORE_31_FIXTURE, 'petstore.yaml');
    writeConfig(root, { input: './petstore.yaml', outputDir: './out', bogusKey: 1 });

    const result = runCli([], root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Invalid genocrc configuration');
    expect(result.stderr).toContain("unknown key 'bogusKey' at configuration root");
    expect(existsSync(join(root, 'out'))).toBe(false);
  });

  // Scenario 5 — one target fails, partial writes documented
  it('failing second target exits 1, keeps first target files on disk, aggregates stderr', () => {
    const root = makeProject('partial');
    copyFixtureIn(root, PETSTORE_31_FIXTURE, 'petstore.yaml');
    writeConfig(root, {
      clients: {
        A: { input: './petstore.yaml', outputDir: './out-a' },
        B: { input: './does-not-exist.yaml', outputDir: './out-b' },
      },
    });

    const result = runCli([], root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('× client "B":');
    expect(result.stderr).toContain('1/2 targets failed');
    // Successful target A's output is fully on disk (partial write semantics).
    expectGeneratedFiles(join(root, 'out-a'));
    // The failing target never creates its output directory.
    expect(existsSync(join(root, 'out-b'))).toBe(false);
  });

  // Scenario 6 — subdir invocation: paths resolve against the CONFIG dir, not cwd
  it('invoking from a subdirectory writes outputs relative to the config dir', () => {
    const root = makeProject('subdir');
    copyFixtureIn(root, PETSTORE_31_FIXTURE, 'petstore.yaml');
    writeConfig(root, { input: './petstore.yaml', outputDir: './out' });
    const sub = join(root, 'sub');
    mkdirSync(sub);

    const result = runCli([], sub);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Generated 1/1 clients');
    expectGeneratedFiles(join(root, 'out'));
    expect(existsSync(join(sub, 'out'))).toBe(false);
  });

  // Scenario 7 — same spec, two clients: statelessness proof
  it('same spec under two clients produces byte-identical output in both dirs', () => {
    const root = makeProject('same-spec');
    copyFixtureIn(root, PETSTORE_31_FIXTURE, 'petstore.yaml');
    writeConfig(root, {
      clients: {
        first: { input: './petstore.yaml', outputDir: './out-first' },
        second: { input: './petstore.yaml', outputDir: './out-second' },
      },
    });

    const result = runCli([], root);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Generated 2/2 clients');
    expectGeneratedFiles(join(root, 'out-first'));
    expectGeneratedFiles(join(root, 'out-second'));
    for (const file of GENERATED_FILES) {
      expect(readFileSync(join(root, 'out-first', file))).toEqual(
        readFileSync(join(root, 'out-second', file))
      );
    }
  });

  // Scenario 8 — explicit --config from a directory with no discoverable config
  it('--config explicit path works from a directory with no discoverable config', () => {
    // Fresh tree guaranteed to contain no config file anywhere.
    const root = makeProject('explicit-config');
    const conf = join(root, 'conf');
    const runDir = join(root, 'run');
    mkdirSync(conf);
    mkdirSync(runDir);
    copyFixtureIn(conf, PETSTORE_31_FIXTURE, 'petstore.yaml');
    const configPath = writeConfig(
      conf,
      { input: './petstore.yaml', outputDir: './out' },
      'config.yml'
    );

    const result = runCli(['--config', configPath], runDir);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Generated 1/1 clients');
    // Relative outputDir resolves against the config file's directory (conf/), not cwd.
    expectGeneratedFiles(join(conf, 'out'));
    expect(existsSync(join(runDir, 'out'))).toBe(false);
  });

  // Scenario 9 — import-graph guard: zod/lilconfig quarantined to the CLI subtree
  it('dist/index.js contains no zod or lilconfig imports (programmatic surface stays clean)', () => {
    const bundle = readFileSync(join(REPO_ROOT, 'dist/index.js'), 'utf8');
    expect(bundle.match(/zod|lilconfig/g) ?? []).toEqual([]);
  });
});
