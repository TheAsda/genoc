// Feature coverage: 3.1-#33 (path parameters), 3.1-#34 (query parameters),
// 3.1-#35 (header parameters), 3.1-#36 (cookie parameters),
// 3.1-#37 (required/optional), 3.1-#38 (style), 3.1-#39 (explode),
// 3.1-#40 (allowEmptyValue), 3.1-#41 (deprecated param),
// 3.1-#42 (description param), 3.1-#43 (application/json),
// 3.1-#44 (multipart/form-data), 3.1-#45 (application/x-www-form-urlencoded),
// 3.1-#46 (application/octet-stream), 3.1-#47 (content negotiation),
// 3.1-#48 (required/optional body), 3.1-#49 (examples in request body),
// 3.1-#50 (format: binary), 3.1-#51 (format: byte),
// 3.1-#52 (multipart with files), 3.1-#53 (file metadata),
// 3.1-#54 (file validation)

/**
 * Validation Tests — OpenAPI 3.1 Parameters, Request Bodies & File Uploads
 *
 * Tests every feature from the "Parameters" (3.1-#33-#42), "Request Bodies"
 * (3.1-#43-#49), and "File Uploads" (3.1-#50-#54) sections of the feature enumeration.
 *
 * Tier 1 (most features): generateClient + string matching on TypeScript output
 * Tier 2 (#38-#40, #54): verify no crash + feature NOT emitted in output
 * Tier 1 doc / Tier 2 actual (#41, #42, #49): parsed but not emitted — tested accordingly
 */
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { generateClient as generateClientStrings } from '../../src/generator/client-generator.js';
import { generateContracts } from '../../src/generator/contracts-generator.js';
import { RefResolver } from '../../src/parser/ref-resolver.js';
import type { GeneratorConfig } from '../../src/types/client.js';
import type { OpenAPIDocument } from '../../src/types/openapi.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function generateFromYaml(yaml: string): string {
  const doc = parseYaml(yaml) as OpenAPIDocument;
  const resolver = new RefResolver(doc);
  return generateContracts(doc, resolver);
}

function generateClientFromYaml(yaml: string): { contracts: string; client: string } {
  const doc = parseYaml(yaml) as OpenAPIDocument;
  const config: GeneratorConfig = { input: 'test.yaml', outputDir: '/tmp/test' };
  return generateClientStrings(doc, config);
}

// ── Parameters (3.1-#33-#42) ───────────────────────────────────────────────

