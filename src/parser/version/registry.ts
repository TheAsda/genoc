import { detectSpecVersion } from './version-detector.js';
import type { VersionStrategy } from './version-strategy.js';

/**
 * Registry for managing version strategies
 */
export class VersionStrategyRegistry {
  private strategies: Map<string, VersionStrategy> = new Map();

  /**
   * Register a version strategy for a specific OpenAPI version
   */
  register(strategy: VersionStrategy): void {
    const version = strategy.version();
    this.strategies.set(version, strategy);
  }

  /**
   * Get a version strategy by version string
   * @throws Error if strategy is not registered
   */
  get(version: string): VersionStrategy {
    const strategy = this.strategies.get(version);
    if (!strategy) {
      throw new Error(`No strategy registered for version: ${version}`);
    }
    return strategy;
  }

  /**
   * Detect the version from a raw OpenAPI specification and return the corresponding strategy
   */
  detectAndResolve(rawSpec: unknown): VersionStrategy {
    const version = detectSpecVersion(rawSpec);
    return this.get(version);
  }

  /**
   * Get list of supported version strings
   */
  listSupported(): string[] {
    return Array.from(this.strategies.keys());
  }

  /**
   * Check if a version is supported
   */
  isSupported(version: string): boolean {
    return this.strategies.has(version);
  }
}
