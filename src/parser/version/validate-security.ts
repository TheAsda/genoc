/**
 * Shared security validation for 3.0 and 3.1 validators.
 *
 * Rules are identical across dialects except:
 * - `mutualTLS` scheme type is 3.1-only
 * - non-empty scope arrays for non-oauth2/openIdConnect schemes are legal in
 *   3.1 (role names) but MUST be empty in 3.0
 *
 * `$ref` scheme entries are resolved here (internal `#/` pointers, cycle
 * guarded) so the resolved object is validated like an inline scheme — the
 * soundness guarantee "validation ⇒ generated scheme payloads are well-formed"
 * holds for referenced schemes too. External-document refs are left to the
 * ref-resolver, which rejects them at its own boundary. `security` on a Path
 * Item is rejected: OpenAPI allows security at document and operation level
 * only, and silently dropping it would lose auth metadata.
 */

import { HTTP_METHODS } from '../../utils/http-methods.js';

const SCHEME_TYPES: Record<'3.0' | '3.1', ReadonlySet<string>> = {
  '3.0': new Set(['apiKey', 'http', 'oauth2', 'openIdConnect']),
  '3.1': new Set(['apiKey', 'http', 'oauth2', 'openIdConnect', 'mutualTLS']),
};

export function validateSecurity(
  spec: Record<string, unknown>,
  version: '3.0' | '3.1',
  errors: string[]
): void {
  /** Raw entries keyed by declared name — presence check for requirement refs. */
  let declaredNames: ReadonlySet<string> | undefined;
  /** `name` → resolved (un-ref'd) scheme object used for scope-rule checks. */
  let resolvedByName: Map<string, Record<string, unknown>> | undefined;
  const components = spec.components as Record<string, unknown> | undefined;
  const rawSchemes = components?.securitySchemes;
  if (rawSchemes === undefined) {
    declaredNames = undefined;
  } else if (typeof rawSchemes !== 'object' || rawSchemes === null || Array.isArray(rawSchemes)) {
    errors.push("'components.securitySchemes' must be an object");
    declaredNames = new Set();
    resolvedByName = new Map();
  } else {
    const schemes = rawSchemes as Record<string, Record<string, unknown>>;
    declaredNames = new Set(Object.keys(schemes));
    resolvedByName = new Map();
    for (const [name, scheme] of Object.entries(schemes)) {
      const resolved = resolveSchemeTarget(spec, name, scheme, new Set(), errors);
      if (resolved !== undefined) {
        validateScheme(name, resolved, version, errors);
        resolvedByName.set(name, resolved);
      }
    }
  }

  validateSecurityList(spec.security, 'security', declaredNames, resolvedByName, version, errors);

  const paths = spec.paths;
  if (typeof paths !== 'object' || paths === null || Array.isArray(paths)) {
    return;
  }
  for (const [pathKey, pathItem] of Object.entries(paths as Record<string, unknown>)) {
    if (typeof pathItem !== 'object' || pathItem === null || Array.isArray(pathItem)) {
      continue;
    }
    if ('security' in pathItem) {
      errors.push(
        `'paths.${pathKey}.security' is not allowed: security requirements may be declared at the document and operation levels only`
      );
    }
    for (const method of HTTP_METHODS) {
      const op = (pathItem as Record<string, unknown>)[method];
      if (typeof op === 'object' && op !== null && !Array.isArray(op)) {
        validateSecurityList(
          (op as Record<string, unknown>).security,
          `paths.${pathKey}.${method}.security`,
          declaredNames,
          resolvedByName,
          version,
          errors
        );
      }
    }
  }
}

/**
 * Follow a scheme entry to its validation target: a non-`$ref` entry is its
 * own target; internal pointers (`#/…` and the root pointer `#`) are walked
 * (JSON Pointer escapes honored, cycles guarded) and chained refs are
 * followed. External refs are returned unresolved (the ref-resolver rejects
 * them later). Returns `undefined` — after pushing an error — when the entry
 * is not an object, the pointer dangles or carries malformed percent-
 * encoding, or a ref cycle is detected.
 */
function resolveSchemeTarget(
  spec: Record<string, unknown>,
  name: string,
  entry: unknown,
  seenRefs: Set<string>,
  errors: string[]
): Record<string, unknown> | undefined {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    errors.push(`Security scheme '${name}' must be an object`);
    return undefined;
  }
  const record = entry as Record<string, unknown>;
  const ref = record.$ref;
  if (typeof ref !== 'string') {
    return record;
  }
  if (ref !== '#' && !ref.startsWith('#/')) {
    return record; // external document — the ref-resolver's boundary
  }
  if (seenRefs.has(ref)) {
    errors.push(`Security scheme '${name}' has a circular $ref chain ('${ref}')`);
    return undefined;
  }
  seenRefs.add(ref);

  let segments: string[];
  try {
    const pointerBody = ref === '#' ? '' : ref.slice(2);
    segments =
      pointerBody === ''
        ? []
        : pointerBody
            .split('/')
            .map((s) => decodeURIComponent(s.replace(/~1/g, '/').replace(/~0/g, '~')));
  } catch {
    // malformed percent-encoding (e.g. a bare '%') — same story as a dangling pointer
    errors.push(`Security scheme '${name}' $ref '${ref}' does not resolve`);
    return undefined;
  }
  let target: unknown = spec;
  for (const segment of segments) {
    if (
      typeof target !== 'object' ||
      target === null ||
      Array.isArray(target) ||
      !(segment in (target as Record<string, unknown>))
    ) {
      errors.push(`Security scheme '${name}' $ref '${ref}' does not resolve`);
      return undefined;
    }
    target = (target as Record<string, unknown>)[segment];
  }
  return resolveSchemeTarget(spec, name, target, seenRefs, errors);
}

