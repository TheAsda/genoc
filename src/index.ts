import { generateFullOutput, type ApiClient } from './generator/client-generator.js';
import { ApiError, DefaultApiError } from './generator/error-types.js';
import { load } from './parser/spec-reader.js';
import type { GeneratorConfig } from './types/client.js';

export async function generateClient(config: GeneratorConfig): Promise<void> {
  const doc = await load(config.input);
  await generateFullOutput(doc, config);
}

export type { GeneratorConfig, ApiClient, ApiError, DefaultApiError };
export type { GenerationOptions } from './generator/client-generator.js';
export { load as loadSpec } from './parser/spec-reader.js';
