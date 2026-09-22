import { writeFileSync } from 'fs';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { generateOutput } from '../../src/generator/client-generator.js';
import { loadFromFile } from '../../src/parser/spec-reader.js';
import type { GeneratorConfig } from '../../src/types/client.js';
import type { OpenAPIDocument } from '../../src/types/openapi.js';
import { analyzeFixture } from '../analyze-fixture.js';
import { expectFilesCompile } from '../helpers/compile-check.js';
import { linkGenoc } from '../helpers/link-genoc.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface GeneratedOutput {
  doc: OpenAPIDocument;
  contracts: string;
  client: string;
}

async function generateFixture(relativePath: string): Promise<GeneratedOutput> {
  const fixturePath = join(__dirname, '../fixtures', relativePath);
  const doc = await loadFromFile(fixturePath);
  const config: GeneratorConfig = {
    input: fixturePath,
    outputDir: '/tmp/discriminator-cross-variant-test',
  };
  const result = generateOutput(analyzeFixture(doc), config);
  return { doc, contracts: result.contracts, client: result.client };
}

/**
 * Extract one `export type NAME = ...;` definition block (multi-line safe:
 * spans until the next top-level export or end of file).
 */
function typeBlock(contracts: string, name: string): string {
  const start = contracts.indexOf(`export type ${name} = `);
  if (start < 0) {
    throw new Error(`type ${name} not found in contracts`);
  }
  const nextExport = contracts.indexOf('\nexport ', start + 1);
  return contracts.slice(start, nextExport === -1 ? undefined : nextExport).trimEnd();
}

async function compileGenerated(output: GeneratedOutput): Promise<void> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'discriminator-cross-variant-'));
  linkGenoc(tmpDir);
  writeFileSync(join(tmpDir, 'contracts.ts'), output.contracts, 'utf-8');
  writeFileSync(join(tmpDir, 'client.ts'), output.client, 'utf-8');
  expectFilesCompile([join(tmpDir, 'client.ts')]);
}

// The definitions below intentionally assert the NEW single-injection
// discriminator architecture (plan D1–D10); every case is RED against the
// current mapper for its predicted defect (double literal → `never`,
// dropped props, sanitized-instead-of-raw literal, unescaped-quote syntax
// error, duplicate identifier). Tasks 3–5 of the plan drive them GREEN.

