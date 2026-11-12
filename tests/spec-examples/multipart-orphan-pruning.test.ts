/**
 * Regression test — orphan pruning around whole-body `$ref` multipart bodies.
 *
 * When a whole-body `$ref` multipart body is aliased to its component type,
 * the raw component definition is replaced by the form-mapped one
 * (`format: binary` → `FileInput`). Schema names that were referenced only
 * from that raw definition become orphans and are pruned — but the pruning
 * pass originally had two holes, both found in review:
 *
 * 1. The safety net scanned component definitions and operation contract
 *    lines only. Path parameter types never appear there — they live in the
 *    CLIENT file (method signature + import). A binary schema used both
 *    inside an override-eligible form and as a path parameter `$ref` was
 *    pruned while the client still imported it → TS2305 on the generated
 *    client.
 * 2. The safety net counted references from definitions that were themselves
 *    already removed, so a dependency chain (or cycle) left behind by the
 *    override kept every member "referenced" and dead types survived.
 */
import { writeFileSync } from 'fs';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { describe, expect, it } from 'vitest';

import { generateOutput } from '../../src/generator/client-generator.js';
import type { GeneratorConfig } from '../../src/types/client.js';
import { analyzeYaml } from '../analyze-fixture.js';
import { expectFilesCompile } from '../helpers/compile-check.js';
import { linkGenoc } from '../helpers/link-genoc.js';

const CONFIG: GeneratorConfig = { input: 'spec.yaml', outputDir: '/tmp/test' };

// Avatar is referenced by the override-eligible UploadForm AND by a path
// parameter — pruning must keep it for the client's import.
const SPEC_PATH_PARAM = `
  openapi: "3.1.0"
  info: { title: PathParamUpload, version: "1.0.0" }
  components:
    schemas:
      Avatar: { type: string, format: binary }
      UploadForm:
        type: object
        properties:
          avatar: { $ref: "#/components/schemas/Avatar" }
        required: [avatar]
  paths:
    /avatars/{avatarId}:
      parameters:
        - name: avatarId
          in: path
          required: true
          schema: { $ref: "#/components/schemas/Avatar" }
      post:
        requestBody:
          required: true
          content:
            multipart/form-data:
              schema: { $ref: "#/components/schemas/UploadForm" }
        responses: { "200": { description: OK } }
`;

// UploadForm → Avatar (binary $ref) → BaseString: the override replaces the
// Avatar reference with FileInput, so the whole chain must go.
const SPEC_CHAIN = `
  openapi: "3.1.0"
  info: { title: ChainUpload, version: "1.0.0" }
  components:
    schemas:
      BaseString: { type: string }
      Avatar:
        type: string
        allOf: [{ $ref: "#/components/schemas/BaseString" }]
        format: binary
      UploadForm:
        type: object
        properties:
          avatar: { $ref: "#/components/schemas/Avatar" }
        required: [avatar]
  paths:
    /badges:
      post:
        requestBody:
          required: true
          content:
            multipart/form-data:
              schema: { $ref: "#/components/schemas/UploadForm" }
        responses: { "200": { description: OK } }
`;

describe('orphan pruning vs client-side path parameter types', () => {
  it('keeps a pruned-candidate type that the client imports as a path parameter type', async () => {
    const { contracts, client } = generateOutput(analyzeYaml(SPEC_PATH_PARAM), CONFIG);

    // body aliases to the form-mapped component
    expect(contracts).toContain('export type PostAvatarsAvatarIdBody = UploadForm;');
    expect(contracts).toContain('avatar: FileInput;');
    // Avatar survives for the client signature despite being orphaned in
    // contracts by the form mapping
    expect(contracts).toContain('export type Avatar = string;');
    expect(client).toContain(
      "import type { Avatar, PostAvatarsAvatarIdBody } from './contracts.js';"
    );
    expect(client).toContain('avatarId: Avatar');
    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();

    const tmpDir = await mkdtemp(join(tmpdir(), 'multipart-prune-pathparam-'));
    linkGenoc(tmpDir);
    writeFileSync(join(tmpDir, 'contracts.ts'), contracts, 'utf-8');
    writeFileSync(join(tmpDir, 'client.ts'), client, 'utf-8');
    expectFilesCompile([join(tmpDir, 'client.ts')]);
  });
});

describe('orphan pruning of transitive chains', () => {
  it('removes the whole override-orphaned dependency chain', () => {
    const { contracts, client } = generateOutput(analyzeYaml(SPEC_CHAIN), CONFIG);

    expect(contracts).toContain('export type PostBadgesBody = UploadForm;');
    expect(contracts).toContain('avatar: FileInput;');
    expect(contracts).not.toContain('export type Avatar');
    expect(contracts).not.toContain('export type BaseString');
    expect(client).toContain('formData.append("avatar", body.avatar.data, body.avatar.filename);');
    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });
});
