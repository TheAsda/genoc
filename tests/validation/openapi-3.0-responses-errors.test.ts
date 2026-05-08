// Feature coverage: 3.0-#53 (2xx success codes), 3.0-#54 (4xx/5xx error codes),
// 3.0-#55 (default response), 3.0-#56 (binary responses), 3.0-#57 (empty responses),
// 3.0-#58 (content types response), 3.0-#59 (response headers), 3.0-#60 (response examples),
// 3.0-#61 (ApiError<TStatus,TData>), 3.0-#62 (UnspecifiedApiError),
// 3.0-#63 (isError/isDefinedError type guard), 3.0-#64 (per-operation error unions),
// 3.0-#65 (default error body), 3.0-#66 (status-based errors),
// 3.0-#67 (error response mapping)

/**
 * Validation Tests — OpenAPI 3.0 Responses & Error Handling
 *
 * Tests every feature from the "Responses" (3.0-#53-#60) and "Error Handling"
 * (3.0-#61-#67) sections of the feature enumeration.
 *
 * All features are Tier 1: generateClient + string matching on TypeScript output.
 *
 * Response and error handling code paths are version-independent — the same
 * generator code processes both 3.0 and 3.1 specs. These tests verify correct
 * behavior with 3.0 specs using `openapi: "3.0.3"`.
 *
 * Note: contracts-generator.ts generates ApiError/UnspecifiedApiError classes and
 * per-operation error type aliases inline. The separate error-types.ts module is
 * tested in tests/unit/error-types.test.ts and is NOT part of the generation pipeline.
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

// ── Responses (3.0-#53-#60) ───────────────────────────────────────────────

describe('OpenAPI 3.0 — Responses (3.0-#53-#60)', () => {
  // 3.0-#53: 2xx success codes — Tier 1
  it('3.0-#53: generates typed response type for 2xx status codes', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.3"
      info: { title: Test, version: "1.0.0" }
      components:
        schemas:
          Product:
            type: object
            properties:
              id: { type: string }
              name: { type: string }
            required: [id, name]
      paths:
        /products:
          get:
            responses:
              "200":
                description: List of products
                content:
                  application/json:
                    schema:
                      type: array
                      items:
                        $ref: "#/components/schemas/Product"
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  it('3.0-#53: unions multiple 2xx schemas into response type', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.3"
      info: { title: Test, version: "1.0.0" }
      components:
        schemas:
          Task:
            type: object
            properties:
              id: { type: string }
            required: [id]
      paths:
        /tasks:
          post:
            requestBody:
              content:
                application/json:
                  schema:
                    type: object
                    properties:
                      cmd: { type: string }
                    required: [cmd]
            responses:
              "201":
                description: Created
                content:
                  application/json:
                    schema:
                      $ref: "#/components/schemas/Task"
              "202":
                description: Accepted
                content:
                  application/json:
                    schema:
                      $ref: "#/components/schemas/Task"
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  // 3.0-#54: 4xx/5xx error codes — Tier 1
  it('3.0-#54: generates typed error types for 4xx status codes', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.3"
      info: { title: Test, version: "1.0.0" }
      components:
        schemas:
          ValidationError:
            type: object
            properties:
              field: { type: string }
              message: { type: string }
            required: [field, message]
      paths:
        /items:
          post:
            requestBody:
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
                      required: [id]
              "400":
                description: Validation error
                content:
                  application/json:
                    schema:
                      $ref: "#/components/schemas/ValidationError"
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  it('3.0-#54: generates typed error types for 5xx status codes', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.3"
      info: { title: Test, version: "1.0.0" }
      paths:
        /health:
          get:
            responses:
              "200":
                description: OK
                content:
                  application/json:
                    schema:
                      type: object
                      properties:
                        status: { type: string }
                      required: [status]
              "500":
                description: Server error
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

  it('3.0-#54: generates error union for multiple error status codes', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.3"
      info: { title: Test, version: "1.0.0" }
      paths:
        /orders/{orderId}:
          get:
            parameters:
              - name: orderId
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
                        total: { type: number }
                      required: [total]
              "400":
                description: Bad request
                content:
                  application/json:
                    schema:
                      type: object
                      properties:
                        msg: { type: string }
                      required: [msg]
              "404":
                description: Not found
              "500":
                description: Server error
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  // 3.0-#55: default response — Tier 1
  it('3.0-#55: default response is excluded from typed error codes', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.3"
      info: { title: Test, version: "1.0.0" }
      paths:
        /ping:
          get:
            responses:
              "200":
                description: Pong
              default:
                description: Unexpected error
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
    // Default response does NOT generate an ErrorDefault type
    expect(contracts).not.toContain('ErrorDefault');
    // No error types when only success + default
    expect(contracts).not.toContain('Errors =');
  });

  it('3.0-#55: default alongside explicit error codes keeps explicit errors only', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.3"
      info: { title: Test, version: "1.0.0" }
      paths:
        /tasks:
          get:
            responses:
              "200":
                description: Tasks
              "401":
                description: Unauthorized
              default:
                description: Error
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
    // No DefaultErrorBody in contracts-generator output
    expect(contracts).not.toContain('DefaultErrorBody');
  });

  // 3.0-#56: binary responses — Tier 1
  it('3.0-#56: binary response produces StreamResponse type', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.3"
      info: { title: Test, version: "1.0.0" }
      paths:
        /download/{fileId}:
          get:
            parameters:
              - name: fileId
                in: path
                required: true
                schema: { type: string }
            responses:
              "200":
                description: File download
                content:
                  application/octet-stream:
                    schema:
                      type: string
                      format: binary
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  it('3.0-#56: image content type produces StreamResponse type', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.3"
      info: { title: Test, version: "1.0.0" }
      paths:
        /avatar/{userId}:
          get:
            parameters:
              - name: userId
                in: path
                required: true
                schema: { type: string }
            responses:
              "200":
                description: User avatar
                content:
                  image/png:
                    schema:
                      type: string
                      format: binary
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  // 3.0-#57: empty responses — Tier 1
  it('3.0-#57: empty 204 response produces void type', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.3"
      info: { title: Test, version: "1.0.0" }
      paths:
        /cache:
          delete:
            responses:
              "204":
                description: Cache cleared
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  it('3.0-#57: empty 200 response with no content produces void type', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.3"
      info: { title: Test, version: "1.0.0" }
      paths:
        /ping:
          get:
            responses:
              "200":
                description: Pong
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  // 3.0-#58: content types (response) — Tier 1
  it('3.0-#58: uses first content type schema for response', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.3"
      info: { title: Test, version: "1.0.0" }
      paths:
        /data:
          get:
            responses:
              "200":
                description: Data
                content:
                  application/json:
                    schema:
                      type: object
                      properties:
                        jsonField: { type: string }
                      required: [jsonField]
                  text/plain:
                    schema:
                      type: string
                  application/xml:
                    schema:
                      type: object
                      properties:
                        xmlField: { type: string }
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
    // Second/third content types ignored
    expect(contracts).not.toContain('xmlField');
  });

  // 3.0-#59: response headers — Tier 1
  it('3.0-#59: response headers do not prevent response type generation', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.3"
      info: { title: Test, version: "1.0.0" }
      paths:
        /download:
          get:
            responses:
              "200":
                description: File info
                headers:
                  X-Rate-Limit:
                    schema: { type: integer }
                    description: Rate limit remaining
                  X-Request-Id:
                    schema: { type: string }
                content:
                  application/json:
                    schema:
                      type: object
                      properties:
                        url: { type: string }
                      required: [url]
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  it('3.0-#59: response headers are not emitted as typed output', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.3"
      info: { title: Test, version: "1.0.0" }
      paths:
        /stream:
          get:
            responses:
              "200":
                description: Stream
                headers:
                  Content-Disposition:
                    schema: { type: string }
                  X-Custom-Header:
                    schema: { type: boolean }
                content:
                  application/json:
                    schema:
                      type: string
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
    // Response header schemas NOT emitted as typed output
    expect(contracts).not.toContain('ContentDisposition');
    expect(contracts).not.toContain('XCustomHeader');
  });

  // 3.0-#60: response examples — Tier 1
  // Note: 3.0 uses `example` (singular), 3.1 uses `examples` (plural).
  // Both are parsed but not emitted in output.
  it('3.0-#60: response examples (3.0 `example` keyword) are parsed but not emitted', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.3"
      info: { title: Test, version: "1.0.0" }
      paths:
        /status:
          get:
            responses:
              "200":
                description: Status
                content:
                  application/json:
                    schema:
                      type: object
                      properties:
                        healthy: { type: boolean }
                      required: [healthy]
                    example:
                      healthy: true
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
    // Examples are NOT emitted
    expect(contracts).not.toContain('healthyExample');
    expect(contracts).not.toContain('Healthy response');
  });
});

// ── Error Handling (3.0-#61-#67) — inseparable group ────────────────────────
// Features #61-#67 are grouped because they interlock in generated code:
// ApiError, UnspecifiedApiError, isDefinedError, error unions, status-based
// errors, and error response mapping all appear together in the pipeline output.

describe('OpenAPI 3.0 — Error Handling (3.0-#61-#67)', () => {
  // 3.0-#61: ApiError<TStatus, TData> — Tier 1
  it('3.0-#61: generates ApiError<TStatus, TData> class in contracts', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.3"
      info: { title: Test, version: "1.0.0" }
      paths:
        /items:
          get:
            responses:
              "200":
                description: OK
              "400":
                description: Bad request
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  it('3.0-#61: client throws ApiError with status and typed data', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.3"
      info: { title: Test, version: "1.0.0" }
      paths:
        /items:
          post:
            requestBody:
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
              "400":
                description: Bad request
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

  // 3.0-#62: UnspecifiedApiError — Tier 1
  it('3.0-#62: generates UnspecifiedApiError class in contracts', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.3"
      info: { title: Test, version: "1.0.0" }
      paths:
        /items:
          get:
            responses:
              "200":
                description: OK
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  it('3.0-#62: client throws UnspecifiedApiError for unhandled status codes', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.3"
      info: { title: Test, version: "1.0.0" }
      paths:
        /items:
          get:
            responses:
              "200":
                description: OK
              "400":
                description: Bad request
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  // 3.0-#63: isDefinedError type guard — Tier 1
  it('3.0-#63: generates isDefinedError type guard in client', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.3"
      info: { title: Test, version: "1.0.0" }
      paths:
        /items:
          get:
            responses:
              "200":
                description: OK
              "400":
                description: Bad request
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  // 3.0-#64: per-operation error unions — Tier 1
  it('3.0-#64: generates per-operation error union type', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.3"
      info: { title: Test, version: "1.0.0" }
      paths:
        /users/{userId}:
          delete:
            parameters:
              - name: userId
                in: path
                required: true
                schema: { type: string }
            responses:
              "204":
                description: Deleted
              "400":
                description: Bad request
                content:
                  application/json:
                    schema:
                      type: object
                      properties:
                        msg: { type: string }
                      required: [msg]
              "404":
                description: Not found
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  it('3.0-#64: operation with no error responses has no error types', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.3"
      info: { title: Test, version: "1.0.0" }
      paths:
        /health:
          get:
            responses:
              "200":
                description: OK
                content:
                  application/json:
                    schema:
                      type: object
                      properties:
                        status: { type: string }
                      required: [status]
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
    // No error types generated
    expect(contracts).not.toContain('Error200');
    expect(contracts).not.toContain('Errors =');
  });

  // 3.0-#65: default error body — Tier 1
  // Note: DefaultErrorBody is only generated by error-types.ts (separate module),
  // NOT by contracts-generator. In contracts-generator, default responses are
  // excluded from error type generation. The "default error body" concept exists
  // in error-types.ts as `DefaultErrorBody = unknown` when `default` response is used.
  it('3.0-#65: contracts-generator does NOT emit DefaultErrorBody (only error-types.ts does)', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.3"
      info: { title: Test, version: "1.0.0" }
      paths:
        /items:
          post:
            requestBody:
              content:
                application/json:
                  schema:
                    type: object
                    properties:
                      name: { type: string }
            responses:
              "201":
                description: Created
              "400":
                description: Bad request
              default:
                description: Unexpected error
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
    // contracts-generator does NOT emit DefaultErrorBody
    expect(contracts).not.toContain('DefaultErrorBody');
  });

  // 3.0-#66: status-based errors — Tier 1
  it('3.0-#66: generates separate typed error per status code', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.3"
      info: { title: Test, version: "1.0.0" }
      paths:
        /submit:
          post:
            requestBody:
              content:
                application/json:
                  schema:
                    type: object
                    properties:
                      data: { type: string }
                    required: [data]
            responses:
              "201":
                description: Created
                content:
                  application/json:
                    schema:
                      type: object
                      properties:
                        id: { type: string }
                      required: [id]
              "400":
                description: Bad request
                content:
                  application/json:
                    schema:
                      type: object
                      properties:
                        errors: { type: array, items: { type: string } }
              "401":
                description: Unauthorized
              "403":
                description: Forbidden
              "429":
                description: Rate limited
                content:
                  application/json:
                    schema:
                      type: object
                      properties:
                        retryAfter: { type: integer }
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  // 3.0-#67: error response mapping — Tier 1
  it('3.0-#67: maps each error response to a typed ApiError throw in client', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.3"
      info: { title: Test, version: "1.0.0" }
      paths:
        /orders/{orderId}:
          get:
            parameters:
              - name: orderId
                in: path
                required: true
                schema: { type: string }
            responses:
              "200":
                description: Order
                content:
                  application/json:
                    schema:
                      type: object
                      properties:
                        id: { type: string }
                      required: [id]
              "400":
                description: Bad request
                content:
                  application/json:
                    schema:
                      type: object
                      properties:
                        msg: { type: string }
                      required: [msg]
              "404":
                description: Not found
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  it('3.0-#67: error types use unknown when no schema provided', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.3"
      info: { title: Test, version: "1.0.0" }
      paths:
        /reset:
          post:
            responses:
              "204":
                description: Reset done
              "500":
                description: Server error
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });
});

// ── Combined: Error handling with binary response ─────────────────────────

describe('OpenAPI 3.0 — Error handling edge cases', () => {
  it('operation with binary success and typed errors generates both', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.3"
      info: { title: Test, version: "1.0.0" }
      paths:
        /export/{format}:
          get:
            parameters:
              - name: format
                in: path
                required: true
                schema: { type: string }
            responses:
              "200":
                description: Export file
                content:
                  application/octet-stream:
                    schema:
                      type: string
                      format: binary
              "400":
                description: Invalid format
                content:
                  application/json:
                    schema:
                      type: object
                      properties:
                        error: { type: string }
                      required: [error]
              "404":
                description: Not found
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  it('RequesterFailError is generated in contracts', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.3"
      info: { title: Test, version: "1.0.0" }
      paths:
        /ping:
          get:
            responses:
              "200":
                description: OK
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  it('client wraps non-ApiError exceptions in RequesterFailError', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.3"
      info: { title: Test, version: "1.0.0" }
      paths:
        /ping:
          get:
            responses:
              "200":
                description: OK
              "500":
                description: Error
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });
});
