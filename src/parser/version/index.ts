/**
 * Version strategy interface for multi-version OpenAPI support
 */
export type { VersionStrategy } from './version-strategy.js';

/**
 * Version detection and registry for multi-version OpenAPI support
 */
export { detectSpecVersion } from './version-detector.js';
export { VersionStrategyRegistry } from './registry.js';

/**
 * Normalized schema and specification types for consistent multi-version handling
 */
export type { NormalizedSchema, NormalizedSpec } from './normalized-spec.js';

export { V3_0_VersionStrategy } from './v3.0/strategy.js';
export { V3_1_VersionStrategy } from './v3.1/strategy.js';
export { V3_2_VersionStrategy } from './v3.2/strategy.js';

import { VersionStrategyRegistry } from './registry.js';
import { V3_0_VersionStrategy } from './v3.0/strategy.js';
import { V3_1_VersionStrategy } from './v3.1/strategy.js';
import { V3_2_VersionStrategy } from './v3.2/strategy.js';

export const defaultRegistry: VersionStrategyRegistry = new VersionStrategyRegistry();
defaultRegistry.register(new V3_0_VersionStrategy());
defaultRegistry.register(new V3_1_VersionStrategy());
defaultRegistry.register(new V3_2_VersionStrategy());
