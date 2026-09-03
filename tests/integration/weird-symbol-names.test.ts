import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { describe, it, expect, beforeAll } from 'vitest';

import { generateClient } from '../../src/generator/client-generator.js';
import { loadFromFile } from '../../src/parser/spec-reader.js';
import type { GeneratorConfig } from '../../src/types/client.js';
import { linkGenoc } from '../helpers/link-genoc.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, '../fixtures/weird-symbol-names.json');

const TSC_FLAGS = [
  '--strict',
  '--noEmit',
  '--esModuleInterop',
  '--module',
  'NodeNext',
  '--moduleResolution',
  'NodeNext',
  '--target',
  'ES2022',
  '--skipLibCheck',
].join(' ');

describe('Weird symbol names integration', () => {
  let contracts: string;
  let client: string;

  beforeAll(async () => {
    const doc = await loadFromFile(FIXTURE_PATH);
    const config: GeneratorConfig = {
      input: FIXTURE_PATH,
      outputDir: '/tmp/weird-symbols-test',
    };
    const result = generateClient(doc, config);
    contracts = result.contracts;
    client = result.client;
  });

  it('folds weird symbols in schema names into valid identifiers', () => {
    expect(contracts).toContain('export type UserDto =');
    expect(contracts).toContain('export type UserProfile =');
    expect(contracts).toContain('export type PaymentInput =');
    expect(contracts).toContain('export type _2FACode =');
    expect(contracts).toContain('export type _class =');
    expect(contracts).toContain('export type WeIrd =');
  });

  it('renames the second schema whose sanitized name collides', () => {
    expect(contracts).toContain('export type UserDtoModel =');
    expect(contracts.match(/export type UserDto =/g)).toHaveLength(1);
  });

  it('produces valid TypeScript identifiers for every exported type', () => {
    const typeExportPattern = /export type (\S+?) =/g;
    const identifierPattern = /^[$A-Za-z_][$A-Za-z0-9_]*$/;
    let match: RegExpExecArray | null;
    while ((match = typeExportPattern.exec(contracts)) !== null) {
      expect(identifierPattern.test(match[1])).toBe(true);
    }
  });

  it('sanitizes weird symbols in route-derived method names', () => {
    expect(client).toContain('getApiV12UserSettingsByIdListAll');
    expect(client).toContain('postPaymentInput');
  });

  it('contracts compile with tsc --strict --noEmit', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'weird-contracts-'));
    linkGenoc(tmpDir);
    const contractsFile = join(tmpDir, 'contracts.ts');
    writeFileSync(contractsFile, contracts, 'utf-8');

    const result = execSync(`npx tsc ${TSC_FLAGS} ${contractsFile}`, {
      cwd: tmpDir,
      encoding: 'utf-8',
      timeout: 30000,
    }).trim();

    expect(result).toBe('');
  });

  it('client compiles with tsc --strict --noEmit', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'weird-client-'));
    linkGenoc(dir);
    writeFileSync(join(dir, 'contracts.ts'), contracts, 'utf-8');
    writeFileSync(join(dir, 'client.ts'), client, 'utf-8');

    const result = execSync(`npx tsc ${TSC_FLAGS} client.ts`, {
      cwd: dir,
      encoding: 'utf-8',
      timeout: 30000,
    }).trim();

    expect(result).toBe('');
  });

  it('matches contracts snapshot', () => {
    expect(contracts).toMatchSnapshot('weird-symbol-contracts');
  });

  it('matches client snapshot', () => {
    expect(client).toMatchSnapshot('weird-symbol-client');
  });
});