function validateScheme(
  name: string,
  scheme: unknown,
  version: '3.0' | '3.1',
  errors: string[]
): void {
  if (typeof scheme !== 'object' || scheme === null || Array.isArray(scheme)) {
    errors.push(`Security scheme '${name}' must be an object`);
    return;
  }
  const s = scheme as Record<string, unknown>;
  if (typeof s.$ref === 'string') {
    return; // external ref — shape belongs to the target document's boundary
  }

  const type = s.type;
  if (typeof type !== 'string' || !SCHEME_TYPES[version].has(type)) {
    const allowed = [...SCHEME_TYPES[version]].join(', ');
    errors.push(
      `Security scheme '${name}' must have a 'type' field with one of: ${allowed}, got: ${JSON.stringify(type ?? null)}`
    );
    return;
  }

  switch (type) {
    case 'apiKey':
      if (typeof s.name !== 'string' || s.name === '') {
        errors.push(`apiKey security scheme '${name}' must have a 'name' field with string value`);
      }
      if (s.in !== 'query' && s.in !== 'header' && s.in !== 'cookie') {
        errors.push(
          `apiKey security scheme '${name}' must have an 'in' field with one of: query, header, cookie`
        );
      }
      break;
    case 'http':
      if (typeof s.scheme !== 'string' || s.scheme === '') {
        errors.push(`http security scheme '${name}' must have a 'scheme' field with string value`);
      }
      break;
    case 'oauth2':
      validateOauth2Flows(name, s.flows, errors);
      break;
    case 'openIdConnect':
      if (typeof s.openIdConnectUrl !== 'string' || s.openIdConnectUrl === '') {
        errors.push(
          `openIdConnect security scheme '${name}' must have an 'openIdConnectUrl' field with string value`
        );
      }
      break;
    case 'mutualTLS':
      break; // no scheme-specific fields
  }
}

function validateOauth2Flows(name: string, flows: unknown, errors: string[]): void {
  if (typeof flows !== 'object' || flows === null || Array.isArray(flows)) {
    errors.push(`oauth2 security scheme '${name}' must have a 'flows' field with object value`);
    return;
  }
  for (const [flowKind, flow] of Object.entries(flows as Record<string, unknown>)) {
    if (flow === undefined) {
      continue;
    }
    if (typeof flow !== 'object' || flow === null || Array.isArray(flow)) {
      errors.push(`oauth2 flow '${flowKind}' of security scheme '${name}' must be an object`);
      continue;
    }
    const scopes = (flow as Record<string, unknown>).scopes;
    if (typeof scopes !== 'object' || scopes === null || Array.isArray(scopes)) {
      errors.push(
        `oauth2 flow '${flowKind}' of security scheme '${name}' must have a 'scopes' field with object value`
      );
    }
  }
}

function validateSecurityList(
  list: unknown,
  context: string,
  declaredNames: ReadonlySet<string> | undefined,
  resolvedByName: Map<string, Record<string, unknown>> | undefined,
  version: '3.0' | '3.1',
  errors: string[]
): void {
  if (list === undefined) {
    return;
  }
  if (!Array.isArray(list)) {
    errors.push(`'${context}' must be an array`);
    return;
  }
  list.forEach((requirement, index) => {
    const reqContext = `${context}[${index}]`;
    if (typeof requirement !== 'object' || requirement === null || Array.isArray(requirement)) {
      errors.push(`'${reqContext}' must be an object`);
      return;
    }
    for (const [schemeName, scopes] of Object.entries(requirement as Record<string, unknown>)) {
      if (!declaredNames?.has(schemeName)) {
        errors.push(
          `'${reqContext}' references unknown security scheme '${schemeName}' (not declared in components.securitySchemes)`
        );
        continue;
      }
      const schemeType = resolvedByName?.get(schemeName)?.type;
      if (!Array.isArray(scopes) || scopes.some((scope) => typeof scope !== 'string')) {
        errors.push(`'${reqContext}.${schemeName}' must be an array of strings`);
        continue;
      }
      if (
        version === '3.0' &&
        scopes.length > 0 &&
        schemeType !== undefined &&
        schemeType !== 'oauth2' &&
        schemeType !== 'openIdConnect'
      ) {
        errors.push(
          `'${reqContext}.${schemeName}' must have an empty scopes array for '${String(schemeType)}' schemes in OpenAPI 3.0`
        );
      }
    }
  });
}
