import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * Cross-Task Integration Test — F3: Real Manual QA
 *
 * Verifies all 3 bug fixes work together in a single generated client:
 * 1. OAuth2 security scheme generates with correct "OAuth2" casing (not "Oauth2")
 * 2. Header parameters appear in method signatures and are passed to Requester
 * 3. DefaultApiError is thrown for default responses (only when default response exists)
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { generateClient as generateClientStrings } from '../../src/generator/client-generator.js';
import type { GeneratorConfig } from '../../src/types/client.js';
import type { OpenAPIDocument } from '../../src/types/openapi.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPEC_PATH = join(__dirname, '../fixtures/cross-task-integration-spec.yaml');

function loadSpec(): { contracts: string; client: string } {
  const yaml = readFileSync(SPEC_PATH, 'utf-8');
  const doc = parseYaml(yaml) as OpenAPIDocument;
  const config: GeneratorConfig = {
    input: SPEC_PATH,
    outputDir: join(__dirname, '../__output__/cross-task-test'),
  };
  return generateClientStrings(doc, config);
}

describe('Cross-task integration: OAuth2 + Headers + DefaultApiError', () => {
  let contracts: string;
  let client: string;

  beforeAll(() => {
    const result = loadSpec();
    contracts = result.contracts;
    client = result.client;
  });

  describe('Fix 1: OAuth2 security scheme casing', () => {
    it('generates "OAuth2ImplicitAuth" with correct casing (not "Oauth2")', () => {
      expect(contracts).toContain('export type OAuth2ImplicitAuth = {');
      expect(contracts).not.toContain('Oauth2ImplicitAuth');
    });

    it('generates "OAuth2PasswordAuth" with correct casing (not "Oauth2")', () => {
      expect(contracts).toContain('export type OAuth2PasswordAuth = {');
      expect(contracts).not.toContain('Oauth2PasswordAuth');
    });

    it('includes oauth2 type discriminator in security scheme types', () => {
      expect(contracts).toContain('type: "oauth2"');
    });

    it('contains implicit flow details with authorization URL', () => {
      expect(contracts).toContain('implicit:');
      expect(contracts).toContain('authorizationUrl: "https://auth.example.com/authorize"');
    });

    it('contains password flow details with token URL', () => {
      expect(contracts).toContain('password:');
      expect(contracts).toContain('tokenUrl: "https://auth.example.com/token"');
    });
  });

  describe('Fix 2: Header parameters in method signatures', () => {
    it('generates header type for GET /products with optional X-Request-Id and required X-Api-Key', () => {
      expect(contracts).toContain('export type GetProductsHeaders = {');
      expect(contracts).toContain('"X-Request-Id"?: string');
      expect(contracts).toContain('"X-Api-Key": string');
    });

    it('generates header type for POST /products with optional X-Idempotency-Key', () => {
      expect(contracts).toContain('export type PostProductsHeaders = {');
      expect(contracts).toContain('"X-Idempotency-Key"?: string');
    });

    it('generates header type for GET /products/{productId} with optional X-Trace-Id', () => {
      expect(contracts).toContain('export type GetProductsProductIdHeaders = {');
      expect(contracts).toContain('"X-Trace-Id"?: string');
    });

    it('includes headers in GET /products method signature (required because X-Api-Key is required)', () => {
      expect(client).toContain('headers: GetProductsHeaders) => Promise<GetProductsResponse>');
    });

    it('includes headers in POST /products method signature (optional because all headers optional)', () => {
      expect(client).toContain('headers: PostProductsHeaders | undefined');
    });

    it('passes headers to requester in GET /products method body', () => {
      expect(client).toContain('{ query, headers }');
    });

    it('passes headers to requester in POST /products method body', () => {
      expect(client).toContain('{ headers, body }');
    });

    it('passes headers to requester in GET /products/{productId} method body', () => {
      expect(client).toContain(
        'GetProductsProductIdResponse>("GET", `/products/${encodeURIComponent(productId)}`, { headers }'
      );
    });

    it('does NOT generate Headers type for DELETE (no header params)', () => {
      expect(contracts).not.toContain('DeleteProductsProductIdHeaders');
    });
  });

  describe('Fix 3: DefaultApiError for default responses', () => {
    it('generates DefaultApiError class in contracts', () => {
      expect(contracts).toContain('export class DefaultApiError<TData> extends Error');
      expect(contracts).toContain('this.name = "DefaultApiError"');
    });

    it('generates DefaultError type for GET /products (has default response)', () => {
      expect(contracts).toContain('GetProductsDefaultError');
    });

    it('generates DefaultError type for POST /products (has default response)', () => {
      expect(contracts).toContain('PostProductsDefaultError');
    });

    it('generates DefaultError type for GET /products/{productId} (has default response)', () => {
      expect(contracts).toContain('GetProductsProductIdDefaultError');
    });

    it('does NOT generate DefaultError for DELETE /products/{productId} (no default response)', () => {
      expect(contracts).not.toContain('DeleteProductsProductIdDefaultError');
    });

    it('throws DefaultApiError for default responses in GET /products method body', () => {
      expect(client).toContain(
        'throw new DefaultApiError(result.status, result.data as GetProductsDefaultError'
      );
    });

    it('throws DefaultApiError for default responses in POST /products method body', () => {
      expect(client).toContain(
        'throw new DefaultApiError(result.status, result.data as PostProductsDefaultError'
      );
    });

    it('throws UnspecifiedApiError for DELETE (no default response)', () => {
      expect(client).toContain('throw new UnspecifiedApiError(result.status, result.data');
    });

    it('DefaultApiError does NOT appear in the Errors union type', () => {
      const errorsMatch = contracts.match(/export type GetProductsErrors = [^;]+;/);
      expect(errorsMatch).not.toBeNull();
      expect(errorsMatch![0]).not.toContain('DefaultApiError');
      expect(errorsMatch![0]).toContain('ApiError<');
    });

    it('imports DefaultApiError in client file', () => {
      expect(client).toMatch(/import.*DefaultApiError.*from '\.\/contracts\.js'/);
    });

    it('DefaultApiError class does NOT extend ApiError', () => {
      expect(contracts).not.toContain('class DefaultApiError<TData> extends ApiError');
      expect(contracts).toContain('class DefaultApiError<TData> extends Error');
    });
  });

  describe('Cross-cutting: all 3 fixes work simultaneously', () => {
    it('contracts contain all expected type sections', () => {
      expect(contracts).toContain('export type Product = {');
      expect(contracts).toContain('export type ErrorBody = {');
      expect(contracts).toContain('export type OAuth2ImplicitAuth = {');
      expect(contracts).toContain('export type OAuth2PasswordAuth = {');
      expect(contracts).toContain('export class ApiError');
      expect(contracts).toContain('export class DefaultApiError');
      expect(contracts).toContain('export class UnspecifiedApiError');
    });

    it('client references header types, DefaultApiError, and OAuth2 types', () => {
      expect(client).toContain('GetProductsHeaders');
      expect(client).toContain('PostProductsHeaders');
      expect(client).toContain('GetProductsProductIdHeaders');
      expect(client).toContain('DefaultApiError');
    });

    it('no regression: Oauth2 (wrong casing) does not appear anywhere', () => {
      expect(contracts).not.toMatch(/Oauth2/);
      expect(client).not.toMatch(/Oauth2/);
    });

    it('no regression: defined error types still use ApiError', () => {
      expect(contracts).toContain('GetProductsError400');
      expect(contracts).toContain('GetProductsErrors');
    });

    it('snapshot: contracts match expected output', () => {
      expect(contracts).toMatchSnapshot('cross-task-contracts');
    });

    it('snapshot: client matches expected output', () => {
      expect(client).toMatchSnapshot('cross-task-client');
    });
  });
});
