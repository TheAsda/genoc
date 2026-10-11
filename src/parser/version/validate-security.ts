/**
 * Shared security validation for 3.0 and 3.1 validators.
 *
 * Rules are identical across dialects except:
 * - `mutualTLS` scheme type is 3.1-only
 * - non-empty scope arrays for non-oauth2/openIdConnect schemes are legal in
 *   3.1 (role names) but MUST be empty in 3.0
 *
 * `$ref` scheme entries are validated shallowly (existence/resolution is the
 * ref-resolver's job); requirement-scope checks skip unresolved schemes.
 */

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const;

const SCHEME_TYPES: Record<'3.0' | '3.1', ReadonlySet<string>> = {
  '3.0': new Set(['apiKey', 'http', 'oauth2', 'openIdConnect']),
  '3.1': new Set(['apiKey', 'http', 'oauth2', 'openIdConnect', 'mutualTLS']),
};

type SchemeMap = Record<string, Record<string, unknown>> | undefined;

export function validateSecurity(
  spec: Record<string, unknown>,
  version: '3.0' | '3.1',
  errors: string[]
): void {
  let schemes: SchemeMap;
  const components = spec.components as Record<string, unknown> | undefined;
  const rawSchemes = components?.securitySchemes;
  if (rawSchemes === undefined) {
    schemes = undefined;
  } else if (typeof rawSchemes !== 'object' || rawSchemes === null || Array.isArray(rawSchemes)) {
    errors.push("'components.securitySchemes' must be an object");
    schemes = {};
  } else {
    schemes = rawSchemes as Record<string, Record<string, unknown>>;
    for (const [name, scheme] of Object.entries(schemes)) {
      validateScheme(name, scheme, version, errors);
    }
  }

  validateSecurityList(spec.security, 'security', schemes, version, errors);

  const paths = spec.paths;
  if (typeof paths !== 'object' || paths === null || Array.isArray(paths)) {
    return;
  }
  for (const [pathKey, pathItem] of Object.entries(paths as Record<string, unknown>)) {
    if (typeof pathItem !== 'object' || pathItem === null || Array.isArray(pathItem)) {
      continue;
    }
    for (const method of HTTP_METHODS) {
      const op = (pathItem as Record<string, unknown>)[method];
      if (typeof op === 'object' && op !== null && !Array.isArray(op)) {
        validateSecurityList(
          (op as Record<string, unknown>).security,
          `paths.${pathKey}.${method}.security`,
          schemes,
          version,
          errors
        );
      }
    }
  }
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
    return; // existence and resolution belong to the ref-resolver
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
  schemes: SchemeMap,
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
      const scheme = schemes?.[schemeName];
      if (scheme === undefined) {
        errors.push(
          `'${reqContext}' references unknown security scheme '${schemeName}' (not declared in components.securitySchemes)`
        );
        continue;
      }
      if (!Array.isArray(scopes) || scopes.some((scope) => typeof scope !== 'string')) {
        errors.push(`'${reqContext}.${schemeName}' must be an array of strings`);
        continue;
      }
      if (
        version === '3.0' &&
        scopes.length > 0 &&
        scheme.type !== undefined &&
        scheme.type !== 'oauth2' &&
        scheme.type !== 'openIdConnect'
      ) {
        errors.push(
          `'${reqContext}.${schemeName}' must have an empty scopes array for '${String(scheme.type)}' schemes in OpenAPI 3.0`
        );
      }
    }
  });
}
