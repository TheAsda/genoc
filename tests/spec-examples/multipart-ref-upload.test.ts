/**
 * Regression test — multipart uploads whose file properties sit behind `$ref`s.
 *
 * Guards the T2 divergence fix: the client's FormData appends used to walk the
 * RAW multipart schema (no `$ref` resolution), so a `$ref`'d binary property
 * degraded to a plain string field append and a whole-body `$ref` silently
 * dropped every property. Both walks now consume the analyzer's
 * ref-resolving `fileUploadProperties` facts.
 *
 * Covers: property-level `$ref` to binary (required + optional), property-level
 * `$ref` to array-of-binary, and whole-body `$ref`.
 */
import { describe, expect, it } from 'vitest';

import { generateOutput } from '../../src/generator/client-generator.js';
import type { GeneratorConfig } from '../../src/types/client.js';
import { analyzeYaml } from '../analyze-fixture.js';

const SPEC = `
  openapi: "3.1.0"
  info: { title: Uploads, version: "1.0.0" }
  components:
    schemas:
      Avatar:
        type: string
        format: binary
      Gallery:
        type: array
        items: { type: string, format: binary }
      Label:
        type: string
      UploadForm:
        type: object
        properties:
          avatar: { $ref: "#/components/schemas/Avatar" }
          gallery: { $ref: "#/components/schemas/Gallery" }
          label: { $ref: "#/components/schemas/Label" }
        required: [avatar, gallery]
  paths:
    /upload:
      post:
        operationId: uploadWithRefs
        requestBody:
          required: true
          content:
            multipart/form-data:
              schema:
                type: object
                properties:
                  avatar: { $ref: "#/components/schemas/Avatar" }
                  gallery: { $ref: "#/components/schemas/Gallery" }
                  label: { $ref: "#/components/schemas/Label" }
                required: [avatar, gallery]
        responses:
          "200": { description: OK }
    /upload-whole-ref:
      post:
        operationId: uploadWholeRef
        requestBody:
          required: true
          content:
            multipart/form-data:
              schema: { $ref: "#/components/schemas/UploadForm" }
        responses:
          "200": { description: OK }
`;

const CONFIG: GeneratorConfig = { input: 'spec.yaml', outputDir: '/tmp/test' };

describe('multipart uploads with $ref\u2019d file properties (T2 divergence regression)', () => {
  const { contracts, client } = generateOutput(analyzeYaml(SPEC), CONFIG);

  it('types $ref\u2019d binary properties as FileInput in contracts', () => {
    expect(contracts).toContain('export interface FileInput {');
    expect(contracts).toContain('avatar: FileInput;');
    expect(contracts).toContain('gallery: FileInput[];');
    expect(contracts).toContain('label?: Label;'); // $ref to a string schema keeps its named type
  });

  it('reuses the referenced component for the whole-body $ref (pruning its orphaned raw field types)', () => {
    // the body aliases the component, and the component renders form-mapped
    expect(contracts).toContain('export type PostUploadWholeRefBody = UploadForm;');
    expect(contracts).toContain(
      'export type UploadForm = {\n  avatar: FileInput;\n  gallery: FileInput[];\n  label?: Label;\n};'
    );
    // Label survives (still referenced by UploadForm and PostUploadBody);
    // Avatar/Gallery lose their last reference to the form-mapped rendering
    // and are pruned instead of lingering unused
    expect(contracts).toContain('export type Label = string;');
    expect(contracts).not.toContain('export type Avatar');
    expect(contracts).not.toContain('export type Gallery');
  });

  it('appends $ref\u2019d binary properties as Files in the client (property-level refs)', () => {
    expect(client).toContain('const formData = new FormData();');
    // required $ref'd binary → direct File append
    expect(client).toContain('formData.append("avatar", body.avatar.data, body.avatar.filename);');
    // $ref'd array-of-binary → File[] loop
    expect(client).toContain(
      'if (body.gallery !== undefined) { for (const file of body.gallery) { formData.append("gallery", file.data, file.filename); } }'
    );
    // $ref'd plain property stays a field append
    expect(client).toContain('if (body.label !== undefined) formData.append("label", body.label);');
    // and never the degraded string append for the binary properties
    expect(client).not.toContain('formData.append("avatar", body.avatar);');
  });

  it('appends every property resolved through a whole-body $ref', () => {
    expect(client).toContain('formData.append("avatar", body.avatar.data, body.avatar.filename);');
    // requiredness flows through the body $ref: avatar is required there too,
    // so exactly one direct append per upload method is not enough to
    // distinguish — count direct appends across both methods instead.
    const directAppends = client.match(/formData\.append\("avatar", body\.avatar\.data/g);
    expect(directAppends).toHaveLength(2);
  });
});

const SHARED_SPEC = `
  openapi: "3.1.0"
  info: { title: Uploads, version: "1.0.0" }
  components:
    schemas:
      SharedForm:
        type: object
        properties:
          file: { type: string, format: binary }
          caption: { type: string }
        required: [file]
  paths:
    /upload-shared:
      post:
        operationId: uploadShared
        requestBody:
          required: true
          content:
            multipart/form-data:
              schema: { $ref: "#/components/schemas/SharedForm" }
        responses:
          "200": { description: OK }
    /forms:
      get:
        operationId: listForms
        responses:
          "200":
            description: OK
            content:
              application/json:
                schema: { $ref: "#/components/schemas/SharedForm" }
`;

describe('multipart whole-body $ref to a schema with other consumers', () => {
  const { contracts, client } = generateOutput(analyzeYaml(SHARED_SPEC), CONFIG);

  it('keeps the flattened body and the raw component mapping (no alias)', () => {
    // SharedForm also backs a JSON response, so re-pointing its definition at
    // the form mapping would corrupt that consumer: the single-consumer rule
    // kicks in and the body keeps its flattened inline form instead.
    expect(contracts).toContain('export type PostUploadSharedBody = {');
    expect(contracts).toContain('  file: FileInput;\n  caption?: string;\n};');
    // the component keeps its raw schema mapping (binary → string) and stays
    // referenced by the JSON response
    expect(contracts).toContain(
      'export type SharedForm = {\n  file: string;\n  caption?: string;\n};'
    );
    expect(contracts).toContain('export type GetFormsResponse = SharedForm;');
    // the upload client still appends the form-mapped fields
    expect(client).toContain('formData.append("file", body.file.data, body.file.filename);');
  });
});
