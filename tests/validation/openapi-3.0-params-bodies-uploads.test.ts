// Feature coverage: 3.0-#33 (header parameters), 3.0-#34 (cookie parameters),
// 3.0-#35 (required/optional), 3.0-#36 (style), 3.0-#37 (explode),
// 3.0-#38 (allowEmptyValue), 3.0-#39 (deprecated param),
// 3.0-#40 (description param), 3.0-#41 (application/json),
// 3.0-#42 (multipart/form-data), 3.0-#43 (application/x-www-form-urlencoded),
// 3.0-#44 (application/octet-stream), 3.0-#45 (content negotiation),
// 3.0-#46 (required/optional body), 3.0-#47 (examples in request body),
// 3.0-#48 (format: binary), 3.0-#49 (format: byte),
// 3.0-#50 (multipart with files), 3.0-#51 (file metadata),
// 3.0-#52 (file validation), 3.0-#53 (2xx success codes),
// 3.0-#54 (4xx/5xx error codes)

/**
 * Validation Tests — OpenAPI 3.0 Parameters, Request Bodies, File Uploads & Initial Responses
 *
 * Tests features from the "Parameters" (3.0-#33-#40), "Request Bodies" (3.0-#41-#47),
 * "File Uploads" (3.0-#48-#52), and initial "Responses" (3.0-#53-#54) sections
 * of the feature enumeration.
 *
 * Parameter and request body handling is version-independent — the same code paths
 * process 3.0 and 3.1 specs. These tests verify correct behavior with 3.0 specs
 * using `openapi: "3.0.3"`.
 *
 * Tier 1 (most features): generateClient + string matching on TypeScript output
 * Tier 2 (#36-#38, #52): verify no crash + feature NOT emitted in output
 * Tier 1 doc / Tier 2 actual (#39, #40, #47): parsed but not emitted — tested accordingly
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

// ── Parameters (3.0-#33-#40) ───────────────────────────────────────────────

describe('OpenAPI 3.0 — Parameters (3.0-#33-#40)', () => {
  // 3.0-#33: header parameters — Tier 1
  it('3.0-#33: header parameters are grouped into a Headers type and included in method signature', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.3"
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

  // 3.0-#34: cookie parameters — Tier 1
  it('3.0-#34: cookie parameters are parsed but do not appear in method signature or types', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.3"
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
    // Must check against operation-specific Headers, not StreamResponse class
    expect(contracts).not.toContain('GetSessionHeaders');
    expect(client).not.toContain('session_id');
  });

  // 3.0-#35: required/optional parameters — Tier 1
  describe('3.0-#35: required vs optional parameters', () => {
    it('marks required params without ? and optional params with ?', () => {
      const { contracts, client } = generateClientFromYaml(`
        openapi: "3.0.3"
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
      // required: true → non-optional
      expect(contracts).not.toMatch(/q\?:/);
    });

    it('makes path params always required regardless of explicit setting', () => {
      const { contracts, client } = generateClientFromYaml(`
        openapi: "3.0.3"
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

  // 3.0-#36, #37, #38: style, explode, allowEmptyValue — Tier 2 (inseparable group)
  // These are preserved in normalization but not processed/emitted by the generator.
  describe('3.0-#36-#38: parameter serialization (style, explode, allowEmptyValue) — Tier 2', () => {
    it('does not crash and does not emit style/explode/allowEmptyValue in output', () => {
      const { contracts, client } = generateClientFromYaml(`
        openapi: "3.0.3"
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

  // 3.0-#39: deprecated (param) — Tier 1 doc, Tier 2 actual
  // ParameterObject.deprecated is parsed but not carried through to AnalyzedParameter
  // and not emitted as @deprecated in output (only operation-level deprecated is emitted).
  it('3.0-#39: deprecated parameter is parsed but not emitted as @deprecated', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.3"
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

  // 3.0-#40: description (param) — Tier 1 doc, Tier 2 actual
  // ParameterObject.description is parsed into AnalyzedParameter.description
  // and emitted in method JSDoc as @param tags.
  it('3.0-#40: parameter description is parsed and emitted in JSDoc', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.3"
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
    expect(contracts).not.toContain('search query string');
  });
});

// ── Request Bodies (3.0-#41-#47) ────────────────────────────────────────────

describe('OpenAPI 3.0 — Request Bodies (3.0-#41-#47)', () => {
  // 3.0-#41: application/json — Tier 1
  it('3.0-#41: application/json generates body type with object properties', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.3"
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

  // 3.0-#42: multipart/form-data — Tier 1
  it('3.0-#42: multipart/form-data generates FormData handling in client', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.3"
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

  // 3.0-#43: application/x-www-form-urlencoded — Tier 1
  it('3.0-#43: application/x-www-form-urlencoded generates body type', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.3"
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

  // 3.0-#44: application/octet-stream — Tier 1
  it('3.0-#44: application/octet-stream generates string body type for binary', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.3"
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

  // 3.0-#45: content negotiation — Tier 1
  it('3.0-#45: multiple content types picks first content type schema', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.3"
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

  // 3.0-#46: required/optional body — Tier 1
  describe('3.0-#46: required vs optional request body', () => {
    it('non-optional body arg when required: true', () => {
      const { contracts, client } = generateClientFromYaml(`
        openapi: "3.0.3"
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
        openapi: "3.0.3"
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

  // 3.0-#47: examples in request body — Tier 1 doc, Tier 2 actual
  // 3.0 uses `example` (singular), not `examples`. Both are parsed but not emitted.
  it('3.0-#47: examples in request body are parsed but not emitted in output', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.3"
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
                  example:
                    name: John
            responses:
              "201": { description: Created }
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
    // Examples are NOT emitted in output
    expect(contracts).not.toContain('John');
    expect(client).not.toContain('John');
  });
});

// ── File Uploads (3.0-#48-#52) ──────────────────────────────────────────────
// 3.0-#48-#51 are an inseparable group (FileInput type is shared)

describe('OpenAPI 3.0 — File Uploads (3.0-#48-#52)', () => {
  // Shared spec for testing binary/byte/multipart/metadata together
  const uploadSpec = `
    openapi: "3.0.3"
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

  // 3.0-#48: format: binary — Tier 1
  it('3.0-#48: format: binary in multipart generates FileInput type', () => {
    const { contracts, client } = generateClientFromYaml(uploadSpec);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  // 3.0-#49: format: byte — Tier 1
  it('3.0-#49: format: byte in multipart generates string type (not FileInput)', () => {
    const { contracts, client } = generateClientFromYaml(uploadSpec);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
    expect(contracts).not.toContain('document?: FileInput');
    expect(client).not.toContain('body.document.data');
    expect(client).not.toContain('body.document.filename');
  });

  // 3.0-#50: multipart with multiple files — Tier 1
  it('3.0-#50: multiple binary fields and binary array generate FileInput entries', () => {
    const { contracts, client } = generateClientFromYaml(uploadSpec);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  // 3.0-#51: file metadata — Tier 1
  it('3.0-#51: FileInput interface includes data (Blob) and filename (string)', () => {
    const { contracts, client } = generateClientFromYaml(uploadSpec);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  // 3.0-#52: file validation — Tier 2 (not supported)
  // Validation constraints on binary schemas (e.g., maxLength for file size)
  // are parsed but not emitted as validation code.
  it('3.0-#52: file validation constraints are parsed but no validation code is generated', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.3"
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

// ── Responses (3.0-#53-#54) ────────────────────────────────────────────────

describe('OpenAPI 3.0 — Initial Responses (3.0-#53-#54)', () => {
  // 3.0-#53: 2xx success codes — Tier 1
  it('3.0-#53: 2xx success responses generate typed response types', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.3"
      info: { title: Test, version: "1.0.0" }
      paths:
        /users:
          get:
            responses:
              "200":
                description: A list of users
                content:
                  application/json:
                    schema:
                      type: array
                      items:
                        type: object
                        properties:
                          id: { type: string }
                          name: { type: string }
                        required: [id, name]
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  it('3.0-#53: 201 Created generates typed response', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.3"
      info: { title: Test, version: "1.0.0" }
      paths:
        /users:
          post:
            requestBody:
              required: true
              content:
                application/json:
                  schema:
                    type: object
                    properties:
                      name: { type: string }
                    required: [name]
            responses:
              "201":
                description: Created
                content:
                  application/json:
                    schema:
                      type: object
                      properties:
                        id: { type: string }
                        name: { type: string }
                      required: [id, name]
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  // 3.0-#54: 4xx/5xx error codes — Tier 1
  it('3.0-#54: 4xx error responses generate typed error types', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.3"
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
              "200":
                description: OK
                content:
                  application/json:
                    schema:
                      type: object
                      properties:
                        id: { type: string }
                        name: { type: string }
                      required: [id]
              "400":
                description: Bad request
                content:
                  application/json:
                    schema:
                      type: object
                      properties:
                        message: { type: string }
                      required: [message]
              "404":
                description: Not found
                content:
                  application/json:
                    schema:
                      type: object
                      properties:
                        error: { type: string }
                      required: [error]
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  it('3.0-#54: 5xx error responses generate typed error types', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.3"
      info: { title: Test, version: "1.0.0" }
      paths:
        /health:
          get:
            responses:
              "200":
                description: OK
              "500":
                description: Internal server error
                content:
                  application/json:
                    schema:
                      type: object
                      properties:
                        detail: { type: string }
                      required: [detail]
              "503":
                description: Service unavailable
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });
});
