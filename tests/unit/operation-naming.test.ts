import { join } from 'path';

import { describe, it, expect } from 'vitest';

import { analyzePaths } from '../../src/analyzer/path-analyzer.js';
import { RefResolver } from '../../src/parser/ref-resolver.js';
import { loadFromFile } from '../../src/parser/spec-reader.js';
import {
  clientImportedNames,
  clientValueImports,
  getOperationTypePrefix,
  operationEmissions,
  RESERVED_TYPE_NAMES,
  RUNTIME_CLASS_NAMES,
  CLIENT_BASE_VALUE_IMPORTS,
  CLIENT_SURFACE_NAMES,
} from '../../src/utils/operation-naming.js';

describe('RESERVED_TYPE_NAMES membership', () => {
  it('derives exactly the frozen 12-name set', () => {
    const frozenNames = [
      'StreamResponse',
      'ErrorResponse',
      'ApiError',
      'UnspecifiedApiError',
      'DefaultApiError',
      'RequesterFailError',
      'Requester',
      'isDefinedError',
      'decorateWithErrors',
      'ApiClient',
      'createClient',
      'FileInput',
    ].sort();
    expect([...RESERVED_TYPE_NAMES].sort()).toEqual(frozenNames);
  });

  it('is exactly the union of runtime classes, client surface names, and FileInput', () => {
    const union = new Set<string>([...RUNTIME_CLASS_NAMES, ...CLIENT_SURFACE_NAMES, 'FileInput']);
    expect(RESERVED_TYPE_NAMES).toEqual(union);
  });

  it('keeps the runtime re-export order (contracts emission order)', () => {
    expect([...RUNTIME_CLASS_NAMES]).toEqual([
      'ApiError',
      'UnspecifiedApiError',
      'DefaultApiError',
      'RequesterFailError',
      'StreamResponse',
      'ErrorResponse',
    ]);
  });

  it('keeps the client base value import order', () => {
    expect([...CLIENT_BASE_VALUE_IMPORTS]).toEqual([
      'ApiError',
      'UnspecifiedApiError',
      'ErrorResponse',
      'StreamResponse',
      'RequesterFailError',
    ]);
  });
});

describe('getOperationTypePrefix — weird routes (issue #25)', () => {
  it('sanitizes dots, tildes and mixed segments', () => {
    expect(
      getOperationTypePrefix({
        method: 'get',
        path: '/api/v1.2/user-settings/{id}/list~all',
      } as never)
    ).toBe('GetApiV12UserSettingsIdListAll');
  });
});

describe('operationEmissions', () => {
  it('emits query/headers/body only when the operation has them', () => {
    const emissions = operationEmissions({
      method: 'post',
      path: '/things',
      queryParams: [{ name: 'limit' }, { name: 'offset' }],
      headerParams: [{ name: 'X-Trace' }],
      requestBody: { required: true, hasSchema: true },
      responses: [],
    } as never);

    expect(emissions.query).toBe('PostThingsQuery');
    expect(emissions.headers).toBe('PostThingsHeaders');
    expect(emissions.body).toBe('PostThingsBody');
    expect(emissions.response).toBeUndefined();
    expect(emissions.statusErrors).toEqual([]);
    expect(emissions.defaultError).toBeUndefined();
    expect(emissions.errorsUnion).toBeUndefined();
  });

  it('emits response for any success response, including 204-only', () => {
    const emissions = operationEmissions({
      method: 'delete',
      path: '/things/{id}',
      queryParams: [],
      headerParams: [],
      responses: [{ statusCode: '204', isSuccess: true, finishedType: 'void' }],
    } as never);

    expect(emissions.response).toBe('DeleteThingsIdResponse');
  });

  it('pairs each non-default error status with a name and derives the union', () => {
    const emissions = operationEmissions({
      method: 'get',
      path: '/things',
      queryParams: [],
      headerParams: [],
      responses: [
        { statusCode: '200', isSuccess: true, finishedType: 'string' },
        { statusCode: '400', isSuccess: false, finishedType: 'unknown' },
        { statusCode: '404', isSuccess: false, finishedType: 'unknown' },
        { statusCode: 'default', isSuccess: false, finishedType: 'unknown' },
      ],
    } as never);

    expect(emissions.statusErrors).toEqual([
      { status: '400', name: 'GetThingsError400' },
      { status: '404', name: 'GetThingsError404' },
    ]);
    expect(emissions.defaultError).toBe('GetThingsDefaultError');
    expect(emissions.errorsUnion).toBe('GetThingsErrors');
  });

  it('emits defaultError without errorsUnion when only a default error exists', () => {
    const emissions = operationEmissions({
      method: 'put',
      path: '/things',
      queryParams: [],
      headerParams: [],
      responses: [
        { statusCode: '200', isSuccess: true, finishedType: 'string' },
        { statusCode: 'default', isSuccess: false, finishedType: 'unknown' },
      ],
    } as never);

    expect(emissions.defaultError).toBe('PutThingsDefaultError');
    expect(emissions.errorsUnion).toBeUndefined();
  });
});

