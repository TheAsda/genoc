import { z } from 'zod';

import type { MethodNameStrategy } from '../types/client.js';
import { UserError } from './errors.js';

/**
 * Zod-based validation for the genoc config file (`.genocrc.yml` / `.genocrc.json`).
 *
 * Two mutually exclusive shapes:
 *  - flat (single client): the 7 generator option keys, all optional at the schema level
 *    (requiredness is positional: file config XOR CLI flags fill them in).
 *  - multi (multi client): ONLY a `clients` key at the root; each entry REQUIRES
 *    `input` + `outputDir`, with the 5 strategy options optional.
 *
 * `requesterModuleName` is deliberately excluded — it is a dead field and must not
 * be advertised in the config file schema.
 */

export const METHOD_NAME_STRATEGIES = [
  'path-based',
  'operationId',
  'operationId-with-fallback',
] as const satisfies readonly MethodNameStrategy[];

const FLAT_OPTION_KEYS = [
  'input',
  'outputDir',
  'methodNameStrategy',
  'specVersion',
  'strictVersion',
  'runtimeImportPath',
  'proxy',
] as const;

const methodNameStrategySchema = z.enum(METHOD_NAME_STRATEGIES);

const baseOptionsSchema = z
  .object({
    input: z.string().optional(),
    outputDir: z.string().optional(),
    methodNameStrategy: methodNameStrategySchema.optional(),
    specVersion: z.string().optional(),
    strictVersion: z.boolean().optional(),
    runtimeImportPath: z.string().optional(),
    proxy: z.string().optional(),
  })
  .strict();

/** Flat (single client) config: the 7 option keys, all optional, nothing else allowed. */
export const flatConfigSchema = baseOptionsSchema;

/** One `clients` map entry: `input` + `outputDir` required, strategy options optional. */
const clientEntrySchema = baseOptionsSchema
  .extend({ input: z.string(), outputDir: z.string() })
  .strict();

const clientsSchema = z.record(z.string().min(1), clientEntrySchema);

/**
 * Multi-client config: ONLY `clients` at the root.
 *
 * The `superRefine` below checks raw string values pre-resolution: duplicate
 * `outputDir`s are detected by exact raw string equality. Path resolution to
 * absolute paths happens later in the config loader, which may add stricter
 * post-resolution checks; at the schema level only raw equality applies
 * (e.g. `./src/a` and `a/../src/a` are distinct here).
 */
export const multiClientConfigSchema = z
  .object({ clients: clientsSchema })
  .strict()
  .superRefine((config, ctx) => {
    const names = Object.keys(config.clients);
    if (names.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: "'clients' map must contain at least one client.",
        path: ['clients'],
      });
      return;
    }

    const byOutputDir = new Map<string, string[]>();
    for (const [name, entry] of Object.entries(config.clients)) {
      const list = byOutputDir.get(entry.outputDir) ?? [];
      list.push(name);
      byOutputDir.set(entry.outputDir, list);
    }
    for (const [outputDir, clientNames] of byOutputDir) {
      if (clientNames.length > 1) {
        ctx.addIssue({
          code: 'custom',
          message: `Duplicate outputDir '${outputDir}' used by clients ${clientNames
            .map((name) => `'${name}'`)
            .join(' and ')}; each client must have a unique output directory.`,
          path: ['clients'],
        });
      }
    }
  });

/** Union of both shapes. `parseConfig` dispatches on shape for precise error messages. */
export const configSchema = z.union([flatConfigSchema, multiClientConfigSchema]);

export type FlatConfig = z.infer<typeof flatConfigSchema>;
export type ClientEntry = z.infer<typeof clientEntrySchema>;
export type MultiClientConfig = z.infer<typeof multiClientConfigSchema>;
export type ParsedConfig = FlatConfig | MultiClientConfig;

