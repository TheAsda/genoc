import { describe, expect, it } from 'vitest';

import { parseConfig } from '../../src/cli/config-schema.js';
import type { MultiClientConfig } from '../../src/cli/config-schema.js';
import { UserError } from '../../src/cli/errors.js';

function expectUserError(fn: () => unknown): UserError {
  try {
    fn();
    throw new Error('expected parseConfig to throw a UserError, but it did not throw');
  } catch (error) {
    expect(error).toBeInstanceOf(UserError);
    return error as UserError;
  }
}

describe('parseConfig — flat (single client) shape', () => {
  it('should parse a config with all 7 flat keys', () => {
    const config = parseConfig({
      input: './openapi.yaml',
      outputDir: './src/api',
      methodNameStrategy: 'operationId',
      specVersion: '3.1',
      strictVersion: false,
      runtimeImportPath: 'my-runtime',
      proxy: 'http://proxy.example.com:8080',
    });

    expect(config).toEqual({
      input: './openapi.yaml',
      outputDir: './src/api',
      methodNameStrategy: 'operationId',
      specVersion: '3.1',
      strictVersion: false,
      runtimeImportPath: 'my-runtime',
      proxy: 'http://proxy.example.com:8080',
    });
  });

  it('should parse a minimal flat subset (input + outputDir only)', () => {
    expect(parseConfig({ input: './a.yml', outputDir: './src/a' })).toEqual({
      input: './a.yml',
      outputDir: './src/a',
    });
  });

  it.each(['path-based', 'operationId', 'operationId-with-fallback'] as const)(
    'should accept methodNameStrategy=%s in a flat config',
    (strategy) => {
      const config = parseConfig({ methodNameStrategy: strategy });
      expect(config).toEqual({ methodNameStrategy: strategy });
    }
  );

  it('should accept a URL as the flat input value', () => {
    const config = parseConfig({
      input: 'https://api.example.com/openapi.json',
      outputDir: './out',
    });
    expect(config).toEqual({
      input: 'https://api.example.com/openapi.json',
      outputDir: './out',
    });
  });
});

describe('parseConfig — clients map (multi client) shape', () => {
  it('should parse two clients with required and optional keys', () => {
    const config = parseConfig({
      clients: {
        petstore: { input: './a.yml', outputDir: './src/a' },
        billing: {
          input: 'https://x/y.json',
          outputDir: './src/b',
          methodNameStrategy: 'operationId',
        },
      },
    }) as MultiClientConfig;

    expect(config.clients.petstore).toEqual({ input: './a.yml', outputDir: './src/a' });
    expect(config.clients.billing).toEqual({
      input: 'https://x/y.json',
      outputDir: './src/b',
      methodNameStrategy: 'operationId',
    });
  });

  it('should accept a URL as a client input value', () => {
    const config = parseConfig({
      clients: { api: { input: 'https://api.example.com/spec.yaml', outputDir: './src/api' } },
    }) as MultiClientConfig;
    expect(config.clients.api.input).toBe('https://api.example.com/spec.yaml');
  });

  it('should parse an entry with only the required keys', () => {
    const config = parseConfig({
      clients: { only: { input: './s.yml', outputDir: './out' } },
    }) as MultiClientConfig;
    expect(config.clients.only).toEqual({ input: './s.yml', outputDir: './out' });
  });
});

describe('parseConfig — shape conflict (flat keys + clients)', () => {
  it('should reject flat keys mixed with clients and name the conflict', () => {
    const error = expectUserError(() =>
      parseConfig({
        input: './a.yml',
        clients: { petstore: { input: './a.yml', outputDir: './src/a' } },
      })
    );
    expect(error.message).toContain('clients');
    expect(error.message).toContain('input');
    expect(error.message.toLowerCase()).toMatch(/either|not both|cannot mix/);
  });
});

