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
    expect(contracts).toMatch(/avatar: FileInput;/);
    expect(contracts).toMatch(/gallery: FileInput\[\];/);
    expect(contracts).toMatch(/label\?: string;/);
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
