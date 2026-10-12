import type { AnalyzedOperation } from '../analyzer/path-analyzer.js';
import type { AnalyzedSecurityCall, FinishedOperation } from '../analyzer/types.js';
import type { GeneratedMethod } from '../types/client.js';

/**
 * Method rendering input: an analyzed operation plus the finished security
 * facts when available (`analyze()` output; bare `AnalyzedOperation`s from
 * path analysis render without the `@security` tag).
 */
type MethodOperation = AnalyzedOperation & Partial<Pick<FinishedOperation, 'securityRequirements'>>;
import { sanitizeJsDocText } from '../utils/generator-helpers.js';
import { getSuccessType, operationEmissions } from '../utils/operation-naming.js';

type ParamSpec = { name: string; type: string; isOptional: boolean };

/**
 * A `?:` parameter may only be followed by other optional parameters — a
 * required parameter after an optional one is a TS1016 compile error
 * ("A required parameter cannot follow an optional parameter"). Optional
 * parameters that precede a required one are therefore rendered as
 * `name: T | undefined` instead of `name?: T`.
 */
function renderParams(specs: ParamSpec[]): string {
  return specs
    .map((spec, index) => {
      if (!spec.isOptional) {
        return `${spec.name}: ${spec.type}`;
      }
      const hasRequiredAfter = specs.slice(index + 1).some((s) => !s.isOptional);
      if (hasRequiredAfter) {
        return `${spec.name}: ${spec.type} | undefined`;
      }
      return `${spec.name}?: ${spec.type}`;
    })
    .join(', ');
}

function buildParameters(op: AnalyzedOperation): string {
  const emissions = operationEmissions(op);
  const specs: ParamSpec[] = [];

  for (const param of op.pathParams) {
    // Finished signature type text arrives from the analyzer's translation
    // layer; `?? 'string'` only guards hand-built `AnalyzedOperation` inputs.
    const finished = param.finishedType ?? 'string';
    // `T | string` is the caller escape hatch for custom wire formatting:
    // pass a pre-formatted string instead of the schema type. When T is
    // already `string` the union is skipped, and string-literal unions
    // deliberately widen to `string` (flexibility over strictness here).
    specs.push({
      name: param.name,
      type: finished === 'string' ? 'string' : `${finished} | string`,
      isOptional: false,
    });
  }

  if (emissions.query !== undefined) {
    const allOptional = op.queryParams.every((p) => !p.required);
    specs.push({ name: 'query', type: emissions.query, isOptional: allOptional });
  }

  if (op.requestBody) {
    // A schema-less body has no named type; the literal keeps the rendered
    // signature byte-identical to the previous template-literal fallback.
    specs.push({
      name: 'body',
      type: emissions.body ?? 'undefined',
      isOptional: !op.requestBody.required,
    });
  }

  if (emissions.headers !== undefined) {
    const allOptional = op.headerParams.every((p) => !p.required);
    specs.push({ name: 'headers', type: emissions.headers, isOptional: allOptional });
  }

  return renderParams(specs);
}

function buildJsDoc(op: MethodOperation): string {
  const lines: string[] = [];

  if (op.summary) {
    lines.push(` * ${op.summary}`);
  }

  if (op.description && op.description !== op.summary) {
    if (lines.length > 0) {
      lines.push(' *');
    }
    lines.push(` * ${op.description}`);
  }

  // Responses iterate ascending-numeric with 'default' last (Object.entries
  // integer-key semantics in path-analyzer), so the first success is the
  // lowest-numbered 2xx. No fallback to later 2xx when it is undescribed.
  const firstSuccess = op.responses.find((response) => response.isSuccess);
  if (firstSuccess?.description !== undefined && firstSuccess.description.trim() !== '') {
    if (lines.length > 0) {
      lines.push(' *');
    }
    lines.push(` * ${sanitizeJsDocText(firstSuccess.description)}`);
  }

  const allParams = [...op.pathParams, ...op.queryParams, ...op.headerParams, ...op.cookieParams];
  const paramsWithDescriptions = allParams.filter((param) => param.description);

  if (paramsWithDescriptions.length > 0) {
    if (lines.length > 0) {
      lines.push(' *');
    }
    for (const param of paramsWithDescriptions) {
      lines.push(` * @param ${param.name} — ${param.description}`);
    }
  }

  if (op.requestBody && op.requestBody.contentTypes.length > 0) {
    if (lines.length > 0) {
      lines.push(' *');
    }
    lines.push(` * @param body — request body`);
  }

  const securitySummary = renderSecuritySummary(op.securityRequirements);
  if (securitySummary !== undefined) {
    if (lines.length > 0) {
      lines.push(' *');
    }
    lines.push(` * @security ${sanitizeJsDocText(securitySummary)}`);
  }

  if (op.tags && op.tags.length > 0) {
    if (lines.length > 0) {
      lines.push(' *');
    }
    for (const tag of op.tags) {
      lines.push(` * @category ${tag}`);
    }
  }

  if (op.deprecated) {
    if (lines.length > 0) {
      lines.push(' *');
    }
    lines.push(' * @deprecated');
  }

  const deprecatedParams = allParams.filter((param) => param.deprecated === true);

  if (deprecatedParams.length > 0) {
    if (lines.length > 0) {
      lines.push(' *');
    }
    for (const param of deprecatedParams) {
      lines.push(` * @deprecated ${param.name} — This parameter is deprecated`);
    }
  }

  if (lines.length === 0) {
    return '';
  }

  return `/**\n${lines.join('\n')}\n */`;
}

/**
 * Render the `@security` tag text: OR-joined alternatives, AND-joined schemes
 * within one alternative (parenthesized), scopes as `name[scope, …]`. An
 * empty alternative is the spec's `{}` — rendered as `anonymous`. Returns
 * `undefined` for public operations (no tag emitted).
 */
function renderSecuritySummary(
  requirements: AnalyzedSecurityCall[][] | undefined
): string | undefined {
  if (requirements === undefined || requirements.length === 0) {
    return undefined;
  }
  const alternatives = requirements.map((requirement) => {
    const calls = requirement.map((call) =>
      call.scopes.length > 0 ? `${call.schemeName}[${call.scopes.join(', ')}]` : call.schemeName
    );
    if (calls.length === 0) {
      return 'anonymous';
    }
    return calls.length > 1 ? `(${calls.join(' AND ')})` : (calls[0] ?? '');
  });
  return alternatives.join(' OR ');
}

/**
 * Generate a client method from an analyzed OpenAPI operation.
 *
 * @param op - The analyzed operation
 * @returns Generated method with name, JSDoc, and signature
 */
export function generateMethod(op: MethodOperation): GeneratedMethod {
  const params = buildParameters(op);
  const successType = getSuccessType(op);
  const jsDoc = buildJsDoc(op);

  const signature = `${op.methodName}(${params}): Promise<${successType}>`;

  return {
    name: op.methodName,
    jsDoc,
    signature,
  };
}