describe('clientImportedNames', () => {
  it('imports query/headers/body, named response, status errors, union, and default error', () => {
    const names = clientImportedNames({
      method: 'post',
      path: '/things',
      queryParams: [{ name: 'limit' }],
      headerParams: [{ name: 'X-Trace' }],
      requestBody: { required: true, hasSchema: true },
      responses: [
        { statusCode: '200', isSuccess: true, tsType: 'PostThingsResponse' },
        { statusCode: '400', isSuccess: false, finishedType: 'unknown' },
        { statusCode: '404', isSuccess: false, finishedType: 'unknown' },
        { statusCode: 'default', isSuccess: false, finishedType: 'unknown' },
      ],
    } as never);

    expect(names).toEqual([
      'PostThingsQuery',
      'PostThingsHeaders',
      'PostThingsBody',
      'PostThingsResponse',
      'PostThingsError400',
      'PostThingsError404',
      'PostThingsErrors',
      'PostThingsDefaultError',
    ]);
  });

  it('does not import the response type for 204-only operations', () => {
    const names = clientImportedNames({
      method: 'delete',
      path: '/things/{id}',
      queryParams: [],
      headerParams: [],
      responses: [{ statusCode: '204', isSuccess: true, finishedType: 'void' }],
    } as never);

    expect(names).toEqual([]);
  });

  it('does not import a response when the operation has no success responses', () => {
    const names = clientImportedNames({
      method: 'get',
      path: '/things',
      queryParams: [],
      headerParams: [],
      responses: [{ statusCode: '400', isSuccess: false, finishedType: 'unknown' }],
    } as never);

    expect(names).toEqual(['GetThingsError400', 'GetThingsErrors']);
  });
});

describe('clientValueImports', () => {
  it('returns the base value imports when no operation has a default error response', () => {
    const operations = [
      {
        method: 'get',
        path: '/things',
        queryParams: [],
        headerParams: [],
        responses: [{ statusCode: '200', isSuccess: true, finishedType: 'string' }],
      },
    ] as never[];

    expect(clientValueImports(operations)).toEqual([...CLIENT_BASE_VALUE_IMPORTS]);
  });

  it('appends DefaultApiError when any operation has a default error response', () => {
    const operations = [
      {
        method: 'get',
        path: '/things',
        queryParams: [],
        headerParams: [],
        responses: [{ statusCode: '200', isSuccess: true, finishedType: 'string' }],
      },
      {
        method: 'put',
        path: '/things',
        queryParams: [],
        headerParams: [],
        responses: [
          { statusCode: '200', isSuccess: true, finishedType: 'string' },
          { statusCode: 'default', isSuccess: false, finishedType: 'unknown' },
        ],
      },
    ] as never[];

    expect(clientValueImports(operations)).toEqual([
      ...CLIENT_BASE_VALUE_IMPORTS,
      'DefaultApiError',
    ]);
  });
});

describe('imported ⊆ emitted inventory (property)', () => {
  const fixtures = ['operations-spec.json', 'weird-symbol-names.json', 'petstore.yaml'];

  it.for(fixtures)('holds for every operation in %s', async (fixture) => {
    const doc = await loadFromFile(join(__dirname, '../fixtures/', fixture));
    const resolver = new RefResolver(doc);
    const operations = analyzePaths(doc, resolver, 'path-based');

    expect(operations.length).toBeGreaterThan(0);

    for (const op of operations) {
      const emissions = operationEmissions(op);
      const emittedNames = [
        emissions.query,
        emissions.headers,
        emissions.body,
        emissions.response,
        ...emissions.statusErrors.map((statusError) => statusError.name),
        emissions.defaultError,
        emissions.errorsUnion,
      ].filter((name): name is string => name !== undefined);
      const emitted = new Set<string>(emittedNames);

      for (const imported of clientImportedNames(op)) {
        expect(
          emitted.has(imported),
          `${imported} imported but not emitted for ${op.method} ${op.path}`
        ).toBe(true);
      }
    }
  });
});
