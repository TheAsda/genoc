import { validateSpec30 } from './v3.0/validator.js';
import { validateSpec31 } from './v3.1/validator.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a raw OpenAPI document against the rules of the given dialect.
 * Throws when the document is invalid; returns void otherwise.
 */
export function validateSpec(doc: unknown, version: '3.0' | '3.1'): void {
  const result = version === '3.0' ? validateSpec30(doc) : validateSpec31(doc);
  if (!result.valid) {
    throw new Error(
      `Invalid OpenAPI specification:\n${result.errors.map((e) => `  - ${e}`).join('\n')}`
    );
  }
}
