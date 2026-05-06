/**
 * Version detector for multi-version OpenAPI support
 */

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
