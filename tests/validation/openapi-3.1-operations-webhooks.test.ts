// Feature coverage: 3.1-#95 (openIdConnect), 3.1-#96 (security requirements),
// 3.1-#97 (server URLs), 3.1-#98 (server variables), 3.1-#99 (enum for variables),
// 3.1-#100 (default variable values), 3.1-#101 (multiple servers),
// 3.1-#102 (GET), 3.1-#103 (POST), 3.1-#104 (PUT), 3.1-#105 (PATCH),
// 3.1-#106 (DELETE), 3.1-#107 (OPTIONS), 3.1-#108 (HEAD), 3.1-#109 (TRACE),
// 3.1-#110 (operationId), 3.1-#111 (summary), 3.1-#112 (description),
// 3.1-#113 (tags), 3.1-#114 (deprecated operation)

/**
 * Validation Tests — OpenAPI 3.1 Path Operations, Servers & Security
 *
 * Tests every feature from the "Security Schemes" (3.1-#95-#96), "Servers"
 * (3.1-#97-#101), and "Path Operations" (3.1-#102-#114) sections of the
 * feature enumeration.
 *
 * Tier 1 (most features): generateClient + string matching on TypeScript output
 * Tier 2 (#95, #96): verify no crash + type defs generated but no enforcement code
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

function generateClientFromYaml(
  yaml: string,
  config?: Partial<GeneratorConfig>
): { contracts: string; client: string } {
  const doc = parseYaml(yaml) as OpenAPIDocument;
  const fullConfig: GeneratorConfig = {
    input: 'test.yaml',
    outputDir: '/tmp/test',
    ...config,
  };
  return generateClientStrings(doc, fullConfig);
}

// ── Security Schemes (3.1-#95-#96) ────────────────────────────────────────

describe('OpenAPI 3.1 — Security Schemes (3.1-#95-#96)', () => {
  // 3.1-#95: openIdConnect — Tier 2
  it('3.1-#95: openIdConnect scheme generates type def with openIdConnectUrl', () => {
    const contracts = generateFromYaml(`
      openapi: "3.1.0"
      info: { title: Test, version: "1.0.0" }
      paths: {}
      components:
        securitySchemes:
          oidc:
            type: openIdConnect
            openIdConnectUrl: "https://example.com/.well-known/openid-configuration"
    `);

    expect(contracts).toMatchSnapshot();
  });

  // 3.1-#96: security requirements — Tier 2
  it('3.1-#96: security requirements on operations do not generate enforcement code', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
      info: { title: Test, version: "1.0.0" }
      paths:
        /secure:
          get:
            security:
              - bearerAuth: []
            responses:
              "200": { description: OK }
      components:
        securitySchemes:
          bearerAuth:
            type: http
            scheme: bearer
            bearerFormat: JWT
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
    // But the client method does NOT include any auth/token enforcement
    expect(client).not.toContain('Authorization');
    expect(client).not.toContain('bearer');
    expect(client).not.toContain('token');
  });
});

// ── Servers (3.1-#97-#101) ────────────────────────────────────────────────

describe('OpenAPI 3.1 — Servers (3.1-#97-#101)', () => {
  // 3.1-#97: server URLs — Tier 1
  it('3.1-#97: server URLs produce ServerParams comment in contracts', () => {
    const contracts = generateFromYaml(`
      openapi: "3.1.0"
      info: { title: Test, version: "1.0.0" }
      paths: {}
      servers:
        - url: "https://api.example.com/v1"
    `);

    expect(contracts).toMatchSnapshot();
  });

  // 3.1-#98: server variables — Tier 1
  it('3.1-#98: server variables generate ServerParams interface', () => {
    const contracts = generateFromYaml(`
      openapi: "3.1.0"
      info: { title: Test, version: "1.0.0" }
      paths: {}
      servers:
        - url: "https://{env}.api.example.com"
          variables:
            env:
              default: production
    `);

    expect(contracts).toMatchSnapshot();
  });

  // 3.1-#99: enum for variables — Tier 1
  it('3.1-#99: server variable enum restricts type to string literal union', () => {
    const contracts = generateFromYaml(`
      openapi: "3.1.0"
      info: { title: Test, version: "1.0.0" }
      paths: {}
      servers:
        - url: "https://{env}.api.example.com"
          variables:
            env:
              default: production
              enum: [production, staging, development]
    `);

    expect(contracts).toMatchSnapshot();
  });

  // 3.1-#100: default variable values — Tier 1
  it('3.1-#100: default variable values emitted as @default JSDoc', () => {
    const contracts = generateFromYaml(`
      openapi: "3.1.0"
      info: { title: Test, version: "1.0.0" }
      paths: {}
      servers:
        - url: "https://{env}.api.example.com"
          variables:
            env:
              default: production
              description: The deployment environment
    `);

    expect(contracts).toMatchSnapshot();
  });

  // 3.1-#101: multiple servers — Tier 1
  it('3.1-#101: multiple servers generate numbered ServerParams interfaces', () => {
    const contracts = generateFromYaml(`
      openapi: "3.1.0"
      info: { title: Test, version: "1.0.0" }
      paths: {}
      servers:
        - url: "https://api.example.com/{version}"
          variables:
            version:
              default: v1
        - url: "https://sandbox.api.example.com/{version}"
          variables:
            version:
              default: v2
    `);

    expect(contracts).toMatchSnapshot();
  });
});

// ── Path Operations: HTTP Methods (3.1-#102-#109) ─────────────────────────

describe('OpenAPI 3.1 — HTTP Methods (3.1-#102-#109)', () => {
  // 3.1-#102: GET — Tier 1
  it('3.1-#102: GET operation generates client method with GET request', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
      info: { title: Test, version: "1.0.0" }
      paths:
        /items:
          get:
            responses:
              "200":
                description: List
                content:
                  application/json:
                    schema:
                      type: array
                      items:
                        type: string
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  // 3.1-#103: POST — Tier 1
  it('3.1-#103: POST operation generates client method with body parameter', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
      info: { title: Test, version: "1.0.0" }
      paths:
        /items:
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
                      required: [id]
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  // 3.1-#104: PUT — Tier 1
  it('3.1-#104: PUT operation generates client method with body and path params', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
      info: { title: Test, version: "1.0.0" }
      paths:
        /items/{id}:
          put:
            parameters:
              - name: id
                in: path
                required: true
                schema: { type: string }
            requestBody:
              required: true
              content:
                application/json:
                  schema:
                    type: object
                    properties:
                      name: { type: string }
            responses:
              "200": { description: Updated }
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  // 3.1-#105: PATCH — Tier 1
  it('3.1-#105: PATCH operation generates client method', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
      info: { title: Test, version: "1.0.0" }
      paths:
        /items/{id}:
          patch:
            parameters:
              - name: id
                in: path
                required: true
                schema: { type: string }
            requestBody:
              required: true
              content:
                application/json:
                  schema:
                    type: object
                    properties:
                      name: { type: string }
            responses:
              "200": { description: Patched }
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  // 3.1-#106: DELETE — Tier 1
  it('3.1-#106: DELETE operation generates client method', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
      info: { title: Test, version: "1.0.0" }
      paths:
        /items/{id}:
          delete:
            parameters:
              - name: id
                in: path
                required: true
                schema: { type: string }
            responses:
              "204": { description: Deleted }
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  // 3.1-#107: OPTIONS — Tier 1
  it('3.1-#107: OPTIONS operation generates client method', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
      info: { title: Test, version: "1.0.0" }
      paths:
        /items:
          options:
            responses:
              "200": { description: CORS }
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  // 3.1-#108: HEAD — Tier 1
  it('3.1-#108: HEAD operation generates client method', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
      info: { title: Test, version: "1.0.0" }
      paths:
        /items:
          head:
            responses:
              "200": { description: Headers }
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  // 3.1-#109: TRACE — Tier 1
  it('3.1-#109: TRACE operation generates client method', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
      info: { title: Test, version: "1.0.0" }
      paths:
        /items:
          trace:
            responses:
              "200": { description: Debug }
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  // Combined: all HTTP methods on the same path
  it('3.1-#102-#109: all 8 HTTP methods on one path generate 8 distinct methods', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
      info: { title: Test, version: "1.0.0" }
      paths:
        /resource:
          get:
            responses:
              "200": { description: OK }
          post:
            responses:
              "201": { description: Created }
          put:
            responses:
              "200": { description: Updated }
          patch:
            responses:
              "200": { description: Patched }
          delete:
            responses:
              "204": { description: Deleted }
          options:
            responses:
              "200": { description: CORS }
          head:
            responses:
              "200": { description: Headers }
          trace:
            responses:
              "200": { description: Debug }
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });
});

// ── Path Operations: Metadata (3.1-#110-#114) ─────────────────────────────

describe('OpenAPI 3.1 — Operation Metadata (3.1-#110-#114)', () => {
  // 3.1-#110: operationId — Tier 1
  it('3.1-#110: operationId strategy uses operationId as method name', () => {
    const { contracts, client } = generateClientFromYaml(
      `
      openapi: "3.1.0"
      info: { title: Test, version: "1.0.0" }
      paths:
        /items:
          get:
            operationId: listAllItems
            responses:
              "200": { description: OK }
    `,
      { methodNameStrategy: 'operationId' }
    );

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
    // Should NOT use path-based name
    expect(client).not.toContain('getItems:');
  });

  it('3.1-#110: operationId with path-based strategy is ignored', () => {
    const { contracts, client } = generateClientFromYaml(
      `
      openapi: "3.1.0"
      info: { title: Test, version: "1.0.0" }
      paths:
        /items:
          get:
            operationId: listAllItems
            responses:
              "200": { description: OK }
    `,
      { methodNameStrategy: 'path-based' }
    );

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  it('3.1-#110: operationId-with-fallback uses operationId when present', () => {
    const { contracts, client } = generateClientFromYaml(
      `
      openapi: "3.1.0"
      info: { title: Test, version: "1.0.0" }
      paths:
        /items:
          get:
            operationId: listItems
            responses:
              "200": { description: OK }
        /things:
          get:
            responses:
              "200": { description: OK }
    `,
      { methodNameStrategy: 'operationId-with-fallback' }
    );

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  // 3.1-#111: summary — Tier 1
  it('3.1-#111: operation summary becomes JSDoc description', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
      info: { title: Test, version: "1.0.0" }
      paths:
        /items:
          get:
            summary: Retrieve all items from the catalog
            responses:
              "200": { description: OK }
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  // 3.1-#112: description — Tier 1
  it('3.1-#112: operation description appears in JSDoc after summary', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
      info: { title: Test, version: "1.0.0" }
      paths:
        /items:
          get:
            summary: Get items
            description: Returns a paginated list of all available items
            responses:
              "200": { description: OK }
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  it('3.1-#112: description without summary still generates JSDoc', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
      info: { title: Test, version: "1.0.0" }
      paths:
        /items:
          get:
            description: Fetches the complete catalog
            responses:
              "200": { description: OK }
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  // 3.1-#113: tags — Tier 1
  it('3.1-#113: operation tags become @category JSDoc annotations', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
      info: { title: Test, version: "1.0.0" }
      paths:
        /items:
          get:
            tags: [catalog, public]
            summary: Get items
            responses:
              "200": { description: OK }
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  // 3.1-#114: deprecated (operation) — Tier 1
  it('3.1-#114: deprecated operation adds @deprecated JSDoc tag', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
      info: { title: Test, version: "1.0.0" }
      paths:
        /legacy/items:
          get:
            deprecated: true
            summary: Old endpoint
            responses:
              "200": { description: OK }
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });

  // Combined: summary + description + tags + deprecated
  it('3.1-#111-#114: combined JSDoc with all metadata fields', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
      info: { title: Test, version: "1.0.0" }
      paths:
        /legacy/items:
          get:
            summary: Legacy items endpoint
            description: Use the new /items endpoint instead
            tags: [legacy, deprecated]
            deprecated: true
            responses:
              "200": { description: OK }
    `);

    expect(contracts).toMatchSnapshot();
    expect(client).toMatchSnapshot();
  });
});
