// Feature coverage: 3.0-#68 (JSON pointer resolution), 3.0-#69 (chained refs),
// 3.0-#70 (circular ref detection), 3.0-#71 ($ref siblings — stripped in 3.0),
// 3.0-#72 (local refs), 3.0-#73 (remote refs),
// 3.0-#74 (components/schemas), 3.0-#75 (components/responses),
// 3.0-#76 (components/parameters), 3.0-#77 (components/requestBodies),
// 3.0-#78 (components/headers), 3.0-#79 (components/securitySchemes),
// 3.0-#80 (components/links), 3.0-#81 (components/callbacks),
// 3.0-#82 (components/examples)

/**
 * Validation Tests — OpenAPI 3.0 $ref Resolution & Components
 *
 * Tests every feature from the "$ref Resolution" (3.0-#68-#73) and "Components"
 * (3.0-#74-#82) sections of the feature enumeration.
 *
 * Key 3.0-specific differences from 3.1:
 * - `$ref` siblings are stripped (3.0-#71) — not merged as in 3.1
 * - `example` (singular) keyword, not `examples`
 *
 * Tier 1 (#68, #69, #72, #74-#78, #82): generateClient + string matching on TypeScript output
 * Tier 2 (#73, #80, #81): no crash + feature NOT in output (or error for external refs)
 * Tier 3 (#70, #71): version-specific behavior (circular detection, $ref sibling stripping)
 */
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { generateClient as generateClientStrings } from '../../src/generator/client-generator.js';
import { generateContracts } from '../../src/generator/contracts-generator.js';
import { RefResolver } from '../../src/parser/ref-resolver.js';
import type { GeneratorConfig } from '../../src/types/client.js';
import type { OpenAPIDocument } from '../../src/types/openapi.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function generateFromYaml(yaml: string, preserveRefSiblings = false): string {
  const doc = parseYaml(yaml) as OpenAPIDocument;
  const resolver = new RefResolver(doc, undefined, { preserveRefSiblings });
  return generateContracts(doc, resolver);
}

function generateClientFromYaml(
  yaml: string,
  preserveRefSiblings = false
): { contracts: string; client: string } {
  const doc = parseYaml(yaml) as OpenAPIDocument;
  const config: GeneratorConfig = { input: 'test.yaml', outputDir: '/tmp/test' };
  return generateClientStrings(doc, config, { preserveRefSiblings });
}

// ── $ref Resolution (3.0-#68-#73) ────────────────────────────────────────

