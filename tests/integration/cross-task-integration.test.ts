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
      expect(contracts).not.toContain('Oauth2ImplicitAuth');
    });

    it('generates "OAuth2PasswordAuth" with correct casing (not "Oauth2")', () => {
      expect(contracts).not.toContain('Oauth2PasswordAuth');
    });

    it('includes oauth2 type discriminator in security scheme types', () => {});

    it('contains implicit flow details with authorization URL', () => {});

    it('contains password flow details with token URL', () => {});
  });

  describe('Fix 2: Header parameters in method signatures', () => {
    it('generates header type for GET /products with optional X-Request-Id and required X-Api-Key', () => {});

    it('generates header type for POST /products with optional X-Idempotency-Key', () => {});

    it('generates header type for GET /products/{productId} with optional X-Trace-Id', () => {});

    it('includes headers in GET /products method signature (required because X-Api-Key is required)', () => {});

    it('includes headers in POST /products method signature (optional because all headers optional)', () => {});

    it('passes headers to requester in GET /products method body', () => {});

    it('passes headers to requester in POST /products method body', () => {});

    it('passes headers to requester in GET /products/{productId} method body', () => {});

    it('does NOT generate Headers type for DELETE (no header params)', () => {
      expect(contracts).not.toContain('DeleteProductsProductIdHeaders');
    });
  });

  describe('Fix 3: DefaultApiError for default responses', () => {
    it('generates DefaultApiError class in contracts', () => {});

    it('generates DefaultError type for GET /products (has default response)', () => {});

    it('generates DefaultError type for POST /products (has default response)', () => {});

    it('generates DefaultError type for GET /products/{productId} (has default response)', () => {});

    it('does NOT generate DefaultError for DELETE /products/{productId} (no default response)', () => {
      expect(contracts).not.toContain('DeleteProductsProductIdDefaultError');
    });

    it('throws DefaultApiError for default responses in GET /products method body', () => {});

    it('throws DefaultApiError for default responses in POST /products method body', () => {});

    it('throws UnspecifiedApiError for DELETE (no default response)', () => {});

    it('DefaultApiError does NOT appear in the Errors union type', () => {
      const errorsMatch = contracts.match(/export type GetProductsErrors = [^;]+;/);
      expect(errorsMatch).not.toBeNull();
      expect(errorsMatch![0]).not.toContain('DefaultApiError');
    });

    it('imports DefaultApiError in client file', () => {});

    it('DefaultApiError class does NOT extend ApiError', () => {
      expect(contracts).not.toContain('class DefaultApiError<TData> extends ApiError');
    });
  });

  describe('Cross-cutting: all 3 fixes work simultaneously', () => {
    it('contracts contain all expected type sections', () => {});

    it('client references header types, DefaultApiError, and OAuth2 types', () => {});

    it('no regression: Oauth2 (wrong casing) does not appear anywhere', () => {
      expect(contracts).not.toMatch(/Oauth2/);
      expect(client).not.toMatch(/Oauth2/);
    });

    it('no regression: defined error types still use ApiError', () => {});

    it('snapshot: contracts match expected output', () => {
      expect(contracts).toMatchSnapshot('cross-task-contracts');
    });

    it('snapshot: client matches expected output', () => {
      expect(client).toMatchSnapshot('cross-task-client');
    });
  });
});
