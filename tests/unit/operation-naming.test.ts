import { describe, it, expect } from 'vitest';

import { getOperationTypePrefix } from '../../src/utils/operation-naming.js';

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
