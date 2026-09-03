import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { parse as parseYaml } from 'yaml';

import type { OpenAPIDocument } from '../types/openapi.js';
import { fetchSpec, type LoadOptions } from '../utils/proxy.js';
import { isUrl } from '../utils/url.js';

const VALID_EXTENSIONS = ['.json', '.yaml', '.yml'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

function assertSupportedVersion(doc: unknown): asserts doc is OpenAPIDocument {
  if (
    typeof doc !== 'object' ||
    doc === null ||
    !('openapi' in doc) ||
    typeof (doc as Record<string, unknown>).openapi !== 'string'
  ) {
    throw new Error("Invalid spec: missing or invalid 'openapi' field.");
  }

  const version = (doc as { openapi: string }).openapi;

  // Check for valid version format
  if (!version.match(/^\d+\.\d+(\.\d+)?$/)) {
    throw new Error(`Invalid OpenAPI version format: ${version}`);
  }

  // Check that major version is 3 (but don't restrict minor versions)
  if (!version.startsWith('3.')) {
    throw new Error(`Unsupported OpenAPI version: ${version}. Supported versions: 3.0, 3.1, 3.2`);
  }
}

function parseContent(content: string, ext: string): unknown {
  if (ext === '.json') {
    try {
      return JSON.parse(content);
    } catch (err) {
      throw new Error(`Failed to parse JSON: ${(err as Error).message}`, { cause: err });
    }
  }

  try {
    return parseYaml(content);
  } catch (err) {
    throw new Error(`Failed to parse YAML: ${(err as Error).message}`, { cause: err });
  }
}

export async function loadFromFile(filePath: string): Promise<OpenAPIDocument> {
  const ext = path.extname(filePath).toLowerCase();
  if (!VALID_EXTENSIONS.includes(ext)) {
    throw new Error(
      `Unsupported file extension: "${ext}". Supported extensions: ${VALID_EXTENSIONS.join(', ')}`
    );
  }

  let fileStat;
  try {
    fileStat = await stat(filePath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      throw new Error(`Failed to load spec: file not found: ${filePath}`, { cause: err });
    }
    throw new Error(`Failed to load spec from file: ${(err as Error).message}`, { cause: err });
  }
  if (fileStat.size > MAX_FILE_SIZE) {
    throw new Error(
      `Spec file too large: ${(fileStat.size / 1024 / 1024).toFixed(1)}MB exceeds 50MB limit`
    );
  }

  let content: string;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      throw new Error(`Failed to load spec: file not found: ${filePath}`, { cause: err });
    }
    throw new Error(`Failed to load spec from file: ${(err as Error).message}`, { cause: err });
  }
  const doc = parseContent(content, ext);

  if (typeof doc !== 'object' || doc === null) {
    throw new Error('Failed to parse: spec is not an object.');
  }

  assertSupportedVersion(doc);
  return doc;
}

export async function loadFromUrl(url: string, opts?: LoadOptions): Promise<OpenAPIDocument> {
  let response: Response;
  try {
    response = await fetchSpec(url, opts);
  } catch (err) {
    throw new Error(`Failed to fetch spec from URL: ${(err as Error).message}`, { cause: err });
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch spec from URL: ${response.status} ${response.statusText}`);
  }

  const contentLength = response.headers.get('content-length');
  if (contentLength && Number(contentLength) > MAX_FILE_SIZE) {
    throw new Error(
      `Spec from URL too large: ${(Number(contentLength) / 1024 / 1024).toFixed(1)}MB exceeds 50MB limit`
    );
  }

  const text = await response.text();

  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    try {
      doc = parseYaml(text);
    } catch (yamlErr) {
      throw new Error(
        `Failed to parse spec from URL as JSON or YAML: ${(yamlErr as Error).message}`,
        { cause: yamlErr }
      );
    }
  }

  if (typeof doc !== 'object' || doc === null) {
    throw new Error('Failed to parse: spec is not an object.');
  }

  assertSupportedVersion(doc);
  return doc;
}

export async function load(source: string, opts?: LoadOptions): Promise<OpenAPIDocument> {
  if (isUrl(source)) {
    return loadFromUrl(source, opts);
  }
  return loadFromFile(source);
}
