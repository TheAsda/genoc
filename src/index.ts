import { generateFullOutput, type ApiClient } from './generator/client-generator.js';
import { load } from './parser/spec-reader.js';
import type { GeneratorConfig } from './types/client.js';

export async function generateClient(config: GeneratorConfig): Promise<void> {
  const doc = await load(config.input);
  await generateFullOutput(doc, config);
}

export {
  ApiError,
  UnspecifiedApiError,
  DefaultApiError,
  RequesterFailError,
  StreamResponse,
  streamResponse,
  ErrorResponse,
  errorResponse,
  decorateWithErrors,
  isDefinedError,
} from './runtime/index.js';
export type { Requester } from './runtime/index.js';
export type { GeneratorConfig, ApiClient };
export type { GenerationOptions } from './generator/client-generator.js';
export { load as loadSpec } from './parser/spec-reader.js';
