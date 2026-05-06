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

    // Contracts: response type references the schema
    expect(contracts).toContain('export type GetProductsResponse = Product[];');
    // Client: requester<GetProductsResponse>
    expect(client).toContain('requester<GetProductsResponse>');
    // Client: Promise returns the response type
    expect(client).toContain('Promise<GetProductsResponse>');
  });

  it('3.1-#55: unions multiple 2xx schemas into response type', () => {
    const { contracts } = generateClientFromYaml(`
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

    // Multiple 2xx → union type (same type repeated = deduped or joined)
    expect(contracts).toContain('export type PostTasksResponse =');
    expect(contracts).toMatch(/PostTasksResponse = Task \| Task/);
  });

  // 3.1-#56: 4xx/5xx error codes — Tier 1
  it('3.1-#56: generates typed error types for 4xx status codes', () => {
    const { contracts } = generateClientFromYaml(`
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

    expect(contracts).toContain('export type PostItemsError400 = ValidationError;');
    expect(contracts).toContain('export type PostItemsErrors = ApiError<400, PostItemsError400>;');
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

    expect(contracts).toContain('export type GetHealthError500 =');
    expect(contracts).toContain('ApiError<500, GetHealthError500>');
    // Client: throws ApiError(500, ...) on 500 response
    expect(client).toContain('result.status === 500');
    expect(client).toContain('throw new ApiError(500');
  });

  it('3.1-#56: generates error union for multiple error status codes', () => {
    const { contracts } = generateClientFromYaml(`
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

    expect(contracts).toContain('export type GetOrdersOrderIdError400 =');
    expect(contracts).toContain('export type GetOrdersOrderIdError404 = unknown;');
    expect(contracts).toContain('export type GetOrdersOrderIdError500 = unknown;');
    expect(contracts).toContain('export type GetOrdersOrderIdErrors =');
    expect(contracts).toMatch(/ApiError<400, GetOrdersOrderIdError400>/);
    expect(contracts).toMatch(/ApiError<404, GetOrdersOrderIdError404>/);
    expect(contracts).toMatch(/ApiError<500, GetOrdersOrderIdError500>/);
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

    // Default response does NOT generate an ErrorDefault type
    expect(contracts).not.toContain('ErrorDefault');
    // No error types when only success + default
    expect(contracts).not.toContain('Errors =');
    // Client: void success type (no content = void)
    expect(client).toContain('requester<void>');
  });

  it('3.1-#57: default alongside explicit error codes keeps explicit errors only', () => {
    const { contracts } = generateClientFromYaml(`
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

    // Explicit 401 is kept; default is excluded from typed error codes
    expect(contracts).toContain('export type GetTasksError401 = unknown;');
    expect(contracts).toContain('export type GetTasksErrors = ApiError<401, GetTasksError401>;');
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

    // Contracts: StreamResponse type is always emitted
    expect(contracts).toContain('export class StreamResponse');
    // Contracts: response type is StreamResponse for binary
    expect(contracts).toContain('export type GetDownloadFileIdResponse = StreamResponse;');
    // Client: expectStream: true option
    expect(client).toContain('expectStream: true');
    // Client: checks for StreamResponse
    expect(client).toContain('instanceof StreamResponse');
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

    expect(contracts).toContain('export type GetAvatarUserIdResponse = StreamResponse;');
    expect(client).toContain('expectStream: true');
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

    // Contracts: response type is void
    expect(contracts).toContain('export type DeleteCacheResponse = void;');
    // Client: void return type
    expect(client).toContain('Promise<void>');
    expect(client).toContain('requester<void>');
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

    // Contracts: empty 200 also generates void response type
    expect(contracts).toContain('export type GetPingResponse = void;');
    expect(client).toContain('Promise<void>');
    expect(client).toContain('requester<void>');
  });

  // 3.1-#60: content types (response) — Tier 1
  it('3.1-#60: uses first content type schema for response', () => {
    const { contracts } = generateClientFromYaml(`
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

    // First content type's schema is used
    expect(contracts).toContain('export type GetDataResponse =');
    expect(contracts).toContain('jsonField: string');
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

    // Response type is still generated with schema
    expect(contracts).toContain('export type GetDownloadResponse =');
    expect(contracts).toContain('url: string');
    // Response headers are NOT emitted as a separate type in contracts
    // (headers in responses are parsed but not processed into output types)
  });

  it('3.1-#61: response headers are not emitted as typed output', () => {
    const { contracts } = generateClientFromYaml(`
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

    // Response header schemas NOT emitted as typed output
    expect(contracts).not.toContain('ContentDisposition');
    expect(contracts).not.toContain('XCustomHeader');
  });

  // 3.1-#62: response examples — Tier 1
  it('3.1-#62: response examples are parsed but not emitted in output', () => {
    const { contracts } = generateClientFromYaml(`
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

    // Schema type is generated
    expect(contracts).toContain('export type GetStatusResponse =');
    expect(contracts).toContain('healthy: boolean');
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
    const { contracts } = generateClientFromYaml(`
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

    expect(contracts).toContain(
      'export class ApiError<TStatus extends number, TData> extends Error'
    );
    expect(contracts).toContain('public readonly status: TStatus');
    expect(contracts).toContain('public readonly data: TData');
    expect(contracts).toContain('this.name = "ApiError"');
  });

  it('3.1-#63: client throws ApiError with status and typed data', () => {
    const { client } = generateClientFromYaml(`
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

    // Client imports ApiError from contracts
    expect(client).toContain('ApiError');
    // Client throws typed ApiError for 400
    expect(client).toContain('throw new ApiError(400, result.data as PostItemsError400');
  });

  // 3.1-#64: UnspecifiedApiError — Tier 1
  it('3.1-#64: generates UnspecifiedApiError class in contracts', () => {
    const { contracts } = generateClientFromYaml(`
      openapi: "3.1.0"
      info: { title: Test, version: "1.0.0" }
      paths:
        /items:
          get:
            responses:
              "200":
                description: OK
    `);

    expect(contracts).toContain(
      'export class UnspecifiedApiError extends ApiError<number, unknown>'
    );
    expect(contracts).toContain('this.name = "UnspecifiedApiError"');
  });

  it('3.1-#64: client throws UnspecifiedApiError for unhandled status codes', () => {
    const { client } = generateClientFromYaml(`
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

    // Client has catch-all UnspecifiedApiError throw
    expect(client).toContain('throw new UnspecifiedApiError(result.status, result.data');
    // Client re-throws UnspecifiedApiError in catch block
    expect(client).toContain('if (error instanceof UnspecifiedApiError) throw error;');
  });

  // 3.1-#65: isError / isDefinedError type guard — Tier 1
  it('3.1-#65: generates isDefinedError type guard in client', () => {
    const { client } = generateClientFromYaml(`
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

    // Client exports isDefinedError (not isError — that's only in error-types.ts)
    expect(client).toContain('export function isDefinedError');
    // Type guard checks for ApiError and excludes UnspecifiedApiError
    expect(client).toContain('if (err instanceof UnspecifiedApiError) return false;');
    expect(client).toContain('if (!(err instanceof ApiError)) return false;');
    // Type guard returns boolean indicating err is E
    expect(client).toContain('err is E');
  });

  // 3.1-#66: per-operation error unions — Tier 1
  it('3.1-#66: generates per-operation error union type', () => {
    const { contracts } = generateClientFromYaml(`
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

    // Per-operation error types for each status
    expect(contracts).toContain('export type DeleteUsersUserIdError400 =');
    expect(contracts).toContain('export type DeleteUsersUserIdError404 = unknown;');
    // Union type combining all errors
    expect(contracts).toContain('export type DeleteUsersUserIdErrors =');
    expect(contracts).toMatch(
      /DeleteUsersUserIdErrors = ApiError<400, DeleteUsersUserIdError400> \| ApiError<404, DeleteUsersUserIdError404>/
    );
  });

  it('3.1-#66: operation with no error responses has no error types', () => {
    const { contracts } = generateClientFromYaml(`
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

    // No error types generated
    expect(contracts).not.toContain('Error200');
    expect(contracts).not.toContain('Errors =');
  });

  // 3.1-#67: default error body — Tier 1
  // Note: DefaultErrorBody is only generated by error-types.ts (separate module),
  // NOT by contracts-generator. In contracts-generator, default responses are
  // excluded from error type generation. The "default error body" concept exists
  // in error-types.ts as `DefaultErrorBody = unknown` when `default` response is used.
  it('3.1-#67: contracts-generator does NOT emit DefaultErrorBody (only error-types.ts does)', () => {
    const { contracts } = generateClientFromYaml(`
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

    // contracts-generator does NOT emit DefaultErrorBody
    expect(contracts).not.toContain('DefaultErrorBody');
    // Explicit error codes are still generated
    expect(contracts).toContain('export type PostItemsError400 = unknown;');
    expect(contracts).toContain('export type PostItemsErrors =');
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

    // Separate type per status code
    expect(contracts).toContain('export type PostSubmitError400 =');
    expect(contracts).toContain('export type PostSubmitError401 = unknown;');
    expect(contracts).toContain('export type PostSubmitError403 = unknown;');
    expect(contracts).toContain('export type PostSubmitError429 =');
    // Error union includes all
    expect(contracts).toContain('export type PostSubmitErrors =');
    expect(contracts).toMatch(/ApiError<400, PostSubmitError400>/);
    expect(contracts).toMatch(/ApiError<401, PostSubmitError401>/);
    expect(contracts).toMatch(/ApiError<403, PostSubmitError403>/);
    expect(contracts).toMatch(/ApiError<429, PostSubmitError429>/);
    // Client: status-specific checks
    expect(client).toContain('result.status === 400');
    expect(client).toContain('result.status === 401');
    expect(client).toContain('result.status === 403');
    expect(client).toContain('result.status === 429');
  });

  // 3.1-#69: error response mapping — Tier 1
  it('3.1-#69: maps each error response to a typed ApiError throw in client', () => {
    const { client } = generateClientFromYaml(`
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

    // Client: error status checks ordered by spec
    expect(client).toContain('result.status === 400');
    expect(client).toContain('throw new ApiError(400, result.data as GetOrdersOrderIdError400');
    expect(client).toContain('result.status === 404');
    expect(client).toContain('throw new ApiError(404, result.data as GetOrdersOrderIdError404');
    // Client: catch-all UnspecifiedApiError after specific checks
    expect(client).toContain('throw new UnspecifiedApiError(result.status, result.data');
  });

  it('3.1-#69: error types use unknown when no schema provided', () => {
    const { contracts } = generateClientFromYaml(`
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

    // No content on error response → unknown type
    expect(contracts).toContain('export type PostResetError500 = unknown;');
    expect(contracts).toContain('export type PostResetErrors = ApiError<500, PostResetError500>;');
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

    // Binary success → StreamResponse
    expect(contracts).toContain('export type GetExportFormatResponse = StreamResponse;');
    // Error types still generated
    expect(contracts).toContain('export type GetExportFormatError400 =');
    expect(contracts).toContain('export type GetExportFormatError404 = unknown;');
    expect(contracts).toContain('export type GetExportFormatErrors =');
    // Client: stream response + error checks
    expect(client).toContain('expectStream: true');
    expect(client).toContain('result.status === 400');
    expect(client).toContain('result.status === 404');
    // Client: checks result IS a StreamResponse (not ErrorResponse)
    expect(client).toContain('if (!(result instanceof StreamResponse))');
  });

  it('RequesterFailError is generated in contracts', () => {
    const { contracts } = generateClientFromYaml(`
      openapi: "3.1.0"
      info: { title: Test, version: "1.0.0" }
      paths:
        /ping:
          get:
            responses:
              "200":
                description: OK
    `);

    expect(contracts).toContain('export class RequesterFailError extends Error');
    expect(contracts).toContain('this.name = "RequesterFailError"');
  });

  it('client wraps non-ApiError exceptions in RequesterFailError', () => {
    const { client } = generateClientFromYaml(`
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

    // Client: catch block wraps unexpected errors
    expect(client).toContain('throw new RequesterFailError(error);');
    // Client: re-throws ApiError and UnspecifiedApiError
    expect(client).toContain('if (error instanceof UnspecifiedApiError) throw error;');
    expect(client).toContain('if (error instanceof ApiError) throw error;');
  });
});