describe('OpenAPI 3.1 — Parameters (3.1-#33-#42)', () => {
  // 3.1-#33: path parameters — Tier 1
  it('3.1-#33: path parameters become flat method args with URL template interpolation', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
      info: { title: Test, version: "1.0.0" }
      paths:
        /users/{userId}:
          get:
            parameters:
              - name: userId
                in: path
                required: true
                schema: { type: string }
            responses:
              "200": { description: OK }
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
    // Path params do NOT generate a Query type
    expect(contracts).not.toContain('Query =');
  });

  // 3.1-#34: query parameters — Tier 1
  it('3.1-#34: query parameters are grouped into a Query type', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
      info: { title: Test, version: "1.0.0" }
      paths:
        /items:
          get:
            parameters:
              - name: page
                in: query
                schema: { type: integer }
              - name: limit
                in: query
                schema: { type: integer }
            responses:
              "200": { description: OK }
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  // 3.1-#35: header parameters — Tier 1
  it('3.1-#35: header parameters are grouped into a Headers type and included in method signature', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
      info: { title: Test, version: "1.0.0" }
      paths:
        /data:
          get:
            parameters:
              - name: X-Api-Key
                in: header
                schema: { type: string }
              - name: X-Request-Id
                in: header
                required: true
                schema: { type: string }
            responses:
              "200": { description: OK }
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
    expect(client).not.toContain('xApiKey');
    expect(client).not.toContain('xRequestId');
  });

  // 3.1-#36: cookie parameters — Tier 1
  it('3.1-#36: cookie parameters are parsed but do not appear in method signature or types', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
      info: { title: Test, version: "1.0.0" }
      paths:
        /session:
          get:
            parameters:
              - name: session_id
                in: cookie
                schema: { type: string }
            responses:
              "200": { description: OK }
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
    // Cookie params do NOT generate operation-specific Query or Headers types
    expect(contracts).not.toContain('GetSessionQuery');
    expect(contracts).not.toContain('GetSessionHeaders');
    expect(client).not.toContain('session_id');
  });

  // 3.1-#37: required/optional parameters — Tier 1
  describe('3.1-#37: required vs optional parameters', () => {
    it('marks required params without ? and optional params with ?', () => {
      const { contracts, client } = generateClientFromYaml(`
        openapi: "3.1.0"
        info: { title: Test, version: "1.0.0" }
        paths:
          /search:
            get:
              parameters:
                - name: q
                  in: query
                  required: true
                  schema: { type: string }
                - name: sort
                  in: query
                  required: false
                  schema: { type: string }
                - name: filter
                  in: query
                  schema: { type: string }
              responses:
                "200": { description: OK }
      `);

      expect(contracts).toMatchSnapshot();
      expect(client).toMatchSnapshot();
      expect(contracts).not.toMatch(/q\?:/);
    });

    it('makes path params always required regardless of explicit setting', () => {
      const { contracts, client } = generateClientFromYaml(`
        openapi: "3.1.0"
        info: { title: Test, version: "1.0.0" }
        paths:
          /items/{itemId}:
            get:
              parameters:
                - name: itemId
                  in: path
                  schema: { type: string }
              responses:
                "200": { description: OK }
      `);

      expect(contracts).toMatchSnapshot();
      expect(client).toMatchSnapshot();
    });
  });

  // 3.1-#38, #39, #40: style, explode, allowEmptyValue — Tier 2 (inseparable group)
  // These are preserved in normalization but not processed/emitted by the generator.
  describe('3.1-#38-#40: parameter serialization (style, explode, allowEmptyValue) — Tier 2', () => {
    it('does not crash and does not emit style/explode/allowEmptyValue in output', () => {
      const { contracts, client } = generateClientFromYaml(`
        openapi: "3.1.0"
        info: { title: Test, version: "1.0.0" }
        paths:
          /search:
            get:
              parameters:
                - name: q
                  in: query
                  style: form
                  explode: true
                  allowEmptyValue: true
                  schema: { type: string }
                - name: ids
                  in: query
                  style: pipeDelimited
                  explode: false
                  schema:
                    type: array
                    items: { type: integer }
              responses:
                "200": { description: OK }
      `);

      expect(contracts).toMatchSnapshot();
      expect(client).toMatchSnapshot();
      // style/explode/allowEmptyValue are NOT emitted in any output
      expect(contracts).not.toContain('style');
      expect(contracts).not.toContain('explode');
      expect(contracts).not.toContain('allowEmptyValue');
      expect(client).not.toContain('style');
      expect(client).not.toContain('explode');
      expect(client).not.toContain('allowEmptyValue');
    });
  });

  // 3.1-#41: deprecated (param) — Tier 1 doc, Tier 2 actual
  // ParameterObject.deprecated is parsed but not carried through to AnalyzedParameter
  // and not emitted as @deprecated in output (only operation-level deprecated is emitted).
  it('3.1-#41: deprecated parameter is parsed but not emitted as @deprecated', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
      info: { title: Test, version: "1.0.0" }
      paths:
        /items:
          get:
            parameters:
              - name: oldParam
                in: query
                deprecated: true
                schema: { type: string }
              - name: newParam
                in: query
                schema: { type: string }
            responses:
              "200": { description: OK }
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  // 3.1-#42: description (param) — Tier 1 doc, Tier 2 actual
  // ParameterObject.description is parsed into AnalyzedParameter.description,
  // emitted in method JSDoc as @param tags, and (jsdoc-field-metadata) as
  // per-property JSDoc on the ${prefix}Query type in contracts.
  it('3.1-#42: parameter description is parsed and emitted in JSDoc', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
      info: { title: Test, version: "1.0.0" }
      paths:
        /search:
          get:
            parameters:
              - name: q
                in: query
                description: "The search query string"
                schema: { type: string }
            responses:
              "200": { description: OK }
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
    expect(contracts).toContain(`  /** The search query string */
  q?: string;`);
  });
});

