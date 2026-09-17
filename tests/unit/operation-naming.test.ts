import { describe, it, expect } from 'vitest';

import {
  getOperationTypePrefix,
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
