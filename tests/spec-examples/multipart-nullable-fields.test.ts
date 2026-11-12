/**
 * Regression test — nullable string multipart fields and binary arrays whose
 * `items` is a `$ref`.
 *
 * Guards two review findings on the multipart field walk:
 *
 * 1. Nullable string fields (`nullable: true` in 3.0, `type: ["string",
 *    "null"]` in 3.1) were appended directly — but `string | null` does not
 *    satisfy FormData's `string | Blob` parameter, so `tsc --strict` on the
 *    generated client failed with TS2769. The 3.1 type-array form had the
 *    opposite problem: it fell into the JSON branch, appending real string
 *    values with JSON quotes. Nullable string fields now append directly
 *    behind a `null` guard (FormData has no null representation).
 * 2. Array fields whose `items` is a `$ref` to a binary schema were
 *    JSON-serialized: the file-array check only inspected the unresolved
 *    `$ref` object, so `format: binary` behind the reference was invisible.
 *    They now upload as `FileInput[]` with the per-file append loop.
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

const SPEC_30 = `
  openapi: "3.0.3"
  info: { title: Notes, version: "1.0.0" }
  paths:
    /notes:
      post:
        requestBody:
          required: true
          content:
            multipart/form-data:
              schema:
                type: object
                properties:
                  note: { type: string, nullable: true }
                  plain: { type: string }
                required: [plain]
        responses: { "200": { description: OK } }
`;

const SPEC_31 = `
  openapi: "3.1.0"
  info: { title: Modes, version: "1.0.0" }
  paths:
    /modes:
      post:
        requestBody:
          required: true
          content:
            multipart/form-data:
              schema:
                type: object
                properties:
                  mode:
                    type: [string, "null"]
                    enum: [fast, slow, null]
                  label: { type: [string, "null"] }
        responses: { "200": { description: OK } }
`;

const SPEC_REF_ITEMS = `
  openapi: "3.1.0"
  info: { title: Gallery, version: "1.0.0" }
  components:
    schemas:
      GalleryItem: { type: string, format: binary }
  paths:
    /gallery:
      post:
        requestBody:
          required: true
          content:
            multipart/form-data:
              schema:
                type: object
                properties:
                  photos:
                    type: array
                    items: { $ref: "#/components/schemas/GalleryItem" }
        responses: { "200": { description: OK } }
`;

describe('multipart nullable string fields (3.0 nullable flag)', () => {
  it('keeps the nullable type and appends behind a null guard, compiling under tsc --strict', async () => {
    const { contracts, client } = generateOutput(analyzeYaml(SPEC_30), CONFIG);

    expect(contracts).toContain('note?: string | null;');
    expect(contracts).toContain('plain: string;');
    expect(client).toContain(
      'if (body.note !== undefined && body.note !== null) formData.append("note", body.note);'
    );
    expect(client).toContain('if (body.plain !== undefined) formData.append("plain", body.plain);');
    expect(client).toMatchSnapshot();
    expect(contracts).toMatchSnapshot();

    const tmpDir = await mkdtemp(join(tmpdir(), 'multipart-nullable-30-'));
    linkGenoc(tmpDir);
    writeFileSync(join(tmpDir, 'contracts.ts'), contracts, 'utf-8');
    writeFileSync(join(tmpDir, 'client.ts'), client, 'utf-8');
    expectFilesCompile([join(tmpDir, 'client.ts')]);
  });
});

describe('multipart nullable string fields (3.1 type arrays)', () => {
  it('classifies type-array strings as string fields, not JSON fields', () => {
    const { contracts, client } = generateOutput(analyzeYaml(SPEC_31), CONFIG);

    expect(contracts).toContain("mode?: 'fast' | 'slow' | null;");
    expect(contracts).toContain('label?: string | null;');
    // string values append directly (no JSON quoting), null is guarded away
    expect(client).toContain(
      'if (body.mode !== undefined && body.mode !== null) formData.append("mode", body.mode);'
    );
    expect(client).toContain(
      'if (body.label !== undefined && body.label !== null) formData.append("label", body.label);'
    );
    expect(client).not.toContain('formData.append("mode", JSON.stringify(body.mode));');
    expect(client).not.toContain('formData.append("label", JSON.stringify(body.label));');
    expect(client).toMatchSnapshot();
    expect(contracts).toMatchSnapshot();
  });
});

describe('multipart binary arrays via $ref items', () => {
  it('uploads them as FileInput[] with the per-file append loop', () => {
    const { contracts, client } = generateOutput(analyzeYaml(SPEC_REF_ITEMS), CONFIG);

    expect(contracts).toContain('photos?: FileInput[];');
    expect(client).toContain(
      'if (body.photos !== undefined) { for (const file of body.photos) { formData.append("photos", file.data, file.filename); } }'
    );
    expect(client).not.toContain('formData.append("photos", JSON.stringify(body.photos));');
    expect(client).toMatchSnapshot();
    expect(contracts).toMatchSnapshot();
  });
});
