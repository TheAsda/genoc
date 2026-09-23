import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { analyze } from '../../src/analyzer/analyze.js';
import type { OpenAPIDocument } from '../../src/types/openapi.js';

const expectedMessage =
  'Warning: \'nullable\' is deprecated in OpenAPI 3.1. Use \'type: ["string", "null"]\' instead.';

function buildDocWithNullable(openapi: string): OpenAPIDocument {
  return {
    openapi,
    info: { title: 'Version gate', version: '1.0.0' },
    paths: {
      '/items': {
        get: {
          responses: {
            '200': {
              description: 'ok',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/Thing' } },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        Thing: {
          type: 'object',
          properties: { note: { type: 'string', nullable: true } },
        },
      },
    },
  };
}

describe('analyze() nullable warning dialect gate', () => {
  let stderrWrites: string[] = [];

  beforeEach(() => {
    stderrWrites = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: Uint8Array | string) => {
      stderrWrites.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function nullableWarnings(): string[] {
    return stderrWrites.filter((chunk) => chunk === expectedMessage);
  }

  it("is silent for a 3.0 doc analyzed with effectiveVersion '3.0'", () => {
    analyze(buildDocWithNullable('3.0.3'), { effectiveVersion: '3.0' });

    expect(nullableWarnings()).toEqual([]);
  });

  it("warns exactly once for a 3.0 doc analyzed with effectiveVersion '3.1' (override beats detected)", () => {
    analyze(buildDocWithNullable('3.0.3'), { effectiveVersion: '3.1' });

    expect(nullableWarnings()).toEqual([expectedMessage]);
  });

  it("is silent for a 3.1 doc analyzed with effectiveVersion '3.0' (override works both directions)", () => {
    analyze(buildDocWithNullable('3.1.0'), { effectiveVersion: '3.0' });

    expect(nullableWarnings()).toEqual([]);
  });
});
