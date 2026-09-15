import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

import { lilconfig } from 'lilconfig';
import { parse as parseYaml } from 'yaml';

import { isUrl } from '../utils/url.js';
import { parseConfig } from './config-schema.js';
import type { ClientEntry, FlatConfig, ParsedConfig } from './config-schema.js';
import { UserError } from './errors.js';

const SEARCH_PLACES = ['.genocrc.yml', 'genoc.config.json'];
const SUPPORTED_EXTENSIONS = ['.yml', '.json'];

export interface LoadConfigFileOptions {
  /** Explicit config file path (`--config`); skips discovery when set. */
  explicitPath?: string;
  /** Directory to start discovery from; defaults to `process.cwd()`. */
  searchDir?: string;
}

export interface LoadedConfigFile {
  config: ParsedConfig;
  filepath: string;
}

function formatYamlError(filepath: string, err: unknown): UserError {
  const message = err instanceof Error ? err.message.split('\n')[0] : String(err);
  // yaml@2 exposes the error mark via `linePos` (1-based), not `.line`.
  const mark = (err as { linePos?: Array<{ line: number; col: number }> }).linePos?.[0];
  const location = mark === undefined ? '' : ` at line ${mark.line}, column ${mark.col}`;
  return new UserError(
    `Failed to parse config file ${filepath}: YAML error${location}: ${message}`
  );
}

function yamlLoader(filepath: string, content: string): unknown {
  try {
    return parseYaml(content);
  } catch (err) {
    throw formatYamlError(filepath, err);
  }
}

function jsonLoader(filepath: string, content: string): unknown {
  try {
    return JSON.parse(content);
  } catch (err) {
    throw new UserError(
      `Failed to parse config file ${filepath} as JSON: ${(err as Error).message}`
    );
  }
}

function createSearcher(stopDir: string) {
  return lilconfig('genoc', {
    searchPlaces: SEARCH_PLACES,
    loaders: {
      '.yml': yamlLoader,
      '.json': jsonLoader,
    },
    stopDir,
    // Surface empty files as results so they become UserErrors instead of
    // being silently skipped during the upward search.
    ignoreEmptySearchPlaces: false,
    cache: false,
  });
}

/**
 * Nearest directory at or above `searchDir` containing a `.git` marker — the
 * inclusive stop boundary for discovery. Falls back to the fs root when no
 * git repository is found.
 */
function findGitBoundary(searchDir: string): string {
  let dir = searchDir;
  for (;;) {
    if (existsSync(path.join(dir, '.git'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return path.parse(searchDir).root;
    }
    dir = parent;
  }
}

function resolvePathValue(value: string, configDir: string): string {
  if (isUrl(value) || path.isAbsolute(value)) {
    return value;
  }
  return path.resolve(configDir, value);
}

function resolveConfigPaths(config: ParsedConfig, configDir: string): ParsedConfig {
  if ('clients' in config) {
    const clients: Record<string, ClientEntry> = {};
    for (const [name, entry] of Object.entries(config.clients)) {
      clients[name] = {
        ...entry,
        input: resolvePathValue(entry.input, configDir),
        outputDir: resolvePathValue(entry.outputDir, configDir),
      };
    }
    return { clients };
  }

  const flat: FlatConfig = { ...config };
  if (flat.input !== undefined) {
    flat.input = resolvePathValue(flat.input, configDir);
  }
  if (flat.outputDir !== undefined) {
    flat.outputDir = resolvePathValue(flat.outputDir, configDir);
  }
  return flat;
}

/**
 * Re-validate unique `outputDir`s on resolved absolute paths. The schema-level
 * check inside `parseConfig` compares raw strings only, so `./src/a` and
 * `a/../src/a` pass it yet would clobber each other's fixed output filenames.
 */
function validateResolvedOutputDirs(config: ParsedConfig): void {
  if (!('clients' in config)) {
    return;
  }
  const byOutputDir = new Map<string, string[]>();
  for (const [name, entry] of Object.entries(config.clients)) {
    const names = byOutputDir.get(entry.outputDir) ?? [];
    names.push(name);
    byOutputDir.set(entry.outputDir, names);
  }
  for (const [outputDir, names] of byOutputDir) {
    if (names.length > 1) {
      throw new UserError(
        `Invalid genocrc configuration: duplicate outputDir '${outputDir}' used by clients ${names
          .map((name) => `'${name}'`)
          .join(' and ')}; each client must have a unique output directory.`
      );
    }
  }
}

function finalizeLoadedConfig(
  rawConfig: unknown,
  filepath: string,
  isEmpty: boolean
): LoadedConfigFile {
  if (isEmpty || rawConfig === null || rawConfig === undefined) {
    throw new UserError(`Config file is empty: ${filepath}`);
  }
  const parsed = parseConfig(rawConfig);
  const config = resolveConfigPaths(parsed, path.dirname(filepath));
  validateResolvedOutputDirs(config);
  return { config, filepath };
}

async function loadFromExplicitPath(explicitPath: string): Promise<LoadedConfigFile> {
  const filepath = path.resolve(explicitPath);

  let stats;
  try {
    stats = statSync(filepath);
  } catch {
    throw new UserError(`Config file not found: ${filepath}`);
  }
  if (stats.isDirectory()) {
    throw new UserError(`Config path is a directory, not a config file: ${filepath}`);
  }

  const ext = path.extname(filepath);
  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    throw new UserError(
      `Unsupported config file extension "${ext}": ${filepath}. ` +
        `Supported extensions: ${SUPPORTED_EXTENSIONS.join(', ')}`
    );
  }

  const searcher = createSearcher(findGitBoundary(path.dirname(filepath)));
  try {
    const result = await searcher.load(filepath);
    if (result === null) {
      throw new UserError(`Failed to load config file: ${filepath}`);
    }
    return finalizeLoadedConfig(result.config, result.filepath, result.isEmpty === true);
  } catch (err) {
    if (err instanceof UserError) {
      throw err;
    }
    throw new UserError(`Failed to read config file ${filepath}: ${(err as Error).message}`);
  }
}

async function discoverConfigFile(searchDir: string): Promise<LoadedConfigFile | null> {
  const startDir = path.resolve(searchDir);
  const searcher = createSearcher(findGitBoundary(startDir));
  try {
    const result = await searcher.search(startDir);
    if (result === null || result.filepath === '') {
      return null;
    }
    return finalizeLoadedConfig(result.config, result.filepath, result.isEmpty === true);
  } catch (err) {
    if (err instanceof UserError) {
      throw err;
    }
    throw new UserError(`Failed to load config file during discovery: ${(err as Error).message}`);
  }
}

/**
 * Load the genoc config file. With `explicitPath`, loads exactly that file
 * (skipping discovery). Otherwise discovers `.genocrc.yml` / `genoc.config.json`
 * walking up from `searchDir` (default `process.cwd()`), stopping at the git
 * boundary (fs root fallback). Returns `null` when no config file is found;
 * throws `UserError` for parse errors, schema violations, empty documents,
 * and duplicate resolved output dirs.
 */
export async function loadConfigFile(
  options: LoadConfigFileOptions = {}
): Promise<LoadedConfigFile | null> {
  if (options.explicitPath !== undefined) {
    return loadFromExplicitPath(options.explicitPath);
  }
  return discoverConfigFile(options.searchDir ?? process.cwd());
}
