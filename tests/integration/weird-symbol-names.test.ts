import { writeFileSync } from 'fs';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { describe, it, expect, beforeAll } from 'vitest';

import { generateClient } from '../../src/generator/client-generator.js';
import { loadFromFile } from '../../src/parser/spec-reader.js';
import type { GeneratorConfig } from '../../src/types/client.js';
import { expectFilesCompile } from '../helpers/compile-check.js';
import { linkGenoc } from '../helpers/link-genoc.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, '../fixtures/weird-symbol-names.json');

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

  it('produces unique exported identifiers and unique client methods', () => {
    const exported = [
      ...contracts.matchAll(
        /^export (?:type|class|function|const|interface) (\S+?)(?: <| =| \{)/gm
      ),
    ].map((m) => m[1]);
    expect(new Set(exported).size).toBe(exported.length);

    const methods = [...client.matchAll(/^\s+([A-Za-z0-9_$]+): decorateWithErrors/gm)].map(
      (m) => m[1]
    );
    expect(new Set(methods).size).toBe(methods.length);
  });

  it('numbers a second route whose names fold into an earlier one', () => {
    expect(client).toContain('postPaymentInput');
    expect(client).toContain('postPaymentInput2');
    expect(contracts).toContain('PostPaymentInput2Response');
  });

  it('numbers a second security scheme whose name folds into an earlier one', () => {
    expect(contracts).toContain('BearerAuthAuth =');
    expect(contracts).toContain('BearerAuthAuth2 =');
    expect(contracts.match(/export type BearerAuthAuth =/g)).toHaveLength(1);
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

    expectFilesCompile([contractsFile]);
  });

  it('client compiles with tsc --strict --noEmit', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'weird-client-'));
    linkGenoc(dir);
    writeFileSync(join(dir, 'contracts.ts'), contracts, 'utf-8');
    writeFileSync(join(dir, 'client.ts'), client, 'utf-8');

    expectFilesCompile([join(dir, 'client.ts')]);
  });

  it('matches contracts snapshot', () => {
    expect(contracts).toMatchSnapshot('weird-symbol-contracts');
  });

  it('matches client snapshot', () => {
    expect(client).toMatchSnapshot('weird-symbol-client');
  });
});