const ROOT_ALLOWED_KEYS = [...FLAT_OPTION_KEYS, 'clients'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatKeyPath(path: PropertyKey[]): string {
  return path.length === 0 ? 'configuration root' : `'${path.map(String).join('.')}'`;
}

function allowedKeysFor(path: PropertyKey[]): string {
  if (path.length >= 2 && path[0] === 'clients') {
    return FLAT_OPTION_KEYS.join(', ');
  }
  return ROOT_ALLOWED_KEYS.join(', ');
}

function valueAtPath(raw: unknown, path: PropertyKey[]): unknown {
  let current: unknown = raw;
  for (const segment of path) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[String(segment)];
  }
  return current;
}

function formatIssue(issue: z.core.$ZodIssue, parentPath: PropertyKey[], raw: unknown): string {
  const path = issue.path.length > 0 ? issue.path : parentPath;

  if (issue.code === 'unrecognized_keys' && 'keys' in issue) {
    const keys = issue.keys.map((key) => `'${key}'`).join(', ');
    const plural = issue.keys.length > 1 ? 's' : '';
    return `- unknown key${plural} ${keys} at ${formatKeyPath(path)}; allowed keys: ${allowedKeysFor(path)}`;
  }

  if (issue.code === 'invalid_key') {
    return `- ${formatKeyPath(path)}: invalid client name; client names must be non-empty strings`;
  }

  if (issue.code === 'invalid_value') {
    const received = valueAtPath(raw, path);
    const receivedText = received === undefined ? '' : `; received '${String(received)}'`;
    return `- ${formatKeyPath(path)}: ${issue.message}${receivedText}`;
  }

  return `- ${formatKeyPath(path)}: ${issue.message}`;
}

function formatIssues(issues: z.core.$ZodIssue[], raw: unknown): string {
  const lines: string[] = [];
  for (const issue of issues) {
    if (issue.code === 'invalid_key') {
      lines.push(formatIssue(issue, issue.path, raw));
      continue;
    }

    const subIssues = (issue as { issues?: z.core.$ZodIssue[] }).issues;
    if (Array.isArray(subIssues) && subIssues.length > 0) {
      for (const sub of subIssues) {
        lines.push(formatIssue(sub, issue.path, raw));
      }
    } else {
      lines.push(formatIssue(issue, issue.path, raw));
    }
  }
  return lines.join('\n');
}

function formatUserError(issues: z.core.$ZodIssue[], raw: unknown): UserError {
  return new UserError(`Invalid genocrc configuration:\n${formatIssues(issues, raw)}`);
}

/**
 * Parse and validate a raw config file document (already deserialized from YAML/JSON).
 * Returns the parsed config, or throws a single `UserError` whose message names the
 * offending key path, the problem, and the allowed keys.
 */
export function parseConfig(raw: unknown): ParsedConfig {
  if (raw === null || raw === undefined || (isRecord(raw) && Object.keys(raw).length === 0)) {
    throw new UserError(
      'Invalid genocrc configuration: no configuration keys found. ' +
        `Add flat options (${FLAT_OPTION_KEYS.join(', ')}) for a single client ` +
        `or a 'clients' map for multiple clients.`
    );
  }

  if (isRecord(raw) && 'clients' in raw) {
    const flatKeys = FLAT_OPTION_KEYS.filter((key) => key in raw);
    if (flatKeys.length > 0) {
      throw new UserError(
        `Invalid genocrc configuration: cannot mix flat options (${flatKeys
          .map((key) => `'${key}'`)
          .join(', ')}) with a 'clients' map. Use EITHER flat options ` +
          `(${FLAT_OPTION_KEYS.join(', ')}) for a single client OR a 'clients' map ` +
          'for multiple clients — not both.'
      );
    }

    const result = multiClientConfigSchema.safeParse(raw);
    if (!result.success) {
      throw formatUserError(result.error.issues, raw);
    }
    return result.data;
  }

  const result = flatConfigSchema.safeParse(raw);
  if (!result.success) {
    throw formatUserError(result.error.issues, raw);
  }
  return result.data;
}
