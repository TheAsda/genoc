import { expect } from 'vitest';

const SPEC_URL_LINE = /https:\/\/spec\.openapis\.org\/oas\/v3\.\d+\.\d+\.html#[a-z0-9-]+$/;

/**
 * Asserts that `errors` contains a spec-violation message starting with
 * `message` and carrying a link line to the OpenAPI specification section
 * that states the rule.
 */
export function expectViolation(errors: string[], message: string): void {
  const match = errors.find((e) => e.startsWith(message));
  expect(
    match,
    `expected a spec violation starting with: ${message}\nin:\n${errors.join('\n')}`
  ).toBeDefined();
  expect(match).toMatch(SPEC_URL_LINE);
}

/**
 * Asserts that `errors` contains exactly `message` with no spec link —
 * used for unsupported-feature errors (the document is valid; the link
 * would point at a rule the document does not break).
 */
export function expectUnsupported(errors: string[], message: string): void {
  expect(errors).toContain(message);
}
