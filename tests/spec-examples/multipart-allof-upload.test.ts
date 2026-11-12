/**
 * Regression test — multipart uploads whose fields sit inside `allOf` members.
 *
 * Guards the allOf-merge fix: the multipart property walk used to read only
 * the resolved top-level `properties`, so a body declaring its form fields via
 * `allOf` (with or without a whole-body `$ref`) produced ZERO fields — the
 * contracts body type collapsed to `Record<string, never>` and every FormData
 * append was silently dropped.
 *
 * Covers: allOf members (required + optional fields), `required` flowing from
 * allOf members, own properties alongside allOf, nested allOf (member with its
 * own allOf), whole-body `$ref` to an allOf schema, and first-write-wins on
 * duplicate property names.
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
      PostRequest:
        type: object
        allOf:
          - type: object
            properties:
              request:
                $ref: "#/components/schemas/PostInput"
            required: [request]
          - type: object
            properties:
              files:
                type: array
                items: { type: string, format: binary }
      PostInput:
        type: object
        properties:
          name: { type: string }
      NestedMembers:
        allOf:
          - allOf:
              - type: object
                properties:
                  deep: { type: string, format: binary }
          - type: object
            properties:
              shallow: { type: string }
  paths:
    /competency-level:
      post:
        operationId: createCompetencyLevel
        requestBody:
          required: true
          content:
            multipart/form-data:
              schema: { $ref: "#/components/schemas/PostRequest" }
        responses:
          "200": { description: OK }
    /nested-allOf:
      post:
        operationId: uploadNestedAllOf
        requestBody:
          required: true
          content:
            multipart/form-data:
              schema: { $ref: "#/components/schemas/NestedMembers" }
        responses:
          "200": { description: OK }
    /own-plus-allof:
      post:
        operationId: uploadOwnPlusAllOf
        requestBody:
          required: true
          content:
            multipart/form-data:
              schema:
                allOf:
                  - type: object
                    properties:
                      files:
                        type: array
                        items: { type: string, format: binary }
                type: object
                properties:
                  note: { type: string }
        responses:
          "200": { description: OK }
    /duplicate-names:
      post:
        operationId: uploadDuplicateNames
        requestBody:
          required: true
          content:
            multipart/form-data:
              schema:
                allOf:
                  - type: object
                    properties:
                      field: { type: string }
                  - type: object
                    properties:
                      field: { type: string, format: binary }
        responses:
          "200": { description: OK }
`;

const CONFIG: GeneratorConfig = { input: 'spec.yaml', outputDir: '/tmp/test' };

describe('multipart uploads with allOf-composed bodies (regression)', () => {
  const { contracts, client } = generateOutput(analyzeYaml(SPEC), CONFIG);

  it('reuses the referenced component for whole-body $ref bodies (form-mapped)', () => {
    expect(contracts).not.toContain('Record<string, never>');
    // whole-body `$ref` bodies alias the component instead of emitting a
    // flattened twin that orphans it — the component itself renders through
    // the form-field walk (`$ref` fields keep named types, binary → FileInput)
    expect(contracts).toContain('export type PostCompetencyLevelBody = PostRequest;');
    expect(contracts).toContain(
      'export type PostRequest = {\n  request: PostInput;\n  files?: FileInput[];\n};'
    );
    expect(contracts).toContain('export type PostNestedAllOfBody = NestedMembers;');
    expect(contracts).toContain(
      'export type NestedMembers = {\n  deep?: FileInput;\n  shallow?: string;\n};'
    );
  });

  it('emits FileInput and appends every allOf field in the client FormData', () => {
    expect(contracts).toContain('export interface FileInput {');
    expect(client).toContain('const formData = new FormData();');
    // required $ref'd object field from an allOf member → JSON append
    expect(client).toContain('formData.append("request", JSON.stringify(body.request));');
    // optional array-of-binary from an allOf member → File[] loop
    expect(client).toContain(
      'if (body.files !== undefined) { for (const file of body.files) { formData.append("files", file.data, file.filename); } }'
    );
  });

  it('recurses into allOf members that themselves use allOf', () => {
    // NestedMembers nests an allOf inside an allOf member; its form-mapped
    // definition (reused by PostNestedAllOfBody) carries the merged fields
    expect(contracts).toContain('deep?: FileInput;');
    expect(contracts).toContain('shallow?: string;');
    expect(client).toContain('formData.append("deep", body.deep.data, body.deep.filename);');
  });

  it('merges own properties alongside allOf members (inline body stays flattened)', () => {
    // no whole-body `$ref` → no alias target; the body keeps its own
    // flattened object literal
    expect(contracts).toContain('export type PostOwnPlusAllofBody = {');
    expect(contracts).toContain('files?: FileInput[];');
    expect(contracts).toContain('note?: string;');
    expect(client).toContain(
      'if (body.files !== undefined) { for (const file of body.files) { formData.append("files", file.data, file.filename); } }'
    );
    expect(client).toContain('if (body.note !== undefined) formData.append("note", body.note);');
  });

  it('keeps the first same-named property (first-write wins, mapper allOf order)', () => {
    // the first member's plain string wins; the second member's binary is a
    // duplicate declaration, so it stays a field append, not a File append
    expect(client).toContain('if (body.field !== undefined) formData.append("field", body.field);');
    expect(client).not.toContain('formData.append("field", body.field.data');
  });
});
