/**
 * Version detection and validation for multi-version OpenAPI support
 */
export { detectSpecVersion, resolveVersion } from './version-detector.js';
export type { VersionProfile } from './version-detector.js';
export { validateSpec } from './validate.js';