describe('Discriminator cross-variant integration', () => {
  describe('dotnet-polymorphism-cross-variant (THE bug shape)', () => {
    let output: GeneratedOutput;

    beforeAll(async () => {
      output = await generateFixture('dotnet-polymorphism-cross-variant.json');
    });

    it('T1: CreateThing inherits via Omit<UpdateThing> with exactly ONE $type literal', () => {
      const create = typeBlock(output.contracts, 'CreateThing');
      expect(create).toMatch(
        /^export type CreateThing = Omit<UpdateThing, ["']?\$type["']?> & Record<string, unknown> & \{ ["']?\$type["']?: 'Create' \};$/
      );
      expect(create).not.toContain("'Full'");
    });

    it('T1: UpdateThing keeps the base spine and a single Full literal', () => {
      const update = typeBlock(output.contracts, 'UpdateThing');
      expect(update).toMatch(/^export type UpdateThing = BaseThing &/);
      expect(update).toMatch(/\{ ["']?\$type["']?: 'Full' \};$/);
    });

    it('T1: PartialThing shape is unchanged (regression pin)', () => {
      expect(typeBlock(output.contracts, 'PartialThing')).toBe(
        "export type PartialThing = BaseThing & Record<string, unknown> & { $type: 'Partial' };"
      );
    });

    it('T2: POST body that $refs a named mapping target is a bare alias', () => {
      expect(output.contracts).toContain('export type PostThingsBody = CreateThing;');
      // The named target's shape must appear exactly once in contracts.
      const literalAppends = output.contracts.match(/& \{ ["']?\$type["']?: 'Create' \}/g) ?? [];
      expect(literalAppends).toHaveLength(1);
    });

    it('T3: PUT body that $refs the base becomes BaseThingVariant (D1)', () => {
      expect(output.contracts).toContain('export type PutThingsIdBody = BaseThingVariant;');
      expect(output.contracts).toContain('export type PostThingsResponse = BaseThingVariant;');
    });

    it('T9: the nested artifact family stays scoped — bulletin is a bare name', () => {
      const update = typeBlock(output.contracts, 'UpdateThing');
      expect(update).toContain('bulletin?: BulletinArtifact;');
      expect(update).not.toContain("'Bulletin'");
    });

    it('generated contracts and client compile with tsc --strict --noEmit', async () => {
      await compileGenerated(output);
    });
  });

  describe('discriminator-sibling-refs (visited-set collapse)', () => {
    let output: GeneratedOutput;

    beforeAll(async () => {
      output = await generateFixture('discriminator-sibling-refs.json');
    });

    it('T4: both sibling refs render the full named variant', () => {
      expect(typeBlock(output.contracts, 'Holder')).toBe(
        'export type Holder = {\n  first: BigWidget;\n  second: BigWidget;\n};'
      );
    });

    it('generated contracts and client compile with tsc --strict --noEmit', async () => {
      await compileGenerated(output);
    });
  });

  describe('discriminator-nullable-variant (paren loss)', () => {
    let output: GeneratedOutput;

    beforeAll(async () => {
      output = await generateFixture('discriminator-nullable-variant.json');
    });

    it('T5: nullable variant keeps its literal via parenthesized append', () => {
      expect(typeBlock(output.contracts, 'OnGate')).toMatch(
        /\| null\) & \{ ["']?state["']?: 'On' \};$/
      );
    });

    it('T5: response $ref to the nullable target is a bare alias', () => {
      expect(output.contracts).toContain('export type GetGatesResponse = OnGate;');
    });

    it('generated contracts and client compile with tsc --strict --noEmit', async () => {
      await compileGenerated(output);
    });
  });

  describe('discriminator-implicit-variant (raw-segment literal)', () => {
    let output: GeneratedOutput;

    beforeAll(async () => {
      output = await generateFixture('discriminator-implicit-variant.json');
    });

    it('T6: the oneOf union renders bare variant names (D7)', () => {
      expect(typeBlock(output.contracts, 'Family')).toBe(
        'export type Family = MyVariant | OtherVariant;'
      );
    });

    it('T6: implicit variants carry the RAW ref segment as their literal (D3)', () => {
      expect(typeBlock(output.contracts, 'MyVariant')).toBe(
        "export type MyVariant = {\n  label: string;\n} & { kind: 'my-variant' };"
      );
      expect(typeBlock(output.contracts, 'OtherVariant')).toBe(
        "export type OtherVariant = {\n  note: string;\n} & { kind: 'other-variant' };"
      );
    });

    it('T12: the Variant union is always emitted, even without a mapping (D6)', () => {
      expect(output.contracts).toContain('export type FamilyVariant = MyVariant | OtherVariant;');
    });

    it('generated contracts and client compile with tsc --strict --noEmit', async () => {
      await compileGenerated(output);
    });
  });

  describe('discriminator-rename-collisions', () => {
    let output: GeneratedOutput;

    beforeAll(async () => {
      output = await generateFixture('discriminator-rename-collisions.json');
    });

    it('T11: colliding variant names are renamed and keep their literals', () => {
      const first = typeBlock(output.contracts, 'UserDto');
      expect(first).toContain("& { flavor: 'first' };");
      const second = typeBlock(output.contracts, 'UserDtoModel');
      expect(second).toContain("& { flavor: 'second' };");
    });

    it('T11: a user schema named ThingVariant does not collide with the generated union', () => {
      // The user schema keeps its name...
      expect(typeBlock(output.contracts, 'ThingVariant')).toContain('manualNote');
      // ...and the generated union (under a collision-free name) still covers
      // the renamed variants.
      const duplicateDeclarations = output.contracts.match(/^export type ThingVariant = /gm);
      expect(duplicateDeclarations).toHaveLength(1);
      expect(output.contracts).toMatch(/export type \w+ = UserDto \| UserDtoModel;/);
    });

    it('generated contracts and client compile with tsc --strict --noEmit', async () => {
      await compileGenerated(output);
    });
  });

  describe('discriminator-escaping', () => {
    let output: GeneratedOutput;

    beforeAll(async () => {
      output = await generateFixture('discriminator-escaping.json');
    });

    it('T7: mapping keys with quotes and backslashes are escaped (D8)', () => {
      expect(typeBlock(output.contracts, 'ApostropheBean')).toContain(
        String.raw`{ who: 'O\'Brien' }`
      );
      expect(typeBlock(output.contracts, 'BackslashBean')).toContain(
        String.raw`{ who: 'back\\slash' }`
      );
      // Numeric mapping keys are quoted as string literals.
      expect(typeBlock(output.contracts, 'NumericBean')).toContain("{ who: '123' }");
      // Enum members share the escaping helper.
      expect(typeBlock(output.contracts, 'MoodEnum')).toBe(
        String.raw`export type MoodEnum = 'it\'s fine' | 'plain';`
      );
    });

    it('generated contracts and client compile with tsc --strict --noEmit', async () => {
      await compileGenerated(output);
    });
  });

  describe('discriminator-spine-topologies', () => {
    let output: GeneratedOutput;

    beforeAll(async () => {
      output = await generateFixture('discriminator-spine-topologies.json');
    });

    it('T10: grandchild chain uses Omit and a single literal', () => {
      const leaf = typeBlock(output.contracts, 'ChainLeaf');
      expect(leaf).toMatch(/^export type ChainLeaf = Omit<ChainMid, ["']?chain["']?>/);
      expect(leaf).not.toContain("'mid'");
      expect(leaf).toMatch(/\{ ["']?chain["']?: 'leaf' \};$/);
    });

    it('T10: cyclic sibling spines terminate with one literal each', () => {
      const alpha = typeBlock(output.contracts, 'LoopAlpha');
      expect(alpha).toContain('Omit<LoopBeta');
      expect(alpha.match(/'alpha'/g)).toHaveLength(1);
      expect(alpha).not.toContain("'beta'");

      const beta = typeBlock(output.contracts, 'LoopBeta');
      expect(beta).toContain('Omit<LoopAlpha');
      expect(beta.match(/'beta'/g)).toHaveLength(1);
    });

    it('T10: multi-parent spine Omit-references the sibling (D4)', () => {
      const right = typeBlock(output.contracts, 'MultiRight');
      expect(right).toContain('Omit<MultiLeft');
      expect(right.match(/'right'/g)).toHaveLength(1);
      expect(right).not.toContain("'left'");
    });

    it('T10: mapping key wins over the variant redeclared own value, with a warning path', () => {
      const fast = typeBlock(output.contracts, 'ConstFast');
      expect(fast).not.toContain("'slow'");
      expect(fast.match(/'fast'/g)).toHaveLength(1);
    });

    it('T10: oneOf-union target is parenthesized at its own append and inlined in consumers', () => {
      expect(typeBlock(output.contracts, 'UniMix')).toBe(
        "export type UniMix = (UniA1 | UniA2) & { uni: 'mix' };"
      );
      const pick = typeBlock(output.contracts, 'UniPick');
      expect(pick).toContain('(UniA1 | UniA2) &');
      expect(pick).not.toContain("'mix'");
    });

    it('T10: nested base $ref inside a variant becomes {Base}Variant (D1 widening)', () => {
      expect(typeBlock(output.contracts, 'SelfKid')).toContain('parent: Self0Variant;');
    });

    it('T2: response $ref to a named mapping target is a bare alias', () => {
      expect(output.contracts).toContain('export type GetTopologiesResponse = ChainLeaf;');
    });

    it('generated contracts and client compile with tsc --strict --noEmit', async () => {
      await compileGenerated(output);
    });
  });
});
