// Feature coverage: 3.0-#83 (apiKey query), 3.0-#84 (apiKey header),
// 3.0-#85 (apiKey cookie), 3.0-#86 (http basic), 3.0-#87 (http bearer),
// 3.0-#88 (http digest), 3.0-#89 (oauth2 implicit), 3.0-#90 (oauth2 password),
// 3.0-#91 (oauth2 client credentials), 3.0-#92 (oauth2 authorization code),
// 3.0-#93 (openIdConnect), 3.0-#94 (security requirements),
// 3.0-#95 (server URLs), 3.0-#96 (server variables), 3.0-#97 (enum for variables),
// 3.0-#98 (default variable values), 3.0-#99 (multiple servers),
// 3.0-#100 (GET), 3.0-#101 (POST), 3.0-#102 (PUT), 3.0-#103 (PATCH),
// 3.0-#104 (DELETE), 3.0-#105 (OPTIONS), 3.0-#106 (HEAD), 3.0-#107 (TRACE),
// 3.0-#108 (operationId), 3.0-#109 (summary), 3.0-#110 (description),
// 3.0-#111 (tags), 3.0-#112 (deprecated operation), 3.0-#113 (path templating)

/**
 * Validation Tests — OpenAPI 3.0 Security Schemes, Servers & Path Operations
 *
 * Tests every feature from the "Security Schemes" (3.0-#83-#94), "Servers"
 * (3.0-#95-#99), and "Path Operations" (3.0-#100-#113) sections of the
 * feature enumeration. Total: 31 features.
 *
 * Security Schemes (Tier 2): Type definitions are generated in the contracts
 * file but no auth enforcement code is produced in the client. Tests verify
 * correct type definitions, no crash, and no client-side security enforcement.
 *
 * Servers (Tier 1): Server variable types generated as TypeScript interfaces.
 *
 * Path Operations (Tier 1): All HTTP methods generate client methods.
 * Metadata (operationId, summary, description, tags, deprecated) produces
 * correct JSDoc output. Path templating produces correct parameter handling.
 *
 * Note: For version-independent features (security schemes, servers, path
 * operations), 3.0 and 3.1 produce identical output. These tests confirm
 * that 3.0 specs with `openapi: "3.0.0"` are handled correctly.
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

// ── Security Schemes (3.0-#83-#94) ─────────────────────────────────────────

describe('OpenAPI 3.0 — Security Schemes (3.0-#83-#94)', () => {
  // 3.0-#83: apiKey (query) — Tier 2: types generated, no enforcement
  it('3.0-#83: generates type definition for apiKey security scheme in query', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.0"
      info: { title: Test, version: "1.0.0" }
      components:
        securitySchemes:
          ApiKeyQuery:
            type: apiKey
            name: api_key
            in: query
            description: API key passed as query parameter
      paths:
        /items:
          get:
            responses:
              "200": { description: OK }
    `);

    // Contracts: type definition with apiKey properties
    expect(contracts).toContain('export type ApiKeyQueryAuth = {');
    expect(contracts).toContain('type: "apiKey"');
    expect(contracts).toContain('name: "api_key"');
    expect(contracts).toContain('in: "query"');
    // Contracts: JSDoc description
    expect(contracts).toContain('API key passed as query parameter');
    // Client: does not import or reference the auth type for enforcement
    expect(client).not.toContain('ApiKeyQueryAuth');
  });

  // 3.0-#84: apiKey (header) — Tier 2
  it('3.0-#84: generates type definition for apiKey security scheme in header', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.0"
      info: { title: Test, version: "1.0.0" }
      components:
        securitySchemes:
          ApiKeyHeader:
            type: apiKey
            name: X-API-Key
            in: header
      paths:
        /items:
          get:
            responses:
              "200": { description: OK }
    `);

    expect(contracts).toContain('export type ApiKeyHeaderAuth = {');
    expect(contracts).toContain('type: "apiKey"');
    expect(contracts).toContain('name: "X-API-Key"');
    expect(contracts).toContain('in: "header"');
    expect(client).not.toContain('ApiKeyHeaderAuth');
  });

  // 3.0-#85: apiKey (cookie) — Tier 2
  it('3.0-#85: generates type definition for apiKey security scheme in cookie', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.0"
      info: { title: Test, version: "1.0.0" }
      components:
        securitySchemes:
          SessionCookie:
            type: apiKey
            name: session
            in: cookie
      paths:
        /items:
          get:
            responses:
              "200": { description: OK }
    `);

    expect(contracts).toContain('export type SessionCookieAuth = {');
    expect(contracts).toContain('type: "apiKey"');
    expect(contracts).toContain('name: "session"');
    expect(contracts).toContain('in: "cookie"');
    expect(client).not.toContain('SessionCookieAuth');
  });

  // 3.0-#86: http basic — Tier 2
  it('3.0-#86: generates type definition for HTTP basic security scheme', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.0"
      info: { title: Test, version: "1.0.0" }
      components:
        securitySchemes:
          BasicAuth:
            type: http
            scheme: basic
      paths:
        /items:
          get:
            responses:
              "200": { description: OK }
    `);

    expect(contracts).toContain('export type BasicAuthAuth = {');
    expect(contracts).toContain('type: "http"');
    expect(contracts).toContain('scheme: "basic"');
    expect(client).not.toContain('BasicAuthAuth');
  });

  // 3.0-#87: http bearer — Tier 2
  it('3.0-#87: generates type definition for HTTP bearer security scheme with bearerFormat', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.0"
      info: { title: Test, version: "1.0.0" }
      components:
        securitySchemes:
          BearerAuth:
            type: http
            scheme: bearer
            bearerFormat: JWT
      paths:
        /items:
          get:
            responses:
              "200": { description: OK }
    `);

    expect(contracts).toContain('export type BearerAuthAuth = {');
    expect(contracts).toContain('type: "http"');
    expect(contracts).toContain('scheme: "bearer"');
    expect(contracts).toContain('bearerFormat: "JWT"');
    expect(client).not.toContain('BearerAuthAuth');
  });

  // 3.0-#88: http digest — Tier 2
  it('3.0-#88: generates type definition for HTTP digest security scheme', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.0"
      info: { title: Test, version: "1.0.0" }
      components:
        securitySchemes:
          DigestAuth:
            type: http
            scheme: digest
      paths:
        /items:
          get:
            responses:
              "200": { description: OK }
    `);

    expect(contracts).toContain('export type DigestAuthAuth = {');
    expect(contracts).toContain('type: "http"');
    expect(contracts).toContain('scheme: "digest"');
    expect(client).not.toContain('DigestAuthAuth');
  });

  // 3.0-#89: oauth2 implicit — Tier 2
  it('3.0-#89: generates type definition for OAuth2 implicit flow', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.0"
      info: { title: Test, version: "1.0.0" }
      components:
        securitySchemes:
          OAuth2Implicit:
            type: oauth2
            flows:
              implicit:
                authorizationUrl: "https://example.com/auth"
                scopes:
                  "read:items": Read items
                  "write:items": Write items
      paths:
        /items:
          get:
            responses:
              "200": { description: OK }
    `);

    expect(contracts).toContain('export type OAuth2ImplicitAuth = {');
    expect(contracts).toContain('type: "oauth2"');
    expect(contracts).toContain('flows:');
    expect(contracts).toContain('implicit:');
    expect(contracts).toContain('authorizationUrl: "https://example.com/auth"');
    expect(contracts).toContain('"read:items": "Read items"');
    expect(contracts).toContain('"write:items": "Write items"');
    expect(client).not.toContain('OAuth2ImplicitAuth');
  });

  // 3.0-#90: oauth2 password — Tier 2
  it('3.0-#90: generates type definition for OAuth2 password flow', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.0"
      info: { title: Test, version: "1.0.0" }
      components:
        securitySchemes:
          OAuth2Password:
            type: oauth2
            flows:
              password:
                tokenUrl: "https://example.com/token"
                scopes:
                  "read:items": Read items
      paths:
        /items:
          get:
            responses:
              "200": { description: OK }
    `);

    expect(contracts).toContain('export type OAuth2PasswordAuth = {');
    expect(contracts).toContain('type: "oauth2"');
    expect(contracts).toContain('password:');
    expect(contracts).toContain('tokenUrl: "https://example.com/token"');
    expect(client).not.toContain('OAuth2PasswordAuth');
  });

  // 3.0-#91: oauth2 client credentials — Tier 2
  it('3.0-#91: generates type definition for OAuth2 client credentials flow', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.0"
      info: { title: Test, version: "1.0.0" }
      components:
        securitySchemes:
          OAuth2Client:
            type: oauth2
            flows:
              clientCredentials:
                tokenUrl: "https://example.com/token"
                scopes:
                  "read:items": Read items
      paths:
        /items:
          get:
            responses:
              "200": { description: OK }
    `);

    expect(contracts).toContain('export type OAuth2ClientAuth = {');
    expect(contracts).toContain('type: "oauth2"');
    expect(contracts).toContain('clientCredentials:');
    expect(contracts).toContain('tokenUrl: "https://example.com/token"');
    expect(client).not.toContain('OAuth2ClientAuth');
  });

  // 3.0-#92: oauth2 authorization code — Tier 2
  it('3.0-#92: generates type definition for OAuth2 authorization code flow', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.0"
      info: { title: Test, version: "1.0.0" }
      components:
        securitySchemes:
          OAuth2AuthCode:
            type: oauth2
            flows:
              authorizationCode:
                authorizationUrl: "https://example.com/auth"
                tokenUrl: "https://example.com/token"
                scopes:
                  "read:items": Read items
      paths:
        /items:
          get:
            responses:
              "200": { description: OK }
    `);

    expect(contracts).toContain('export type OAuth2AuthCodeAuth = {');
    expect(contracts).toContain('type: "oauth2"');
    expect(contracts).toContain('authorizationCode:');
    expect(contracts).toContain('authorizationUrl: "https://example.com/auth"');
    expect(contracts).toContain('tokenUrl: "https://example.com/token"');
    expect(client).not.toContain('OAuth2AuthCodeAuth');
  });

  // 3.0-#93: openIdConnect — Tier 2
  it('3.0-#93: generates type definition for openIdConnect security scheme', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.0"
      info: { title: Test, version: "1.0.0" }
      components:
        securitySchemes:
          OidcAuth:
            type: openIdConnect
            openIdConnectUrl: "https://example.com/.well-known/openid-configuration"
      paths:
        /items:
          get:
            responses:
              "200": { description: OK }
    `);

    expect(contracts).toContain('export type OidcAuthAuth = {');
    expect(contracts).toContain('type: "openIdConnect"');
    expect(contracts).toContain(
      'openIdConnectUrl: "https://example.com/.well-known/openid-configuration"'
    );
    expect(client).not.toContain('OidcAuthAuth');
  });

  // 3.0-#94: security requirements — Tier 2
  it('3.0-#94: security requirements do not crash generation', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.0"
      info: { title: Test, version: "1.0.0" }
      security:
        - BearerAuth: []
      components:
        securitySchemes:
          BearerAuth:
            type: http
            scheme: bearer
      paths:
        /items:
          get:
            security:
              - BearerAuth: []
            responses:
              "200": { description: OK }
    `);

    // Generation completes without crash
    expect(contracts).toBeTruthy();
    expect(client).toBeTruthy();
    // Security scheme type is generated
    expect(contracts).toContain('export type BearerAuthAuth = {');
    // Client does not enforce security
    expect(client).not.toContain('BearerAuth');
    // No security-related headers or auth middleware in client
    expect(client).not.toContain('Authorization');
    expect(client).not.toContain('security');
  });

  // Combined: multiple security schemes generate SecuritySchemes union
  it('3.0-#83-#94: multiple security schemes generate SecuritySchemes union type', () => {
    const { contracts } = generateClientFromYaml(`
      openapi: "3.0.0"
      info: { title: Test, version: "1.0.0" }
      components:
        securitySchemes:
          ApiKeyHeader:
            type: apiKey
            name: X-API-Key
            in: header
          BearerAuth:
            type: http
            scheme: bearer
      paths:
        /items:
          get:
            responses:
              "200": { description: OK }
    `);

    // Individual types
    expect(contracts).toContain('export type ApiKeyHeaderAuth = {');
    expect(contracts).toContain('export type BearerAuthAuth = {');
    // Union type when multiple schemes exist
    expect(contracts).toContain('export type SecuritySchemes = ApiKeyHeaderAuth | BearerAuthAuth;');
  });

  it('3.0-#83-#94: single security scheme does not generate SecuritySchemes union', () => {
    const { contracts } = generateClientFromYaml(`
      openapi: "3.0.0"
      info: { title: Test, version: "1.0.0" }
      components:
        securitySchemes:
          OnlyAuth:
            type: http
            scheme: basic
      paths:
        /items:
          get:
            responses:
              "200": { description: OK }
    `);

    expect(contracts).toContain('export type OnlyAuthAuth = {');
    // No union when only one scheme
    expect(contracts).not.toContain('export type SecuritySchemes =');
  });

  it('3.0-#89-#92: OAuth2 with multiple flows generates all flow types', () => {
    const { contracts } = generateClientFromYaml(`
      openapi: "3.0.0"
      info: { title: Test, version: "1.0.0" }
      components:
        securitySchemes:
          FullOAuth:
            type: oauth2
            flows:
              implicit:
                authorizationUrl: "https://example.com/auth"
                scopes:
                  "read": Read access
              password:
                tokenUrl: "https://example.com/token"
                scopes:
                  "read": Read access
              clientCredentials:
                tokenUrl: "https://example.com/token"
                scopes:
                  "read": Read access
              authorizationCode:
                authorizationUrl: "https://example.com/auth"
                tokenUrl: "https://example.com/token"
                scopes:
                  "read": Read access
      paths:
        /items:
          get:
            responses:
              "200": { description: OK }
    `);

    expect(contracts).toContain('export type FullOAuthAuth = {');
    expect(contracts).toContain('implicit:');
    expect(contracts).toContain('password:');
    expect(contracts).toContain('clientCredentials:');
    expect(contracts).toContain('authorizationCode:');
  });

  it('3.0-#83-#94: OAuth2 flow with refreshUrl includes it in type', () => {
    const { contracts } = generateClientFromYaml(`
      openapi: "3.0.0"
      info: { title: Test, version: "1.0.0" }
      components:
        securitySchemes:
          OAuthWithRefresh:
            type: oauth2
            flows:
              authorizationCode:
                authorizationUrl: "https://example.com/auth"
                tokenUrl: "https://example.com/token"
                refreshUrl: "https://example.com/refresh"
                scopes:
                  "read": Read access
      paths:
        /items:
          get:
            responses:
              "200": { description: OK }
    `);

    expect(contracts).toContain('refreshUrl: "https://example.com/refresh"');
  });
});

// ── Servers (3.0-#95-#99) ─────────────────────────────────────────────────

describe('OpenAPI 3.0 — Servers (3.0-#95-#99)', () => {
  // 3.0-#95: server URLs — Tier 1
  it('3.0-#95: server without variables does not generate a server params type', () => {
    const { contracts } = generateClientFromYaml(`
      openapi: "3.0.0"
      info: { title: Test, version: "1.0.0" }
      servers:
        - url: "https://api.example.com"
          description: Production server
      paths:
        /items:
          get:
            responses:
              "200": { description: OK }
    `);

    // A server without variables produces no ServerParams interface
    expect(contracts).not.toContain('ServerParams');
  });

  // 3.0-#96: server variables — Tier 1
  it('3.0-#96: server with variables generates ServerParams interface', () => {
    const { contracts } = generateClientFromYaml(`
      openapi: "3.0.0"
      info: { title: Test, version: "1.0.0" }
      servers:
        - url: "https://{env}.api.example.com"
          description: Environment-based server
          variables:
            env:
              description: Server environment
              default: production
      paths:
        /items:
          get:
            responses:
              "200": { description: OK }
    `);

    // ServerParams interface is generated
    expect(contracts).toContain('export interface ServerParams {');
    // Variable as string type (no enum)
    expect(contracts).toContain('env: string;');
    // JSDoc with description and default
    expect(contracts).toContain('Server environment');
    expect(contracts).toContain('@default production');
    // Server URL as JSDoc
    expect(contracts).toContain('Server: https://{env}.api.example.com');
  });

  // 3.0-#97: enum for variables — Tier 1
  it('3.0-#97: server variables with enum generate union type', () => {
    const { contracts } = generateClientFromYaml(`
      openapi: "3.0.0"
      info: { title: Test, version: "1.0.0" }
      servers:
        - url: "https://{env}.api.example.com"
          variables:
            env:
              default: production
              enum:
                - production
                - staging
                - development
      paths:
        /items:
          get:
            responses:
              "200": { description: OK }
    `);

    expect(contracts).toContain('export interface ServerParams {');
    // Enum values become union type
    expect(contracts).toContain('env: "production" | "staging" | "development";');
  });

  // 3.0-#98: default variable values — Tier 1
  it('3.0-#98: server variable default value appears in JSDoc', () => {
    const { contracts } = generateClientFromYaml(`
      openapi: "3.0.0"
      info: { title: Test, version: "1.0.0" }
      servers:
        - url: "https://{version}.api.example.com"
          variables:
            version:
              default: v2
              description: API version
      paths:
        /items:
          get:
            responses:
              "200": { description: OK }
    `);

    expect(contracts).toContain('export interface ServerParams {');
    expect(contracts).toContain('API version');
    expect(contracts).toContain('@default v2');
    // Default value is documented, not used as the type itself (still string)
    expect(contracts).toContain('version: string;');
  });

  // 3.0-#99: multiple servers — Tier 1
  it('3.0-#99: multiple servers with variables generate indexed ServerParams', () => {
    const { contracts } = generateClientFromYaml(`
      openapi: "3.0.0"
      info: { title: Test, version: "1.0.0" }
      servers:
        - url: "https://{env}.api.example.com"
          variables:
            env:
              default: production
              enum:
                - production
                - staging
        - url: "https://cdn.example.com/{region}"
          variables:
            region:
              default: us
              enum:
                - us
                - eu
                - ap
      paths:
        /items:
          get:
            responses:
              "200": { description: OK }
    `);

    // Multiple servers use indexed names: Server1Params, Server2Params
    expect(contracts).toContain('export interface Server1Params {');
    expect(contracts).toContain('export interface Server2Params {');
    // First server URL
    expect(contracts).toContain('Server: https://{env}.api.example.com');
    // Second server URL
    expect(contracts).toContain('Server: https://cdn.example.com/{region}');
    // Server1Params has env
    expect(contracts).toContain('env: "production" | "staging";');
    // Server2Params has region
    expect(contracts).toContain('region: "us" | "eu" | "ap";');
  });

  it('3.0-#99: servers with and without variables mixed correctly', () => {
    const { contracts } = generateClientFromYaml(`
      openapi: "3.0.0"
      info: { title: Test, version: "1.0.0" }
      servers:
        - url: "https://static.example.com"
          description: Static server with no variables
        - url: "https://{env}.api.example.com"
          variables:
            env:
              default: production
      paths:
        /items:
          get:
            responses:
              "200": { description: OK }
    `);

    // Two servers total → indexed naming
    // First server has no variables → skipped (no Server1Params)
    // Second server has variables → Server2Params
    expect(contracts).not.toContain('export interface Server1Params {');
    expect(contracts).toContain('export interface Server2Params {');
    expect(contracts).toContain('env: string;');
  });

  it('3.0-#95-#99: server variable without description still generates correctly', () => {
    const { contracts } = generateClientFromYaml(`
      openapi: "3.0.0"
      info: { title: Test, version: "1.0.0" }
      servers:
        - url: "https://{host}.example.com"
          variables:
            host:
              default: api
      paths:
        /items:
          get:
            responses:
              "200": { description: OK }
    `);

    expect(contracts).toContain('export interface ServerParams {');
    expect(contracts).toContain('host: string;');
    // @default is still present even without description
    expect(contracts).toContain('@default api');
  });
});

// ── Path Operations: HTTP Methods (3.0-#100-#107) ──────────────────────────

describe('OpenAPI 3.0 — HTTP Methods (3.0-#100-#107)', () => {
  // 3.0-#100: GET — Tier 1
  it('3.0-#100: GET operation generates client method with GET request', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.0"
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

    // Contracts: response type
    expect(contracts).toContain('export type GetItemsResponse = string[];');
    // Client: method named correctly
    expect(client).toContain('getItems:');
    // Client: uses GET method
    expect(client).toContain('"GET"');
    // Client: requester called correctly
    expect(client).toContain('requester<GetItemsResponse>');
  });

  // 3.0-#101: POST — Tier 1
  it('3.0-#101: POST operation generates client method with body parameter', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.0"
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

    // Body type generated
    expect(contracts).toContain('export type PostItemsBody =');
    // Client: POST method
    expect(client).toContain('postItems:');
    expect(client).toContain('"POST"');
    // Body param in signature
    expect(client).toContain('body: PostItemsBody');
  });

  // 3.0-#102: PUT — Tier 1
  it('3.0-#102: PUT operation generates client method with body and path params', () => {
    const { client } = generateClientFromYaml(`
      openapi: "3.0.0"
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

    expect(client).toContain('putItems');
    expect(client).toContain('"PUT"');
    // Both path param and body
    expect(client).toContain('(id: string, body:');
  });

  // 3.0-#103: PATCH — Tier 1
  it('3.0-#103: PATCH operation generates client method', () => {
    const { client } = generateClientFromYaml(`
      openapi: "3.0.0"
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

    expect(client).toContain('patchItems');
    expect(client).toContain('"PATCH"');
  });

  // 3.0-#104: DELETE — Tier 1
  it('3.0-#104: DELETE operation generates client method', () => {
    const { client } = generateClientFromYaml(`
      openapi: "3.0.0"
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

    expect(client).toContain('deleteItems');
    expect(client).toContain('"DELETE"');
  });

  // 3.0-#105: OPTIONS — Tier 1
  it('3.0-#105: OPTIONS operation generates client method', () => {
    const { client } = generateClientFromYaml(`
      openapi: "3.0.0"
      info: { title: Test, version: "1.0.0" }
      paths:
        /items:
          options:
            responses:
              "200": { description: CORS }
    `);

    expect(client).toContain('optionsItems');
    expect(client).toContain('"OPTIONS"');
  });

  // 3.0-#106: HEAD — Tier 1
  it('3.0-#106: HEAD operation generates client method', () => {
    const { client } = generateClientFromYaml(`
      openapi: "3.0.0"
      info: { title: Test, version: "1.0.0" }
      paths:
        /items:
          head:
            responses:
              "200": { description: Headers }
    `);

    expect(client).toContain('headItems');
    expect(client).toContain('"HEAD"');
  });

  // 3.0-#107: TRACE — Tier 1
  it('3.0-#107: TRACE operation generates client method', () => {
    const { client } = generateClientFromYaml(`
      openapi: "3.0.0"
      info: { title: Test, version: "1.0.0" }
      paths:
        /items:
          trace:
            responses:
              "200": { description: Debug }
    `);

    expect(client).toContain('traceItems');
    expect(client).toContain('"TRACE"');
  });

  // Combined: all HTTP methods on the same path
  it('3.0-#100-#107: all 8 HTTP methods on one path generate 8 distinct methods', () => {
    const { client } = generateClientFromYaml(`
      openapi: "3.0.0"
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

    expect(client).toContain('getResource');
    expect(client).toContain('postResource');
    expect(client).toContain('putResource');
    expect(client).toContain('patchResource');
    expect(client).toContain('deleteResource');
    expect(client).toContain('optionsResource');
    expect(client).toContain('headResource');
    expect(client).toContain('traceResource');
  });
});

// ── Path Operations: Metadata (3.0-#108-#113) ──────────────────────────────

describe('OpenAPI 3.0 — Operation Metadata (3.0-#108-#113)', () => {
  // 3.0-#108: operationId — Tier 1
  it('3.0-#108: operationId strategy uses operationId as method name', () => {
    const { client } = generateClientFromYaml(
      `
      openapi: "3.0.0"
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

    expect(client).toContain('listAllItems:');
    // Should NOT use path-based name
    expect(client).not.toContain('getItems:');
  });

  it('3.0-#108: operationId with path-based strategy is ignored', () => {
    const { client } = generateClientFromYaml(
      `
      openapi: "3.0.0"
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

    // Default path-based strategy ignores operationId
    expect(client).toContain('getItems:');
  });

  it('3.0-#108: operationId-with-fallback uses operationId when present', () => {
    const { client } = generateClientFromYaml(
      `
      openapi: "3.0.0"
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

    // First path: uses operationId
    expect(client).toContain('listItems:');
    // Second path: falls back to path-based
    expect(client).toContain('getThings:');
  });

  // 3.0-#109: summary — Tier 1
  it('3.0-#109: operation summary becomes JSDoc description', () => {
    const { client } = generateClientFromYaml(`
      openapi: "3.0.0"
      info: { title: Test, version: "1.0.0" }
      paths:
        /items:
          get:
            summary: Retrieve all items from the catalog
            responses:
              "200": { description: OK }
    `);

    // JSDoc with summary
    expect(client).toContain('Retrieve all items from the catalog');
  });

  // 3.0-#110: description — Tier 1
  it('3.0-#110: operation description appears in JSDoc after summary', () => {
    const { client } = generateClientFromYaml(`
      openapi: "3.0.0"
      info: { title: Test, version: "1.0.0" }
      paths:
        /items:
          get:
            summary: Get items
            description: Returns a paginated list of all available items
            responses:
              "200": { description: OK }
    `);

    // Both summary and description in JSDoc
    expect(client).toContain('Get items');
    expect(client).toContain('Returns a paginated list of all available items');
  });

  it('3.0-#110: description without summary still generates JSDoc', () => {
    const { client } = generateClientFromYaml(`
      openapi: "3.0.0"
      info: { title: Test, version: "1.0.0" }
      paths:
        /items:
          get:
            description: Fetches the complete catalog
            responses:
              "200": { description: OK }
    `);

    expect(client).toContain('Fetches the complete catalog');
  });

  // 3.0-#111: tags — Tier 1
  it('3.0-#111: operation tags become @category JSDoc annotations', () => {
    const { client } = generateClientFromYaml(`
      openapi: "3.0.0"
      info: { title: Test, version: "1.0.0" }
      paths:
        /items:
          get:
            tags: [catalog, public]
            summary: Get items
            responses:
              "200": { description: OK }
    `);

    // Tags become @category entries
    expect(client).toContain('@category catalog');
    expect(client).toContain('@category public');
  });

  // 3.0-#112: deprecated (operation) — Tier 1
  it('3.0-#112: deprecated operation adds @deprecated JSDoc tag', () => {
    const { client } = generateClientFromYaml(`
      openapi: "3.0.0"
      info: { title: Test, version: "1.0.0" }
      paths:
        /legacy/items:
          get:
            deprecated: true
            summary: Old endpoint
            responses:
              "200": { description: OK }
    `);

    expect(client).toContain('@deprecated');
    // Method still generated normally
    expect(client).toContain('getLegacyItems:');
  });

  // 3.0-#113: path templating — Tier 1
  it('3.0-#113: path templating generates correct path params and URL encoding', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.0.0"
      info: { title: Test, version: "1.0.0" }
      paths:
        /users/{userId}/posts/{postId}:
          get:
            parameters:
              - name: userId
                in: path
                required: true
                schema: { type: string }
              - name: postId
                in: path
                required: true
                schema: { type: string }
            responses:
              "200":
                description: A post
                content:
                  application/json:
                    schema:
                      type: object
                      properties:
                        title: { type: string }
    `);

    // Client: method with path params — naming uses "By" separator for path segments
    expect(client).toContain('getUsersByUserIdPostsByPostId');
    // Both path parameters in the method signature
    expect(client).toContain('userId: string');
    expect(client).toContain('postId: string');
    // URL template with encodeURIComponent
    expect(client).toContain('encodeURIComponent');
    expect(client).toContain('/users/');
    expect(client).toContain('/posts/');
  });

  // Combined: summary + description + tags + deprecated
  it('3.0-#109-#112: combined JSDoc with all metadata fields', () => {
    const { client } = generateClientFromYaml(`
      openapi: "3.0.0"
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

    // Full JSDoc: summary, description, category tags, @deprecated
    expect(client).toContain('Legacy items endpoint');
    expect(client).toContain('Use the new /items endpoint instead');
    expect(client).toContain('@category legacy');
    expect(client).toContain('@category deprecated');
    expect(client).toContain('@deprecated');
  });
});