// ── Request Bodies (3.1-#43-#49) ────────────────────────────────────────────

describe('OpenAPI 3.1 — Request Bodies (3.1-#43-#49)', () => {
  // 3.1-#43: application/json — Tier 1
  it('3.1-#43: application/json generates body type with object properties', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
      info: { title: Test, version: "1.0.0" }
      paths:
        /users:
          post:
            requestBody:
              content:
                application/json:
                  schema:
                    type: object
                    properties:
                      name: { type: string }
                      email: { type: string }
                      age: { type: integer }
                    required: [name, email]
            responses:
              "201": { description: Created }
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  // 3.1-#44: multipart/form-data — Tier 1
  it('3.1-#44: multipart/form-data generates FormData handling in client', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
      info: { title: Test, version: "1.0.0" }
      paths:
        /upload:
          post:
            requestBody:
              required: true
              content:
                multipart/form-data:
                  schema:
                    type: object
                    properties:
                      name: { type: string }
                      file: { type: string, format: binary }
                    required: [file]
            responses:
              "201": { description: Created }
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  // 3.1-#45: application/x-www-form-urlencoded — Tier 1
  it('3.1-#45: application/x-www-form-urlencoded generates body type', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
      info: { title: Test, version: "1.0.0" }
      paths:
        /login:
          post:
            requestBody:
              required: true
              content:
                application/x-www-form-urlencoded:
                  schema:
                    type: object
                    properties:
                      username: { type: string }
                      password: { type: string }
                    required: [username, password]
            responses:
              "200": { description: OK }
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  // 3.1-#46: application/octet-stream — Tier 1
  it('3.1-#46: application/octet-stream generates string body type for binary', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
      info: { title: Test, version: "1.0.0" }
      paths:
        /binary:
          post:
            requestBody:
              required: true
              content:
                application/octet-stream:
                  schema:
                    type: string
                    format: binary
            responses:
              "200": { description: OK }
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  // 3.1-#47: content negotiation — Tier 1
  it('3.1-#47: multiple content types picks first content type schema', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
      info: { title: Test, version: "1.0.0" }
      paths:
        /data:
          post:
            requestBody:
              required: true
              content:
                application/json:
                  schema:
                    type: object
                    properties:
                      jsonField: { type: string }
                    required: [jsonField]
                multipart/form-data:
                  schema:
                    type: object
                    properties:
                      fileField: { type: string, format: binary }
                    required: [fileField]
            responses:
              "200": { description: OK }
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
    // Should NOT contain the second content type's properties
    expect(contracts).not.toContain('fileField');
    // No FileInput since first content type is not multipart
    expect(contracts).not.toContain('FileInput');
  });

  // 3.1-#48: required/optional body — Tier 1
  describe('3.1-#48: required vs optional request body', () => {
    it('non-optional body arg when required: true', () => {
      const { contracts, client } = generateClientFromYaml(`
        openapi: "3.1.0"
        info: { title: Test, version: "1.0.0" }
        paths:
          /orders:
            post:
              requestBody:
                required: true
                content:
                  application/json:
                    schema:
                      type: object
                      properties:
                        productId: { type: string }
                      required: [productId]
              responses:
                "201": { description: Created }
      `);

      expect(contracts).toMatchSnapshot();
      expect(client).toMatchSnapshot();
    });

    it('optional body arg when required is false or absent', () => {
      const { contracts, client } = generateClientFromYaml(`
        openapi: "3.1.0"
        info: { title: Test, version: "1.0.0" }
        paths:
          /profile:
            patch:
              requestBody:
                required: false
                content:
                  application/json:
                    schema:
                      type: object
                      properties:
                        bio: { type: string }
              responses:
                "200": { description: Updated }
      `);

      expect(contracts).toMatchSnapshot();
      expect(client).toMatchSnapshot();
    });
  });

  // 3.1-#49: examples in request body — Tier 1 doc, Tier 2 actual
  // Examples at MediaTypeObject level are parsed but not emitted in generated output.
  it('3.1-#49: examples in request body are parsed but not emitted in output', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
      info: { title: Test, version: "1.0.0" }
      paths:
        /users:
          post:
            requestBody:
              content:
                application/json:
                  schema:
                    type: object
                    properties:
                      name: { type: string }
                    required: [name]
                  examples:
                    userExample:
                      value:
                        name: John
            responses:
              "201": { description: Created }
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
    // Examples are NOT emitted in output
    expect(contracts).not.toContain('userExample');
    expect(contracts).not.toContain('John');
    expect(client).not.toContain('userExample');
    expect(client).not.toContain('John');
  });
});

// ── File Uploads (3.1-#50-#54) ──────────────────────────────────────────────
// 3.1-#50-#53 are an inseparable group (FileInput type is shared)

describe('OpenAPI 3.1 — File Uploads (3.1-#50-#54)', () => {
  // Shared spec for testing binary/byte/multipart/metadata together
  const uploadSpec = `
    openapi: "3.1.0"
    info: { title: Test, version: "1.0.0" }
    paths:
      /upload:
        post:
          requestBody:
            required: true
            content:
              multipart/form-data:
                schema:
                  type: object
                  properties:
                    avatar: { type: string, format: binary }
                    document: { type: string, format: byte }
                    gallery:
                      type: array
                      items: { type: string, format: binary }
                    name: { type: string }
                  required: [avatar, name]
          responses:
            "201": { description: Created }
  `;

  // 3.1-#50: format: binary — Tier 1
  it('3.1-#50: format: binary in multipart generates FileInput type', () => {
    const { contracts, client } = generateClientFromYaml(uploadSpec);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  // 3.1-#51: format: byte — Tier 1
  it('3.1-#51: format: byte in multipart generates string type (not FileInput)', () => {
    const { contracts, client } = generateClientFromYaml(uploadSpec);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
    expect(contracts).not.toContain('document?: FileInput');
    expect(client).not.toContain('body.document.data');
    expect(client).not.toContain('body.document.filename');
  });

  // 3.1-#52: multipart with multiple files — Tier 1
  it('3.1-#52: multiple binary fields and binary array generate FileInput entries', () => {
    const { contracts, client } = generateClientFromYaml(uploadSpec);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  // 3.1-#53: file metadata — Tier 1
  it('3.1-#53: FileInput interface includes data (Blob) and filename (string)', () => {
    const { contracts, client } = generateClientFromYaml(uploadSpec);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  // 3.1-#54: file validation — Tier 2 (not supported)
  // Validation constraints on binary schemas (e.g., maxLength for file size)
  // are parsed but not emitted as validation code.
  it('3.1-#54: file validation constraints are parsed but no validation code is generated', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
      info: { title: Test, version: "1.0.0" }
      paths:
        /upload:
          post:
            requestBody:
              required: true
              content:
                multipart/form-data:
                  schema:
                    type: object
                    properties:
                      file:
                        type: string
                        format: binary
                        maxLength: 1048576
                        minLength: 1
                    required: [file]
            responses:
              "201": { description: Created }
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
    // Validation constraints are NOT emitted as code
    expect(contracts).not.toContain('1048576');
    expect(contracts).not.toContain('maxLength');
    expect(contracts).not.toContain('minLength');
    expect(client).not.toContain('1048576');
    expect(client).not.toContain('maxLength');
    // No validation logic in client
    expect(client).not.toContain('validate');
    expect(client).not.toContain('if (file');
  });
});