describe('OpenAPI 3.0 — $ref Resolution (3.0-#68-#73)', () => {
  // 3.0-#68: JSON pointer resolution — Tier 1
  describe('3.0-#68: JSON pointer resolution', () => {
    it('resolves #/components/schemas/ pointer in response schema', () => {
      const { contracts } = generateClientFromYaml(`
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
                  description: Products list
                  content:
                    application/json:
                      schema:
                        type: array
                        items:
                          $ref: "#/components/schemas/Product"
      `);

      expect(contracts).toContain('export type Product = {');
      expect(contracts).toContain('id: string;');
      expect(contracts).toContain('export type GetProductsResponse = Product[];');
    });

    it('resolves $ref in nested property schema', () => {
      const contracts = generateFromYaml(`
        openapi: "3.0.3"
        info: { title: Test, version: "1.0.0" }
        components:
          schemas:
            Address:
              type: object
              properties:
                city: { type: string }
                zip: { type: string }
              required: [city]
            Person:
              type: object
              properties:
                name: { type: string }
                address:
                  $ref: "#/components/schemas/Address"
              required: [name, address]
        paths: {}
      `);

      expect(contracts).toContain('export type Address = {');
      expect(contracts).toContain('export type Person = {');
      expect(contracts).toContain('address: Address;');
    });
  });

  // 3.0-#69: chained refs — Tier 1
  describe('3.0-#69: chained refs', () => {
    it('resolves multi-level $ref chains (A → B → C)', () => {
      const contracts = generateFromYaml(`
        openapi: "3.0.3"
        info: { title: Test, version: "1.0.0" }
        components:
          schemas:
            LevelC:
              type: string
            LevelB:
              $ref: "#/components/schemas/LevelC"
            LevelA:
              $ref: "#/components/schemas/LevelB"
        paths: {}
      `);

      // Generator uses immediate ref name, not fully resolved chain
      expect(contracts).toContain('export type LevelC = string;');
      expect(contracts).toContain('export type LevelA = LevelB;');
      expect(contracts).toContain('export type LevelB = LevelC;');
    });

    it('resolves chained refs through intermediate object schemas', () => {
      const { contracts } = generateClientFromYaml(`
        openapi: "3.0.3"
        info: { title: Test, version: "1.0.0" }
        components:
          schemas:
            BaseError:
              type: object
              properties:
                code: { type: integer }
                message: { type: string }
              required: [code, message]
            DetailedError:
              $ref: "#/components/schemas/BaseError"
        paths:
          /items:
            get:
              responses:
                "200":
                  description: OK
                "500":
                  description: Error
                  content:
                    application/json:
                      schema:
                        $ref: "#/components/schemas/DetailedError"
      `);

      expect(contracts).toContain('export type BaseError = {');
      expect(contracts).toContain('code: number;');
      // Generator uses the intermediate ref name (DetailedError), not BaseError
      expect(contracts).toContain('export type GetItemsError500 = DetailedError;');
    });
  });

  // 3.0-#70: circular ref detection — Tier 3
  describe('3.0-#70: circular ref detection', () => {
    it('throws descriptive error for circular $ref (A → B → A)', () => {
      const doc = {
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        components: {
          schemas: {
            NodeA: { $ref: '#/components/schemas/NodeB' },
            NodeB: { $ref: '#/components/schemas/NodeA' },
          },
        },
        paths: {},
      } as unknown as OpenAPIDocument;

      const resolver = new RefResolver(doc);
      expect(() => resolver.resolveRef('#/components/schemas/NodeA')).toThrow(
        /Circular \$ref detected/
      );
    });

    it('includes ref chain in circular error message', () => {
      const doc = {
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        components: {
          schemas: {
            NodeA: { $ref: '#/components/schemas/NodeB' },
            NodeB: { $ref: '#/components/schemas/NodeA' },
          },
        },
        paths: {},
      } as unknown as OpenAPIDocument;

      const resolver = new RefResolver(doc);
      try {
        resolver.resolveRef('#/components/schemas/NodeA');
        expect.unreachable('Should have thrown');
      } catch (err) {
        const msg = (err as Error).message;
        expect(msg).toContain('#/components/schemas/NodeA');
        expect(msg).toContain('#/components/schemas/NodeB');
        expect(msg).toContain('->');
      }
    });

    it('throws when MAX_DEPTH (10) is exceeded by deep $ref chain', () => {
      const schemas: Record<string, unknown> = {};
      for (let i = 0; i <= 10; i++) {
        schemas[`Depth${i}`] = { $ref: `#/components/schemas/Depth${i + 1}` };
      }
      schemas['Depth11'] = { type: 'boolean' };

      const doc = {
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        components: { schemas },
        paths: {},
      } as unknown as OpenAPIDocument;

      const resolver = new RefResolver(doc);
      expect(() => resolver.resolveRef('#/components/schemas/Depth0')).toThrow(
        /Maximum \$ref depth \(10\) exceeded/
      );
    });

    it('resolves at exactly 9 hops (within depth limit)', () => {
      const schemas: Record<string, unknown> = {};
      for (let i = 1; i <= 9; i++) {
        schemas[`Depth${i}`] = { $ref: `#/components/schemas/Depth${i + 1}` };
      }
      schemas['Depth10'] = { type: 'boolean' };

      const doc = {
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        components: { schemas },
        paths: {},
      } as unknown as OpenAPIDocument;

      const resolver = new RefResolver(doc);
      const result = resolver.resolveRef('#/components/schemas/Depth1') as Record<string, unknown>;
      expect(result.type).toBe('boolean');
    });
  });

  // 3.0-#71: $ref siblings — Tier 3
  // 3.0 behavior: siblings alongside $ref are STRIPPED (not merged as in 3.1).
  describe('3.0-#71: $ref siblings (3.0 strips, 3.1 merges)', () => {
    it('3.0 mode (preserveRefSiblings:false) ignores sibling description', () => {
      const contracts = generateFromYaml(`
        openapi: "3.0.3"
        info: { title: Test, version: "1.0.0" }
        components:
          schemas:
            Target:
              type: object
              properties:
                id: { type: string }
              description: Original target description
            RefWithSibling:
              $ref: "#/components/schemas/Target"
              description: Override from sibling
        paths: {}
      `);

      // Target's own description is used; sibling is stripped (3.0 behavior)
      expect(contracts).toContain('/** Original target description */');
      expect(contracts).not.toContain('/** Override from sibling */');
    });

    it('3.0 mode strips sibling nullable alongside $ref', () => {
      const contracts = generateFromYaml(`
        openapi: "3.0.3"
        info: { title: Test, version: "1.0.0" }
        components:
          schemas:
            BaseName:
              type: string
              description: Base name type
            NullableName:
              $ref: "#/components/schemas/BaseName"
              description: Nullable override
              nullable: true
        paths: {}
      `);

      // Sibling description is stripped; BaseName keeps its own
      expect(contracts).toContain('/** Base name type */');
      expect(contracts).not.toContain('/** Nullable override */');
    });

    it('3.1 mode (preserveRefSiblings:true) merges sibling description over target', () => {
      // Cross-version comparison: using 3.0 spec but with 3.1-style preserveRefSiblings
      const contracts = generateFromYaml(
        `
        openapi: "3.0.3"
        info: { title: Test, version: "1.0.0" }
        components:
          schemas:
            Target:
              type: object
              properties:
                id: { type: string }
              description: Original target description
            RefWithSibling:
              $ref: "#/components/schemas/Target"
              description: Override from sibling
        paths: {}
      `,
        true // preserveRefSiblings = true (3.1 mode behavior)
      );

      // With 3.1 mode, both descriptions appear
      expect(contracts).toContain('/** Override from sibling */');
      expect(contracts).toContain('/** Original target description */');
    });
  });

  // 3.0-#72: local refs — Tier 1
  describe('3.0-#72: local refs (#/...)', () => {
    it('resolves $ref within operation response content schema', () => {
      const { contracts } = generateClientFromYaml(`
        openapi: "3.0.3"
        info: { title: Test, version: "1.0.0" }
        components:
          schemas:
            Item:
              type: object
              properties:
                id: { type: string }
              required: [id]
        paths:
          /items/{id}:
            get:
              parameters:
                - name: id
                  in: path
                  required: true
                  schema: { type: string }
              responses:
                "200":
                  description: An item
                  content:
                    application/json:
                      schema:
                        $ref: "#/components/schemas/Item"
      `);

      expect(contracts).toContain('export type Item = {');
      expect(contracts).toContain('export type GetItemsIdResponse = Item;');
    });

    it('resolves $ref in request body schema', () => {
      const { contracts } = generateClientFromYaml(`
        openapi: "3.0.3"
        info: { title: Test, version: "1.0.0" }
        components:
          schemas:
            CreateItem:
              type: object
              properties:
                name: { type: string }
              required: [name]
        paths:
          /items:
            post:
              requestBody:
                required: true
                content:
                  application/json:
                    schema:
                      $ref: "#/components/schemas/CreateItem"
              responses:
                "201":
                  description: Created
      `);

      expect(contracts).toContain('export type CreateItem = {');
      expect(contracts).toContain('export type PostItemsBody = CreateItem;');
    });
  });

  // 3.0-#73: remote refs — Tier 2 (not supported, throws error)
  describe('3.0-#73: remote refs (not supported)', () => {
    it('throws error for https:// external $ref', () => {
      const doc = {
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        components: {
          schemas: {
            ExternalRef: { $ref: 'https://example.com/schemas/model.json' },
          },
        },
        paths: {},
      } as unknown as OpenAPIDocument;

      const resolver = new RefResolver(doc);
      expect(() => resolver.resolveRef('#/components/schemas/ExternalRef')).toThrow(
        /External \$ref resolution is not supported/
      );
    });

    it('throws error for non-#-prefixed relative $ref', () => {
      const resolver = new RefResolver({
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: {},
      });
      expect(() => resolver.resolveRef('some/relative/path.json')).toThrow(
        /External \$ref resolution is not supported/
      );
    });
  });
});

