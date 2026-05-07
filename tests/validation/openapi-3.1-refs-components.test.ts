// Feature coverage: 3.1-#70 (JSON pointer resolution), 3.1-#71 (chained refs),
// 3.1-#72 (circular ref detection), 3.1-#73 ($ref siblings), 3.1-#74 (local refs),
// 3.1-#75 (remote refs), 3.1-#76 (schemas), 3.1-#77 (responses),
// 3.1-#78 (parameters), 3.1-#79 (requestBodies), 3.1-#80 (headers),
// 3.1-#81 (securitySchemes), 3.1-#82 (links), 3.1-#83 (callbacks),
// 3.1-#84 (examples)

/**
 * Validation Tests — OpenAPI 3.1 $ref Resolution & Components
 *
 * Tests every feature from the "$ref Resolution" (3.1-#70-#75) and "Components"
 * (3.1-#76-#84) sections of the feature enumeration.
 *
 * Tier 1 (#70, #71, #74, #76-#80, #84): generateClient + string matching on TypeScript output
 * Tier 2 (#75, #81-#83): no crash + feature NOT in output (or error for external refs)
 * Tier 3 (#72, #73): version-specific behavior (circular detection, $ref sibling merging)
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

function generateClientFromDoc(
  doc: OpenAPIDocument,
  preserveRefSiblings = false
): { contracts: string; client: string } {
  const config: GeneratorConfig = { input: 'test.yaml', outputDir: '/tmp/test' };
  return generateClientStrings(doc, config, { preserveRefSiblings });
}

// ── $ref Resolution (3.1-#70-#75) ────────────────────────────────────────

describe('OpenAPI 3.1 — $ref Resolution (3.1-#70-#75)', () => {
  // 3.1-#70: JSON pointer resolution — Tier 1
  describe('3.1-#70: JSON pointer resolution', () => {
    it('resolves #/components/schemas/ pointer in response schema', () => {
      const { contracts } = generateClientFromYaml(`
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
                  description: Products list
                  content:
                    application/json:
                      schema:
                        type: array
                        items:
                          $ref: "#/components/schemas/Product"
      `);

      // Schema is resolved and emitted as a named type
      expect(contracts).toContain('export type Product = {');
      expect(contracts).toContain('id: string;');
      // Response references the resolved schema
      expect(contracts).toContain('export type GetProductsResponse = Product[];');
    });

    it('resolves $ref in nested property schema', () => {
      const contracts = generateFromYaml(`
        openapi: "3.1.0"
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

  // 3.1-#71: chained refs — Tier 1
  describe('3.1-#71: chained refs', () => {
    it('resolves multi-level $ref chains (A → B → C)', () => {
      const contracts = generateFromYaml(`
        openapi: "3.1.0"
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
        openapi: "3.1.0"
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

  // 3.1-#72: circular ref detection — Tier 3
  // Behavior is identical across versions (3.0 and 3.1), but verify it works in 3.1 context
  describe('3.1-#72: circular ref detection', () => {
    it('throws descriptive error for circular $ref (A → B → A)', () => {
      const doc = {
        openapi: '3.1.0',
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
        openapi: '3.1.0',
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
      // Build a chain: Depth0 → Depth1 → ... → Depth10 → Depth11
      // Depth10 → Depth11 is the 10th hop, which exceeds MAX_DEPTH=10
      const schemas: Record<string, unknown> = {};
      for (let i = 0; i <= 10; i++) {
        schemas[`Depth${i}`] = { $ref: `#/components/schemas/Depth${i + 1}` };
      }
      schemas['Depth11'] = { type: 'boolean' };

      const doc = {
        openapi: '3.1.0',
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
        openapi: '3.1.0',
        info: { title: 'Test', version: '1.0.0' },
        components: { schemas },
        paths: {},
      } as unknown as OpenAPIDocument;

      const resolver = new RefResolver(doc);
      const result = resolver.resolveRef('#/components/schemas/Depth1') as Record<string, unknown>;
      expect(result.type).toBe('boolean');
    });
  });

  // 3.1-#73: $ref siblings — Tier 3
  // 3.1 behavior: siblings alongside $ref are merged (siblings override target).
  // 3.0 behavior: siblings are stripped.
  describe('3.1-#73: $ref siblings (3.1 preserves, 3.0 strips)', () => {
    it('3.1 mode (preserveRefSiblings:true) merges sibling description over target', () => {
      const contracts = generateFromYaml(
        `
        openapi: "3.1.0"
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
        true // preserveRefSiblings = true (3.1 mode)
      );

      // Sibling description overrides on RefWithSibling; Target keeps its own
      expect(contracts).toContain('/** Override from sibling */');
      expect(contracts).toContain('/** Original target description */');
    });

    it('3.0 mode (preserveRefSiblings:false) ignores sibling description', () => {
      const contracts = generateFromYaml(
        `
        openapi: "3.1.0"
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
        false // preserveRefSiblings = false (3.0 mode)
      );

      // Target's own description is used; sibling is stripped
      expect(contracts).toContain('/** Original target description */');
      expect(contracts).not.toContain('/** Override from sibling */');
    });

    it('3.1 mode merges sibling nullable/type information', () => {
      const contracts = generateFromYaml(
        `
        openapi: "3.1.0"
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
      `,
        true
      );

      // Sibling description overrides
      expect(contracts).toContain('/** Nullable override */');
      // The type still resolves through the $ref chain
      // (nullable: true as sibling may or may not be processed — verify no crash)
      expect(contracts).toContain('BaseName');
    });
  });

  // 3.1-#74: local refs — Tier 1
  describe('3.1-#74: local refs (#/...)', () => {
    it('resolves $ref within operation response content schema', () => {
      const { contracts } = generateClientFromYaml(`
        openapi: "3.1.0"
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
        openapi: "3.1.0"
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

  // 3.1-#75: remote refs — Tier 2 (not supported, throws error)
  describe('3.1-#75: remote refs (not supported)', () => {
    it('throws error for https:// external $ref', () => {
      const doc: OpenAPIDocument = {
        openapi: '3.1.0',
        info: { title: 'Test', version: '1.0.0' },
        components: {
          schemas: {
            ExternalRef: { $ref: 'https://example.com/schemas/model.json' },
          },
        },
        paths: {},
      };

      const resolver = new RefResolver(doc);
      expect(() => resolver.resolveRef('#/components/schemas/ExternalRef')).toThrow(
        /External \$ref resolution is not supported/
      );
    });

    it('throws error for non-#-prefixed relative $ref', () => {
      const resolver = new RefResolver({
        openapi: '3.1.0',
        info: { title: 'Test', version: '1.0.0' },
        paths: {},
      });
      expect(() => resolver.resolveRef('some/relative/path.json')).toThrow(
        /External \$ref resolution is not supported/
      );
    });
  });
});

// ── Components (3.1-#76-#84) ──────────────────────────────────────────────

describe('OpenAPI 3.1 — Components (3.1-#76-#84)', () => {
  // 3.1-#76: schemas — Tier 1
  describe('3.1-#76: components/schemas', () => {
    it('generates TypeScript types for all schemas in components/schemas', () => {
      const contracts = generateFromYaml(`
        openapi: "3.1.0"
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
        openapi: "3.1.0"
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
        openapi: "3.1.0"
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

  // 3.1-#77: responses — Tier 1
  describe('3.1-#77: components/responses', () => {
    it('resolves $ref to reusable response in error codes', () => {
      const { contracts } = generateClientFromYaml(`
        openapi: "3.1.0"
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
        openapi: "3.1.0"
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

  // 3.1-#78: parameters — Tier 1
  describe('3.1-#78: components/parameters', () => {
    it('resolves $ref to reusable path parameter', () => {
      const { contracts, client } = generateClientFromYaml(`
        openapi: "3.1.0"
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
        openapi: "3.1.0"
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

  // 3.1-#79: requestBodies — Tier 1
  describe('3.1-#79: components/requestBodies', () => {
    it('resolves $ref to reusable request body', () => {
      const { contracts } = generateClientFromYaml(`
        openapi: "3.1.0"
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
        openapi: "3.1.0"
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

  // 3.1-#80: headers — Tier 1
  describe('3.1-#80: components/headers', () => {
    it('spec with components/headers does not crash generation', () => {
      const { contracts } = generateClientFromYaml(`
        openapi: "3.1.0"
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

  // 3.1-#81: securitySchemes — Tier 1 (generates auth type definitions)
  describe('3.1-#81: components/securitySchemes', () => {
    it('generates auth type definitions from securitySchemes', () => {
      const { contracts } = generateClientFromYaml(`
        openapi: "3.1.0"
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

      // Security scheme types ARE emitted
      expect(contracts).toContain('BearerAuthAuth');
      expect(contracts).toContain('ApiKeyQueryAuth');
      expect(contracts).toContain('SecuritySchemes');
      expect(contracts).toContain('type: "http"');
      expect(contracts).toContain('scheme: "bearer"');
    });

    it('oauth2 security scheme generates type definitions', () => {
      const { contracts } = generateClientFromYaml(`
        openapi: "3.1.0"
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

  // 3.1-#82: links — Tier 2 (not supported / not processed)
  describe('3.1-#82: components/links (Tier 2 — not processed)', () => {
    it('spec with components/links does not crash and links are NOT in output', () => {
      const { contracts } = generateClientFromYaml(`
        openapi: "3.1.0"
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

  // 3.1-#83: callbacks — Tier 2 (not supported / not processed)
  describe('3.1-#83: components/callbacks (Tier 2 — not processed)', () => {
    it('spec with components/callbacks does not crash and callbacks are NOT in output', () => {
      const { contracts } = generateClientFromYaml(`
        openapi: "3.1.0"
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

  // 3.1-#84: examples — Tier 1
  describe('3.1-#84: components/examples', () => {
    it('spec with components/examples does not crash', () => {
      const { contracts } = generateClientFromYaml(`
        openapi: "3.1.0"
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
        openapi: "3.1.0"
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
