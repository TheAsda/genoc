import { generateFullOutput, type ApiClient } from './generator/client-generator.js';
import { load } from './parser/spec-reader.js';
import type { GeneratorConfig } from './types/client.js';
import { assertValidProxyUrl, type LoadOptions } from './utils/proxy.js';

export async function generateClient(config: GeneratorConfig): Promise<void> {
  if (config.proxy) assertValidProxyUrl(config.proxy);
  const doc = await load(config.input, { proxy: config.proxy });
  await generateFullOutput(doc, config);
}

export {
  ApiError,
  UnspecifiedApiError,
  DefaultApiError,
  RequesterFailError,
  StreamResponse,
  ErrorResponse,
  decorateWithErrors,
  isDefinedError,
} from './runtime/index.js';
export type { Requester } from './runtime/index.js';
export type { GeneratorConfig, ApiClient, LoadOptions };
export type { GenerationOptions } from './generator/client-generator.js';
export { load as loadSpec } from './parser/spec-reader.js';
