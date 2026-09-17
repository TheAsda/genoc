import { describe, it, expect } from 'vitest';

import {
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
      requestBody: { required: true, schema: { type: 'object' } },
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
      responses: [{ statusCode: '204', isSuccess: true, tsType: 'void' }],
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
        { statusCode: '200', isSuccess: true, tsType: 'string' },
        { statusCode: '400', isSuccess: false, tsType: 'unknown' },
        { statusCode: '404', isSuccess: false, tsType: 'unknown' },
        { statusCode: 'default', isSuccess: false, tsType: 'unknown' },
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
        { statusCode: '200', isSuccess: true, tsType: 'string' },
        { statusCode: 'default', isSuccess: false, tsType: 'unknown' },
      ],
    } as never);

    expect(emissions.defaultError).toBe('PutThingsDefaultError');
    expect(emissions.errorsUnion).toBeUndefined();
  });
});
