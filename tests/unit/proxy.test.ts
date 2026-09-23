import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { fetchSpec, hasProxyEnv, isMissingUndiciError } from '../../src/utils/proxy.js';

// Simulate undici not being installed: any use of the module throws the raw
// module-resolution error. The factory must NOT throw itself — vitest wraps
// factory throws in its own Error (dropping `code`, moving the message into
// `cause`), which would hide the MNF shape from the classifier. A throwing
// function property reaches fetchSpec's catch block unwrapped.
vi.mock('undici', () => {
  // Regular function expression (not arrow): ProxyAgent/EnvHttpProxyAgent are
  // invoked with `new`, and arrows are not constructable.
  const throwMissingUndici = function () {
    throw Object.assign(new Error("Cannot find package 'undici'"), {
      code: 'ERR_MODULE_NOT_FOUND',
    });
  };
  return {
    fetch: throwMissingUndici,
    ProxyAgent: throwMissingUndici,
    EnvHttpProxyAgent: throwMissingUndici,
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

describe('isMissingUndiciError', () => {
  it('returns true for the Node shape: ERR_MODULE_NOT_FOUND code', () => {
    const err = Object.assign(new Error("Cannot find module 'undici'"), {
      code: 'ERR_MODULE_NOT_FOUND',
    });
    expect(isMissingUndiciError(err)).toBe(true);
  });

  it('returns true for the Bun shape: "Cannot find package" message without a code', () => {
    const err = new Error("Cannot find package 'undici' imported from /x/y.ts");
    expect(isMissingUndiciError(err)).toBe(true);
  });

  it('returns false for unrelated errors and non-error values', () => {
    expect(isMissingUndiciError(new TypeError('fetch failed'))).toBe(false);
    expect(isMissingUndiciError(new Error('Connection refused'))).toBe(false);
    expect(isMissingUndiciError('string')).toBe(false);
    expect(isMissingUndiciError(undefined)).toBe(false);
  });
});

describe('fetchSpec with undici missing', () => {
  it('flag path (--proxy): rejects with the friendly install hint', async () => {
    await expect(
      fetchSpec('https://example.com/spec.json', { proxy: 'http://proxy.example.com:8080' })
    ).rejects.toThrow(
      "Proxy support requires the 'undici' package. Install it: npm install undici"
    );
  });

  it('env path (HTTP_PROXY, no opts): rejects with the friendly install hint', async () => {
    process.env.HTTP_PROXY = 'http://proxy.example.com:8080';
    await expect(fetchSpec('https://example.com/spec.json')).rejects.toThrow(
      "Proxy support requires the 'undici' package. Install it: npm install undici"
    );
  });
});

describe('hasProxyEnv', () => {
  it('returns false when HTTP_PROXY is an empty string (truthiness semantics)', () => {
    process.env.HTTP_PROXY = '';
    expect(hasProxyEnv()).toBe(false);
  });
});
