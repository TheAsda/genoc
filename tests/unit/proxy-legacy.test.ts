import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { fetchSpec } from '../../src/utils/proxy.js';

// Non-module-not-found failure: undici's fetch/agents throw a runtime error,
// so the legacy describeFetchError wrapping must be preserved verbatim.
// (Factory returns throwing functions rather than throwing itself, because
// vitest wraps factory throws in its own Error via `cause`.)
vi.mock('undici', () => {
  // Regular function expression (not arrow): the agents are invoked with
  // `new`, and arrows are not constructable.
  const throwFetchFailed = function () {
    throw new TypeError('fetch failed');
  };
  return {
    fetch: throwFetchFailed,
    ProxyAgent: throwFetchFailed,
    EnvHttpProxyAgent: throwFetchFailed,
  };
});

const PROXY_ENV_KEYS = ['HTTP_PROXY', 'http_proxy', 'HTTPS_PROXY', 'https_proxy'] as const;

const savedProxyEnv = new Map<string, string | undefined>();

beforeEach(() => {
  for (const key of PROXY_ENV_KEYS) {
    savedProxyEnv.set(key, process.env[key]);
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of PROXY_ENV_KEYS) {
    const saved = savedProxyEnv.get(key);
    if (saved === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = saved;
    }
  }
});

describe('legacy error wrapping for non-module-not-found failures', () => {
  it('flag path: message starts with "Failed to fetch spec from URL via proxy" and flattens the cause text', async () => {
    await expect(
      fetchSpec('https://example.com/spec.json', { proxy: 'http://proxy.example.com:8080' })
    ).rejects.toThrow(/^Failed to fetch spec from URL via proxy .+: fetch failed$/);
  });

  it('env path: message starts with "Failed to fetch spec from URL via proxy env" and flattens the cause text', async () => {
    process.env.HTTP_PROXY = 'http://proxy.example.com:8080';
    await expect(fetchSpec('https://example.com/spec.json')).rejects.toThrow(
      /^Failed to fetch spec from URL via proxy env: fetch failed$/
    );
  });
});
