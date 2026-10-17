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
    outputDir: '/tmp/discriminator-concrete-base-test',
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
  const tmpDir = await mkdtemp(join(tmpdir(), 'discriminator-concrete-base-'));
  linkGenoc(tmpDir);
  writeFileSync(join(tmpDir, 'contracts.ts'), output.contracts, 'utf-8');
  writeFileSync(join(tmpDir, 'client.ts'), output.client, 'utf-8');
  expectFilesCompile([join(tmpDir, 'client.ts')]);
}

/** Compile an arbitrary assertion file alongside the generated contracts. */
async function compileAssertionFile(
  contracts: string,
  fileName: string,
  source: string
): Promise<void> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'discriminator-concrete-base-'));
  linkGenoc(tmpDir);
  writeFileSync(join(tmpDir, 'contracts.ts'), contracts, 'utf-8');
  writeFileSync(join(tmpDir, fileName), source, 'utf-8');
  expectFilesCompile([join(tmpDir, fileName)]);
}

/**
 * Issue #93's four probe assertions for the Entity family: a list endpoint
 * returning the base accepts plain base items (P1) and full child items (P2),
 * narrowing on the discriminator reaches child props with the base as the
 * else branch (P3), and the child endpoint stays exactly the child (P4).
 */
const ENTITY_PAYLOAD_ASSERTIONS = `import type {
  GetApiEntitiesFindResponse,
  GetApiEntitiesEntityIdResponse,
} from './contracts.js';

// P1: a plain base Entity is a valid item of the Find array.
const base: GetApiEntitiesFindResponse = [{ $type: 'Entity', id: '1', name: 'a' }];

// P2: a full EntityDetails item is still accepted in the list.
const det: GetApiEntitiesFindResponse = [
  { $type: 'EntityDetails', id: '1', name: 'a', shortName: 's' },
];

// P3: narrowing on the discriminator reaches shortName, and the else branch
// is the base, which has no shortName.
declare const list: GetApiEntitiesFindResponse;
for (const e of list) {
  if (e.$type === 'EntityDetails') {
    const s: string = e.shortName;
    void s;
  } else {
    // @ts-expect-error base has no shortName
    void e.shortName;
  }
}

// P4: the details endpoint is exactly EntityDetails.
declare const one: GetApiEntitiesEntityIdResponse;
const s2: string = one.shortName;
const t: 'EntityDetails' = one.$type;
void base;
void det;
void s2;
void t;
`;

/** Bug 1 assertions for the OAS Pet/Cat/Dog example: every arm usable, union accepts each arm, narrowing works. */
const OAS_PAYLOAD_ASSERTIONS = `import type { GetPetsResponse, Pet, Cat, Dog } from './contracts.js';

const petOk: Pet = { petType: 'Pet', name: 'Generic' };
const catOk: Cat = { petType: 'Cat', name: 'Tom', huntingSkill: 'lazy' };
const dogOk: Dog = { petType: 'Dog', name: 'Rex', packSize: 3 };

const listOk: GetPetsResponse = [
  { petType: 'Pet', name: 'Generic' },
  { petType: 'Cat', name: 'Tom', huntingSkill: 'lazy' },
  { petType: 'Dog', name: 'Rex', packSize: 3 },
];

declare const list: GetPetsResponse;
for (const p of list) {
  if (p.petType === 'Cat') {
    const h: string = p.huntingSkill;
    void h;
  } else {
    // @ts-expect-error only Cat has huntingSkill
    void p.huntingSkill;
  }
}

void petOk;
void catOk;
void dogOk;
void listOk;
`;

