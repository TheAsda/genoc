/**
 * Single source of links from spec-violation errors to the section of the
 * OpenAPI specification that states the rule being violated.
 *
 * Unsupported-feature errors (Swagger 2.0, OpenAPI 3.2, external `$ref`s)
 * never use this module: the document is valid and the error cites a genoc
 * limitation, not a specification rule.
 */

/** Latest patch release per dialect. */
export const SPEC_PAGE: Record<'3.0' | '3.1', string> = {
  '3.0': 'https://spec.openapis.org/oas/v3.0.4.html',
  '3.1': 'https://spec.openapis.org/oas/v3.1.1.html',
};

/**
 * One anchor per violated rule, shared by both dialect pages. A wrong anchor
 * is a one-line fix here; no automated anchor checking exists.
 */
export const SPEC_ANCHORS = {
  'document-root': 'openapi-object',
  'openapi-field': 'oas-version',
  'info-object': 'info-object',
  'info-title': 'info-title',
  'info-version': 'info-version',
  'paths-object': 'paths-object',
  'path-item-object': 'path-item-object',
  'components-security-schemes': 'security-scheme-object',
  'components-schemas': 'components-schemas',
  'schema-object': 'schema-object',
  'security-scheme-object': 'security-scheme-object-0',
  'security-scheme-type': 'security-scheme-type',
  'security-scheme-name': 'security-scheme-name',
  'security-scheme-in': 'security-scheme-in',
  'security-scheme-scheme': 'security-scheme-scheme',
  'security-scheme-flows': 'security-scheme-flows',
  'security-scheme-open-id-connect-url': 'security-scheme-open-id-connect-url',
  'oauth-flow-object': 'oauth-flow-object',
  'oauth-flow-scopes': 'oauth-flow-scopes',
  'reference-object': 'reference-object',
  'security-requirement-object': 'security-requirement-object',
} as const;

export type SpecLinkKey = keyof typeof SPEC_ANCHORS;

export function specLinkUrl(version: '3.0' | '3.1', key: SpecLinkKey): string {
  return `${SPEC_PAGE[version]}#${SPEC_ANCHORS[key]}`;
}

/**
 * Renders a spec-violation message with its link line appended on its own
 * line, indented four spaces so it aligns under the `  - ` bullet that
 * `validateSpec` puts each message in.
 */
export function specViolation(version: '3.0' | '3.1', key: SpecLinkKey, message: string): string {
  return `${message}\n    ${specLinkUrl(version, key)}`;
}

/**
 * Detection error for a document that violates the specification itself
 * (as opposed to an unsupported-but-valid dialect). Carries the anchor key
 * so `resolveVersion` can render the link against the dialect being applied.
 */
export class SpecViolationError extends Error {
  /** Which specification section states the violated rule. */
  linkKey: SpecLinkKey;

  constructor(message: string, linkKey: SpecLinkKey) {
    super(message);
    this.name = 'SpecViolationError';
    this.linkKey = linkKey;
  }
}
