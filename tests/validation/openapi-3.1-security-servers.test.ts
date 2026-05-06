// Feature coverage: 3.1-#85 (apiKey query), 3.1-#86 (apiKey header),
// 3.1-#87 (apiKey cookie), 3.1-#88 (http basic), 3.1-#89 (http bearer),
// 3.1-#90 (http digest), 3.1-#91 (oauth2 implicit), 3.1-#92 (oauth2 password),
// 3.1-#93 (oauth2 client credentials), 3.1-#94 (oauth2 authorization code),
// 3.1-#95 (openIdConnect), 3.1-#96 (security requirements),
// 3.1-#97 (server URLs), 3.1-#98 (server variables), 3.1-#99 (enum for variables),
// 3.1-#100 (default variable values), 3.1-#101 (multiple servers)

/**
 * Validation Tests — OpenAPI 3.1 Security Schemes & Servers
 *
 * Tests every feature from the "Security Schemes" (3.1-#85-#96) and "Servers"
 * (3.1-#97-#101) sections of the feature enumeration.
 *
 * Security Schemes: Type definitions are generated in the contracts file but
 * no auth enforcement code is produced in the client. Tests verify:
 * - Correct type definitions appear in contracts output
 * - No crash with any scheme type
 * - Client file does not reference security scheme types for auth enforcement
 *
 * Servers: Server variable types are generated as TypeScript interfaces in
 * the contracts file. Tests verify correct type generation for variables,
 * enums, defaults, and multiple servers.
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

// ── Security Schemes (3.1-#85-#96) ─────────────────────────────────────────

describe('OpenAPI 3.1 — Security Schemes (3.1-#85-#96)', () => {
  // 3.1-#85: apiKey (query) — Tier 2: types generated, no enforcement
  it('3.1-#85: generates type definition for apiKey security scheme in query', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
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

  // 3.1-#86: apiKey (header) — Tier 2
  it('3.1-#86: generates type definition for apiKey security scheme in header', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
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

  // 3.1-#87: apiKey (cookie) — Tier 2
  it('3.1-#87: generates type definition for apiKey security scheme in cookie', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
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

  // 3.1-#88: http basic — Tier 2
  it('3.1-#88: generates type definition for HTTP basic security scheme', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
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

  // 3.1-#89: http bearer — Tier 2
  it('3.1-#89: generates type definition for HTTP bearer security scheme with bearerFormat', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
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

  // 3.1-#90: http digest — Tier 2
  it('3.1-#90: generates type definition for HTTP digest security scheme', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
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

  // 3.1-#91: oauth2 implicit — Tier 2
  it('3.1-#91: generates type definition for OAuth2 implicit flow', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
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

  // 3.1-#92: oauth2 password — Tier 2
  it('3.1-#92: generates type definition for OAuth2 password flow', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
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
    expect(contracts).not.toContain('authorizationUrl: "https://example.com/token"');
    expect(client).not.toContain('OAuth2PasswordAuth');
  });

  // 3.1-#93: oauth2 client credentials — Tier 2
  it('3.1-#93: generates type definition for OAuth2 client credentials flow', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
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

  // 3.1-#94: oauth2 authorization code — Tier 2
  it('3.1-#94: generates type definition for OAuth2 authorization code flow', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
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

  // 3.1-#95: openIdConnect — Tier 2
  it('3.1-#95: generates type definition for openIdConnect security scheme', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
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

  // 3.1-#96: security requirements — Tier 2
  it('3.1-#96: security requirements do not crash generation', () => {
    const { contracts, client } = generateClientFromYaml(`
      openapi: "3.1.0"
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

  it('3.1-#85-#96: multiple security schemes generate SecuritySchemes union type', () => {
    const { contracts } = generateClientFromYaml(`
      openapi: "3.1.0"
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

  it('3.1-#85-#96: single security scheme does not generate SecuritySchemes union', () => {
    const { contracts } = generateClientFromYaml(`
      openapi: "3.1.0"
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

  it('3.1-#91-#94: OAuth2 with multiple flows generates all flow types', () => {
    const { contracts } = generateClientFromYaml(`
      openapi: "3.1.0"
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

  it('3.1-#85-#96: OAuth2 flow with refreshUrl includes it in type', () => {
    const { contracts } = generateClientFromYaml(`
      openapi: "3.1.0"
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

// ── Servers (3.1-#97-#101) ─────────────────────────────────────────────────

describe('OpenAPI 3.1 — Servers (3.1-#97-#101)', () => {
  // 3.1-#97: server URLs — Tier 1
  it('3.1-#97: server without variables does not generate a server params type', () => {
    const { contracts } = generateClientFromYaml(`
      openapi: "3.1.0"
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

    // Server URL is present as JSDoc comment only when variables exist alongside it
    // A server without variables produces no ServerParams interface
    expect(contracts).not.toContain('ServerParams');
  });

  // 3.1-#98: server variables — Tier 1
  it('3.1-#98: server with variables generates ServerParams interface', () => {
    const { contracts } = generateClientFromYaml(`
      openapi: "3.1.0"
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

  // 3.1-#99: enum for variables — Tier 1
  it('3.1-#99: server variables with enum generate union type', () => {
    const { contracts } = generateClientFromYaml(`
      openapi: "3.1.0"
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

  // 3.1-#100: default variable values — Tier 1
  it('3.1-#100: server variable default value appears in JSDoc', () => {
    const { contracts } = generateClientFromYaml(`
      openapi: "3.1.0"
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

  // 3.1-#101: multiple servers — Tier 1
  it('3.1-#101: multiple servers with variables generate indexed ServerParams', () => {
    const { contracts } = generateClientFromYaml(`
      openapi: "3.1.0"
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

  it('3.1-#101: servers with and without variables mixed correctly', () => {
    const { contracts } = generateClientFromYaml(`
      openapi: "3.1.0"
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

  it('3.1-#97-#101: server variable without description still generates correctly', () => {
    const { contracts } = generateClientFromYaml(`
      openapi: "3.1.0"
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