describe('Discriminator concrete-base integration', () => {
  describe('discriminator-concrete-base-oas (OAS Pet example, no mapping — bug 1)', () => {
    let output: GeneratedOutput;

    beforeAll(async () => {
      output = await generateFixture('discriminator-concrete-base-oas.json');
    });

    it('declares PetVariant covering the base and the implicit allOf children', () => {
      expect(output.contracts).toContain('export type PetVariant = Pet | Cat | Dog;');
    });

    it('Pet carries its own literal; children extend it via Omit', () => {
      expect(typeBlock(output.contracts, 'Pet')).toBe(
        "export type Pet = {\n  name: string;\n} & { petType: 'Pet' };"
      );
      expect(typeBlock(output.contracts, 'Cat')).toBe(
        "export type Cat = Omit<Pet, 'petType'> & {\n  huntingSkill: string;\n} & { petType: 'Cat' };"
      );
      expect(typeBlock(output.contracts, 'Dog')).toBe(
        "export type Dog = Omit<Pet, 'petType'> & {\n  packSize: number;\n} & { petType: 'Dog' };"
      );
    });

    it('the list response is PetVariant[]', () => {
      expect(output.contracts).toContain('export type GetPetsResponse = PetVariant[];');
    });

    it('generated contracts and client compile with tsc --strict --noEmit', async () => {
      await compileGenerated(output);
    });

    it('payload and narrowing assertions compile against the contracts', async () => {
      await compileAssertionFile(output.contracts, 'oas-assertions.ts', OAS_PAYLOAD_ASSERTIONS);
    });
  });

  describe('discriminator-concrete-base-entity (mapping lists the child only — bug 3)', () => {
    let output: GeneratedOutput;

    beforeAll(async () => {
      output = await generateFixture('discriminator-concrete-base-entity.json');
    });

    it('EntityVariant covers the concrete base and its mapped child', () => {
      expect(typeBlock(output.contracts, 'EntityVariant')).toBe(
        'export type EntityVariant = Entity | EntityDetails;'
      );
    });

    it('Entity carries its own literal; EntityDetails replaces it via Omit', () => {
      expect(typeBlock(output.contracts, 'Entity')).toBe(
        "export type Entity = {\n  id: string;\n  name: string;\n} & { $type: 'Entity' };"
      );
      expect(typeBlock(output.contracts, 'EntityDetails')).toBe(
        "export type EntityDetails = Omit<Entity, '$type'> & {\n  shortName: string;\n} & { $type: 'EntityDetails' };"
      );
    });

    it('Find is the union array; the details endpoint stays exactly EntityDetails', () => {
      expect(output.contracts).toContain(
        'export type GetApiEntitiesFindResponse = EntityVariant[];'
      );
      expect(output.contracts).toContain(
        'export type GetApiEntitiesEntityIdResponse = EntityDetails;'
      );
    });

    it('matches contracts snapshot', () => {
      expect(output.contracts).toMatchSnapshot('discriminator-concrete-base-entity-contracts');
    });

    it('matches client snapshot', () => {
      expect(output.client).toMatchSnapshot('discriminator-concrete-base-entity-client');
    });

    it('generated contracts and client compile with tsc --strict --noEmit', async () => {
      await compileGenerated(output);
    });

    it('P1–P4 payload and narrowing assertions compile against the contracts', async () => {
      await compileAssertionFile(
        output.contracts,
        'entity-assertions.ts',
        ENTITY_PAYLOAD_ASSERTIONS
      );
    });
  });

  describe('discriminator-concrete-base-selfmap (base listed in its own mapping — bug 2)', () => {
    let output: GeneratedOutput;
    let unselfMapped: GeneratedOutput;

    beforeAll(async () => {
      output = await generateFixture('discriminator-concrete-base-selfmap.json');
      unselfMapped = await generateFixture('discriminator-concrete-base-entity.json');
    });

    it('produces contracts identical to the non-self-mapped family', () => {
      expect(output.contracts).toBe(unselfMapped.contracts);
    });

    it('generated contracts and client compile with tsc --strict --noEmit', async () => {
      await compileGenerated(output);
    });

    it('P1–P4 payload and narrowing assertions compile against the contracts', async () => {
      await compileAssertionFile(
        output.contracts,
        'selfmap-assertions.ts',
        ENTITY_PAYLOAD_ASSERTIONS
      );
    });
  });

  describe('discriminator-concrete-base-empty-31 (3.1 parity + empty-family fallback)', () => {
    let output: GeneratedOutput;

    beforeAll(async () => {
      output = await generateFixture('discriminator-concrete-base-empty-31.json');
    });

    it('the 3.1 self-mapped family joins its base the same way as 3.0', () => {
      expect(typeBlock(output.contracts, 'EntityVariant')).toBe(
        'export type EntityVariant = Entity | EntityDetails;'
      );
      expect(output.contracts).toContain(
        'export type GetApiEntitiesFindResponse = EntityVariant[];'
      );
    });

    it('an empty family falls back to bare base refs and emits no union type', () => {
      expect(output.contracts).not.toContain('OrphanVariant');
      expect(output.contracts).toContain('export type GetApiOrphansResponse = Orphan;');
    });

    it('matches contracts snapshot', () => {
      expect(output.contracts).toMatchSnapshot('discriminator-concrete-base-empty-31-contracts');
    });

    it('matches client snapshot', () => {
      expect(output.client).toMatchSnapshot('discriminator-concrete-base-empty-31-client');
    });

    it('generated contracts and client compile with tsc --strict --noEmit', async () => {
      await compileGenerated(output);
    });
  });
});