describe('parseConfig — unknown keys', () => {
  it("should reject kebab-case 'output-dir' and list allowed keys", () => {
    const error = expectUserError(() => parseConfig({ 'output-dir': './src/api' }));
    expect(error.message).toContain('output-dir');
    expect(error.message).toContain('outputDir');
    expect(error.message).toContain('methodNameStrategy');
    expect(error.message).toContain('clients');
  });

  it("should reject the deliberately excluded 'requesterModuleName' key", () => {
    const error = expectUserError(() => parseConfig({ requesterModuleName: './my-requester.js' }));
    expect(error.message).toContain('requesterModuleName');
    expect(error.message).not.toMatch(/allowed[^\n]*requesterModuleName/);
  });

  it('should report the key path for an unknown key inside a client entry', () => {
    const error = expectUserError(() =>
      parseConfig({
        clients: { petstore: { input: './a.yml', outputDir: './src/a', outptDir: 'typo' } },
      })
    );
    expect(error.message).toContain('petstore');
    expect(error.message).toContain('outptDir');
  });
});

describe('parseConfig — clients map validation', () => {
  it('should reject an empty clients map', () => {
    const error = expectUserError(() => parseConfig({ clients: {} }));
    expect(error.message).toMatch(/at least one|empty/i);
  });

  it('should reject an empty client name', () => {
    const error = expectUserError(() =>
      parseConfig({ clients: { '': { input: './a.yml', outputDir: './src/a' } } })
    );
    expect(error.message).toMatch(/non-empty|client name/i);
  });

  it('should reject an entry missing input and report the key path', () => {
    const error = expectUserError(() =>
      parseConfig({ clients: { broken: { outputDir: './src/a' } } })
    );
    expect(error.message).toContain('input');
    expect(error.message).toContain('broken');
  });

  it('should reject an entry missing outputDir and report the key path', () => {
    const error = expectUserError(() => parseConfig({ clients: { broken: { input: './a.yml' } } }));
    expect(error.message).toContain('outputDir');
    expect(error.message).toContain('broken');
  });

  it('should reject duplicate outputDirs and name both clients', () => {
    const error = expectUserError(() =>
      parseConfig({
        clients: {
          alpha: { input: './a.yml', outputDir: './src/shared' },
          beta: { input: './b.yml', outputDir: './src/shared' },
        },
      })
    );
    expect(error.message).toContain('alpha');
    expect(error.message).toContain('beta');
    expect(error.message).toContain('./src/shared');
  });

  it('should allow distinct raw outputDirs (dup check is raw-string equality, pre-resolution)', () => {
    const config = parseConfig({
      clients: {
        alpha: { input: './a.yml', outputDir: './src/a' },
        beta: { input: './b.yml', outputDir: 'a/../src/a' },
      },
    });
    expect(config).toBeDefined();
  });

  it('should reject an unknown methodNameStrategy value and list the options', () => {
    const error = expectUserError(() =>
      parseConfig({
        clients: {
          petstore: { input: './a.yml', outputDir: './src/a', methodNameStrategy: 'bogus' },
        },
      })
    );
    expect(error.message).toContain('bogus');
    expect(error.message).toContain('path-based');
    expect(error.message).toContain('operationId');
    expect(error.message).toContain('operationId-with-fallback');
  });
});

describe('parseConfig — type errors', () => {
  it('should reject a number where a string is expected', () => {
    const error = expectUserError(() =>
      parseConfig({ clients: { api: { input: 42, outputDir: './src/a' } } })
    );
    expect(error.message).toMatch(/string/i);
    expect(error.message).toContain('api');
  });

  it('should reject a string where a boolean is expected', () => {
    const error = expectUserError(() => parseConfig({ strictVersion: 'yes' }));
    expect(error.message).toMatch(/boolean/i);
  });
});

describe('parseConfig — empty and non-object input', () => {
  it("should report 'no configuration keys' for {}", () => {
    const error = expectUserError(() => parseConfig({}));
    expect(error.message).toMatch(/no configuration keys/i);
  });

  it("should report 'no configuration keys' for null", () => {
    const error = expectUserError(() => parseConfig(null));
    expect(error.message).toMatch(/no configuration keys/i);
  });

  it('should throw UserError (never a raw zod error) for a string input', () => {
    const error = expectUserError(() => parseConfig('openapi.yaml'));
    expect(error.message).toMatch(/invalid genocrc configuration/i);
    expect(error.message).not.toMatch(/ZodError/);
  });

  it('should throw UserError for an array input', () => {
    const error = expectUserError(() => parseConfig(['./a.yml']));
    expect(error.message).toMatch(/invalid genocrc configuration/i);
  });
});