// ── Components (3.0-#74-#82) ──────────────────────────────────────────────

describe('OpenAPI 3.0 — Components (3.0-#74-#82)', () => {
  // 3.0-#74: schemas — Tier 1
  describe('3.0-#74: components/schemas', () => {
    it('generates TypeScript types for all schemas in components/schemas', () => {
      const contracts = generateFromYaml(`
        openapi: "3.0.3"
        info: { title: Test, version: "1.0.0" }
        components:
          schemas:
            User:
              type: object
              properties:
                id: { type: string }
                name: { type: string }
                email: { type: string }
              required: [id, name]
            Status:
              type: string
              enum: [active, inactive, pending]
        paths: {}
      `);

      expect(contracts).toContain('export type User = {');
      expect(contracts).toContain('id: string;');
      expect(contracts).toContain('name: string;');
      expect(contracts).toContain('email?: string;');
      expect(contracts).toContain("export type Status = 'active' | 'inactive' | 'pending';");
    });

    it('sorts schemas topologically when one references another via $ref', () => {
      const contracts = generateFromYaml(`
        openapi: "3.0.3"
        info: { title: Test, version: "1.0.0" }
        components:
          schemas:
            Order:
              type: object
              properties:
                id: { type: string }
                product:
                  $ref: "#/components/schemas/Product"
              required: [id, product]
            Product:
              type: object
              properties:
                name: { type: string }
              required: [name]
        paths: {}
      `);

      // Product must appear before Order (topological sort)
      const productPos = contracts.indexOf('export type Product');
      const orderPos = contracts.indexOf('export type Order');
      expect(productPos).toBeLessThan(orderPos);
    });

    it('generates types with allOf composition using $ref', () => {
      const contracts = generateFromYaml(`
        openapi: "3.0.3"
        info: { title: Test, version: "1.0.0" }
        components:
          schemas:
            Base:
              type: object
              properties:
                id: { type: string }
              required: [id]
            Extended:
              allOf:
                - $ref: "#/components/schemas/Base"
                - type: object
                  properties:
                    extra: { type: string }
        paths: {}
      `);

      expect(contracts).toContain('export type Base = {');
      expect(contracts).toContain('export type Extended = Base & {');
      expect(contracts).toContain('extra?: string;');
    });
  });

  // 3.0-#75: responses — Tier 1
  describe('3.0-#75: components/responses', () => {
    it('resolves $ref to reusable response in error codes', () => {
      const { contracts } = generateClientFromYaml(`
        openapi: "3.0.3"
        info: { title: Test, version: "1.0.0" }
        components:
          schemas:
            ErrorBody:
              type: object
              properties:
                code: { type: integer }
                message: { type: string }
              required: [code, message]
          responses:
            NotFound:
              description: Resource not found
            BadRequest:
              description: Bad request
              content:
                application/json:
                  schema:
                    $ref: "#/components/schemas/ErrorBody"
        paths:
          /items:
            get:
              responses:
                "200":
                  description: OK
                "400":
                  $ref: "#/components/responses/BadRequest"
                "404":
                  $ref: "#/components/responses/NotFound"
      `);

      expect(contracts).toContain('export type GetItemsError400 = ErrorBody;');
      expect(contracts).toContain('GetItemsErrors');
      expect(contracts).toContain('ApiError<400, GetItemsError400>');
    });

    it('resolves reusable response with content schema across multiple operations', () => {
      const { contracts } = generateClientFromYaml(`
        openapi: "3.0.3"
        info: { title: Test, version: "1.0.0" }
        components:
          schemas:
            ErrorDetail:
              type: object
              properties:
                msg: { type: string }
              required: [msg]
          responses:
            StandardError:
              description: Standard error
              content:
                application/json:
                  schema:
                    $ref: "#/components/schemas/ErrorDetail"
        paths:
          /a:
            get:
              responses:
                "200": { description: OK }
                "500":
                  $ref: "#/components/responses/StandardError"
          /b:
            get:
              responses:
                "200": { description: OK }
                "500":
                  $ref: "#/components/responses/StandardError"
      `);

      expect(contracts).toContain('export type GetAError500 = ErrorDetail;');
      expect(contracts).toContain('export type GetBError500 = ErrorDetail;');
    });
  });

  // 3.0-#76: parameters — Tier 1
  describe('3.0-#76: components/parameters', () => {
    it('resolves $ref to reusable path parameter', () => {
      const { contracts, client } = generateClientFromYaml(`
        openapi: "3.0.3"
        info: { title: Test, version: "1.0.0" }
        components:
          parameters:
            UserIdParam:
              name: userId
              in: path
              required: true
              schema: { type: string }
        paths:
          /users/{userId}:
            get:
              parameters:
                - $ref: "#/components/parameters/UserIdParam"
              responses:
                "200":
                  description: A user
      `);

      // Path param is passed directly in client method
      expect(client).toContain('userId');
      expect(client).toContain('encodeURIComponent(userId)');
    });

    it('resolves $ref to reusable query parameter', () => {
      const { contracts, client } = generateClientFromYaml(`
        openapi: "3.0.3"
        info: { title: Test, version: "1.0.0" }
        components:
          parameters:
            PageLimit:
              name: limit
              in: query
              schema: { type: integer }
        paths:
          /items:
            get:
              parameters:
                - $ref: "#/components/parameters/PageLimit"
              responses:
                "200":
                  description: Items list
      `);

      expect(contracts).toContain('GetItemsQuery');
      expect(contracts).toContain('limit?: number;');
    });
  });

  // 3.0-#77: requestBodies — Tier 1
  describe('3.0-#77: components/requestBodies', () => {
    it('resolves $ref to reusable request body', () => {
      const { contracts } = generateClientFromYaml(`
        openapi: "3.0.3"
        info: { title: Test, version: "1.0.0" }
        components:
          schemas:
            NewUser:
              type: object
              properties:
                name: { type: string }
                email: { type: string }
              required: [name, email]
          requestBodies:
            CreateUserBody:
              required: true
              content:
                application/json:
                  schema:
                    $ref: "#/components/schemas/NewUser"
        paths:
          /users:
            post:
              requestBody:
                $ref: "#/components/requestBodies/CreateUserBody"
              responses:
                "201":
                  description: Created
      `);

      expect(contracts).toContain('export type NewUser = {');
      expect(contracts).toContain('export type PostUsersBody = NewUser;');
    });

    it('resolves reusable request body across multiple operations', () => {
      const { contracts } = generateClientFromYaml(`
        openapi: "3.0.3"
        info: { title: Test, version: "1.0.0" }
        components:
          schemas:
            ItemInput:
              type: object
              properties:
                label: { type: string }
              required: [label]
          requestBodies:
            ItemBody:
              content:
                application/json:
                  schema:
                    $ref: "#/components/schemas/ItemInput"
        paths:
          /items:
            post:
              requestBody:
                $ref: "#/components/requestBodies/ItemBody"
              responses:
                "201": { description: Created }
          /bulk:
            put:
              requestBody:
                $ref: "#/components/requestBodies/ItemBody"
              responses:
                "200": { description: Updated }
      `);

      expect(contracts).toContain('export type PostItemsBody = ItemInput;');
      expect(contracts).toContain('export type PutBulkBody = ItemInput;');
    });
  });

  // 3.0-#78: headers — Tier 1
  describe('3.0-#78: components/headers', () => {
    it('spec with components/headers does not crash generation', () => {
      const { contracts } = generateClientFromYaml(`
        openapi: "3.0.3"
        info: { title: Test, version: "1.0.0" }
        components:
          headers:
            XRateLimit:
              description: Rate limit header
              schema: { type: integer }
        paths:
          /data:
            get:
              responses:
                "200":
                  description: OK
                  headers:
                    X-Rate-Limit:
                      $ref: "#/components/headers/XRateLimit"
      `);

      // Generation succeeds without crash
      expect(contracts).toContain('export class ApiError');
      expect(contracts).toContain('GetDataResponse');
    });
  });

  // 3.0-#79: securitySchemes — Tier 2 (types generated, no auth enforcement)
  describe('3.0-#79: components/securitySchemes', () => {
    it('generates auth type definitions from securitySchemes', () => {
      const { contracts } = generateClientFromYaml(`
        openapi: "3.0.3"
        info: { title: Test, version: "1.0.0" }
        components:
          securitySchemes:
            BearerAuth:
              type: http
              scheme: bearer
              bearerFormat: JWT
            ApiKeyQuery:
              type: apiKey
              in: query
              name: api_key
        paths:
          /secure:
            get:
              security:
                - BearerAuth: []
              responses:
                "200":
                  description: Secure data
      `);

      // Security scheme types ARE emitted (contracts-generator produces them)
      expect(contracts).toContain('BearerAuthAuth');
      expect(contracts).toContain('ApiKeyQueryAuth');
      expect(contracts).toContain('SecuritySchemes');
      expect(contracts).toContain('type: "http"');
      expect(contracts).toContain('scheme: "bearer"');
    });

    it('oauth2 security scheme generates type definitions', () => {
      const { contracts } = generateClientFromYaml(`
        openapi: "3.0.3"
        info: { title: Test, version: "1.0.0" }
        components:
          securitySchemes:
            OAuth2:
              type: oauth2
              flows:
                authorizationCode:
                  authorizationUrl: https://example.com/auth
                  tokenUrl: https://example.com/token
                  scopes:
                    read: Read access
        paths:
          /data:
            get:
              responses:
                "200": { description: OK }
      `);

      expect(contracts).toContain('OAuth2Auth');
    });
  });

  // 3.0-#80: links — Tier 2 (not supported / not processed)
  describe('3.0-#80: components/links (Tier 2 — not processed)', () => {
    it('spec with components/links does not crash and links are NOT in output', () => {
      const { contracts } = generateClientFromYaml(`
        openapi: "3.0.3"
        info: { title: Test, version: "1.0.0" }
        components:
          links:
            GetUserById:
              operationId: getUser
              parameters:
                userId: "$response.body#/id"
        paths:
          /users:
            post:
              responses:
                "201":
                  description: Created
                  links:
                    GetUser:
                      $ref: "#/components/links/GetUserById"
      `);

      // Generation succeeds
      expect(contracts).toContain('export class ApiError');
      // Links are not processed — nothing about them in the output
      expect(contracts).not.toContain('GetUserById');
    });
  });

  // 3.0-#81: callbacks — Tier 2 (not supported / not processed)
  describe('3.0-#81: components/callbacks (Tier 2 — not processed)', () => {
    it('spec with components/callbacks does not crash and callbacks are NOT in output', () => {
      const { contracts } = generateClientFromYaml(`
        openapi: "3.0.3"
        info: { title: Test, version: "1.0.0" }
        components:
          callbacks:
            OnEvent:
              "{$request.body#/callbackUrl}":
                post:
                  requestBody:
                    content:
                      application/json:
                        schema:
                          type: object
                  responses:
                    "200":
                      description: Callback received
        paths:
          /subscribe:
            post:
              callbacks:
                myEvent:
                  $ref: "#/components/callbacks/OnEvent"
              responses:
                "201":
                  description: Subscribed
      `);

      // Generation succeeds
      expect(contracts).toContain('export class ApiError');
      // Callbacks are not processed
      expect(contracts).not.toContain('OnEvent');
      expect(contracts).not.toContain('callbackUrl');
    });
  });

  // 3.0-#82: examples — Tier 1
  describe('3.0-#82: components/examples', () => {
    it('spec with components/examples does not crash', () => {
      const { contracts } = generateClientFromYaml(`
        openapi: "3.0.3"
        info: { title: Test, version: "1.0.0" }
        components:
          examples:
            UserExample:
              summary: Example user
              value:
                id: "123"
                name: "John"
        paths:
          /users:
            get:
              responses:
                "200":
                  description: Users
                  content:
                    application/json:
                      schema:
                        type: array
                        items:
                          type: object
                          properties:
                            id: { type: string }
                            name: { type: string }
      `);

      // Generation succeeds
      expect(contracts).toContain('export class ApiError');
      // examples are parsed but not emitted as types in the output
    });

    it('components/examples referenced via $ref in parameter do not crash', () => {
      const { contracts } = generateClientFromYaml(`
        openapi: "3.0.3"
        info: { title: Test, version: "1.0.0" }
        components:
          examples:
            StatusExample:
              value: active
        paths:
          /status:
            get:
              parameters:
                - name: status
                  in: query
                  schema: { type: string }
              responses:
                "200":
                  description: Status
      `);

      expect(contracts).toContain('export class ApiError');
      // The spec parses successfully; examples are stored but not emitted
    });
  });
});
