/**
 * Version detector for multi-version OpenAPI support
 */

/**
 * The dialect of a spec and every behavioral consequence derived from it.
 * Produced by `resolveVersion`; the only sanctioned way code outside this
 * module learns about spec dialect.
 */
export interface VersionProfile {
  /** Dialect actually found in the document. */
  detected: '3.0' | '3.1';
  /** Dialect in effect: the override when provided, otherwise `detected`. */
  effective: '3.0' | '3.1';
  /** Whether sibling properties alongside `$ref` are preserved (3.1 behavior). */
  preserveRefSiblings: boolean;
}

export function detectSpecVersion(rawSpec: unknown): string {
  if (typeof rawSpec !== 'object' || rawSpec === null || Array.isArray(rawSpec)) {
    throw new Error('Invalid spec: must be a non-null object');
  }

  const spec = rawSpec as Record<string, unknown>;

  // Check for Swagger 2.0
  if ('swagger' in spec && typeof spec.swagger === 'string') {
    if (spec.swagger === '2.0') {
      throw new Error(
        'Swagger 2.0 is not supported. Convert to OpenAPI using swagger2openapi first.'
      );
    }
    throw new Error(`Unsupported Swagger version: ${spec.swagger}`);
  }

  // Check for OpenAPI 3.0+
  if (!('openapi' in spec) || typeof spec.openapi !== 'string') {
    throw new Error("Invalid spec: missing or invalid 'openapi' field");
  }

  const openapiVersion = spec.openapi;

  // Extract major.minor version
  const versionMatch = openapiVersion.match(/^(\d+\.\d+)/);
  if (!versionMatch) {
    throw new Error(`Invalid OpenAPI version format: ${openapiVersion}`);
  }

  const majorMinorVersion = versionMatch[1];

  // Validate supported versions
  const supportedVersions = ['3.0', '3.1', '3.2'];
  if (!supportedVersions.includes(majorMinorVersion)) {
    throw new Error(
      `Unsupported OpenAPI version: ${openapiVersion}. ` +
        `Supported versions: ${supportedVersions.join(', ')}`
    );
  }

  return majorMinorVersion;
}

/**
 * Resolve the dialect of a document into a `VersionProfile`.
 *
 * Detection always runs, even when an override is provided (so a 3.2 document
 * is rejected regardless). The override, when given, becomes the effective
 * dialect; `preserveRefSiblings` follows the effective dialect.
 */
export function resolveVersion(doc: unknown, override?: '3.0' | '3.1'): VersionProfile {
  const detected = detectSpecVersion(doc);
  if (detected !== '3.0' && detected !== '3.1') {
    throw new Error('OpenAPI 3.2 is not yet supported. Supported versions: 3.0, 3.1');
  }

  const effective = override ?? detected;
  return {
    detected,
    effective,
    preserveRefSiblings: effective === '3.1',
  };
}
