import { describe, it, expect } from 'vitest';

import { VersionStrategyRegistry } from '../../../src/parser/version/registry.js';
import { V3_0_VersionStrategy } from '../../../src/parser/version/v3.0/strategy.js';
import { V3_1_VersionStrategy } from '../../../src/parser/version/v3.1/strategy.js';
import type { VersionStrategy } from '../../../src/parser/version/version-strategy.js';

describe('VersionStrategyRegistry', () => {
  describe('register + get', () => {
    it('should register and retrieve a strategy', () => {
      const registry = new VersionStrategyRegistry();
      const strategy = new V3_0_VersionStrategy();
      registry.register(strategy);
      expect(registry.get('3.0')).toBe(strategy);
    });

    it('should throw for unregistered version', () => {
      const registry = new VersionStrategyRegistry();
      expect(() => registry.get('9.9')).toThrow(/No strategy registered for version/);
    });
  });

  describe('detectAndResolve', () => {
    it('should detect and resolve a 3.0 spec', () => {
      const registry = new VersionStrategyRegistry();
      registry.register(new V3_0_VersionStrategy());
      registry.register(new V3_1_VersionStrategy());

      const strategy = registry.detectAndResolve({ openapi: '3.0.3' });
      expect(strategy.version()).toBe('3.0');
    });

    it('should detect and resolve a 3.1 spec', () => {
      const registry = new VersionStrategyRegistry();
      registry.register(new V3_0_VersionStrategy());
      registry.register(new V3_1_VersionStrategy());

      const strategy = registry.detectAndResolve({ openapi: '3.1.0' });
      expect(strategy.version()).toBe('3.1');
    });
  });

  describe('listSupported', () => {
    it('should return list of registered version strings', () => {
      const registry = new VersionStrategyRegistry();
      registry.register(new V3_0_VersionStrategy());
      registry.register(new V3_1_VersionStrategy());

      const supported = registry.listSupported();
      expect(supported).toContain('3.0');
      expect(supported).toContain('3.1');
      expect(supported).toHaveLength(2);
    });
  });

  describe('isSupported', () => {
    it('should return true for registered versions', () => {
      const registry = new VersionStrategyRegistry();
      registry.register(new V3_0_VersionStrategy());

      expect(registry.isSupported('3.0')).toBe(true);
    });

    it('should return false for unregistered versions', () => {
      const registry = new VersionStrategyRegistry();

      expect(registry.isSupported('3.0')).toBe(false);
      expect(registry.isSupported('2.0')).toBe(false);
    });
  });
});
