// Feature coverage: 3.1-#55 (2xx success codes), 3.1-#56 (4xx/5xx error codes),
// 3.1-#57 (default response), 3.1-#58 (binary responses), 3.1-#59 (empty responses),
// 3.1-#60 (content types response), 3.1-#61 (response headers), 3.1-#62 (response examples),
// 3.1-#63 (ApiError<TStatus,TData>), 3.1-#64 (UnspecifiedApiError),
// 3.1-#65 (isError/isDefinedError type guard), 3.1-#66 (per-operation error unions),
// 3.1-#67 (default error body), 3.1-#68 (status-based errors),
// 3.1-#69 (error response mapping)

/**
 * Validation Tests — OpenAPI 3.1 Responses & Error Handling
 *
 * Tests every feature from the "Responses" (3.1-#55-#62) and "Error Handling"
 * (3.1-#63-#69) sections of the feature enumeration.
 *
 * All features are Tier 1: generateClient + string matching on TypeScript output.
 *
 * Note: contracts-generator.ts generates ApiError/UnspecifiedApiError classes and
 * per-operation error type aliases inline. They are NOT part of a separate
 * error-types module - the (dead) src/generator/error-types.ts was removed.
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

// ── Responses (3.1-#55-#62) ───────────────────────────────────────────────

describe('OpenAPI 3.1 — Responses (3.1-#55-#62)', () => {
  // 3.1-#55: 2xx success codes — Tier 1
  it('3.1-#55: generates typed response type for 2xx status codes', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
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

  it('3.1-#55: unions multiple 2xx schemas into response type', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
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

  // 3.1-#56: 4xx/5xx error codes — Tier 1
  it('3.1-#56: generates typed error types for 4xx status codes', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
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

  it('3.1-#56: generates typed error types for 5xx status codes', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
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

  it('3.1-#56: generates error union for multiple error status codes', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
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

  // 3.1-#57: default response — Tier 1
  it('3.1-#57: default response is excluded from typed error codes', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
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

  it('3.1-#57: default alongside explicit error codes keeps explicit errors only', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
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

  // 3.1-#58: binary responses — Tier 1
  it('3.1-#58: binary response produces StreamResponse type', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
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

  it('3.1-#58: image content type produces StreamResponse type', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
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

  // 3.1-#59: empty responses — Tier 1
  it('3.1-#59: empty 204 response produces void type', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
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

  it('3.1-#59: empty 200 response with no content produces void type', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
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

  // 3.1-#60: content types (response) — Tier 1
  it('3.1-#60: uses first content type schema for response', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
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

  // 3.1-#61: response headers — Tier 1
  it('3.1-#61: response headers do not prevent response type generation', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
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

  it('3.1-#61: response headers are not emitted as typed output', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
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

  // 3.1-#62: response examples — Tier 1
  it('3.1-#62: response examples are parsed but not emitted in output', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
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
                    examples:
                      healthyExample:
                        summary: Healthy response
                        value:
                          healthy: true
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
    // Examples are NOT emitted
    expect(contracts).not.toContain('healthyExample');
    expect(contracts).not.toContain('Healthy response');
  });
});

// ── Error Handling (3.1-#63-#69) — inseparable group ────────────────────────
// Features #63-#69 are grouped because they interlock in generated code:
// ApiError, UnspecifiedApiError, isDefinedError, error unions, status-based
// errors, and error response mapping all appear together in the pipeline output.

describe('OpenAPI 3.1 — Error Handling (3.1-#63-#69)', () => {
  // 3.1-#63: ApiError<TStatus, TData> — Tier 1
  it('3.1-#63: generates ApiError<TStatus, TData> class in contracts', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
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

  it('3.1-#63: client throws ApiError with status and typed data', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
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

  // 3.1-#64: UnspecifiedApiError — Tier 1
  it('3.1-#64: generates UnspecifiedApiError class in contracts', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
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

  it('3.1-#64: client throws UnspecifiedApiError for unhandled status codes', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
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

  // 3.1-#65: isDefinedError type guard — Tier 1
  it('3.1-#65: generates isDefinedError type guard in client', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
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

  // 3.1-#66: per-operation error unions — Tier 1
  it('3.1-#66: generates per-operation error union type', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
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

  it('3.1-#66: operation with no error responses has no error types', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
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

  // 3.1-#67: default error body — Tier 1
  // Note: contracts-generator does not emit DefaultErrorBody
  // NOT by contracts-generator. In contracts-generator, default responses are
  // excluded from error type generation. The "default error body" concept exists
  // only in the removed error-types.ts, which used to emit `DefaultErrorBody = unknown`
  // for `default` responses.
  it('3.1-#67: contracts-generator does NOT emit DefaultErrorBody', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
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

  // 3.1-#68: status-based errors — Tier 1
  it('3.1-#68: generates separate typed error per status code', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
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

  // 3.1-#69: error response mapping — Tier 1
  it('3.1-#69: maps each error response to a typed ApiError throw in client', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
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

  it('3.1-#69: error types use unknown when no schema provided', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
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

describe('OpenAPI 3.1 — Error handling edge cases', () => {
  it('operation with binary success and typed errors generates both', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
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
      openapi: "3.1.0"
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
      openapi: "3.1.0"
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
