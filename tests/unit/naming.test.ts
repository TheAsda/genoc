import { describe, it, expect } from 'vitest';

import {
  generateMethodName,
  generateMethodNameFromOperationId,
  getMethodName,
} from '../../src/analyzer/naming.js';
import type { MethodNameStrategy } from '../../src/types/client.js';

describe('generateMethodName', () => {
  it('should convert GET /api/v1/Products to getApiV1Products', () => {
    expect(generateMethodName('GET', '/api/v1/Products')).toBe('getApiV1Products');
  });

  it('should convert GET /api/v1/Products/:productId to getApiV1ProductsByProductId', () => {
    expect(generateMethodName('GET', '/api/v1/Products/:productId')).toBe(
      'getApiV1ProductsByProductId'
    );
  });

  it('should convert POST /api/v1/Products to postApiV1Products', () => {
    expect(generateMethodName('POST', '/api/v1/Products')).toBe('postApiV1Products');
  });

  it('should convert PATCH /api/v1/Products:change-quantity to patchApiV1ProductsChangeQuantity', () => {
    expect(generateMethodName('PATCH', '/api/v1/Products:change-quantity')).toBe(
      'patchApiV1ProductsChangeQuantity'
    );
  });

  it('should convert GET /users/{userId}/posts/{postId} to getUsersByUserIdPostsByPostId', () => {
    expect(generateMethodName('GET', '/users/{userId}/posts/{postId}')).toBe(
      'getUsersByUserIdPostsByPostId'
    );
  });

  it('should convert DELETE /api/v2/user-profile/items/{itemId} to deleteApiV2UserProfileItemsByItemId', () => {
    expect(generateMethodName('DELETE', '/api/v2/user-profile/items/{itemId}')).toBe(
      'deleteApiV2UserProfileItemsByItemId'
    );
  });

  it('should convert PUT /organizations/{orgId}/members to putOrganizationsByOrgIdMembers', () => {
    expect(generateMethodName('PUT', '/organizations/{orgId}/members')).toBe(
      'putOrganizationsByOrgIdMembers'
    );
  });

  it('should convert GET /api/catalog/search-results to getApiCatalogSearchResults', () => {
    expect(generateMethodName('GET', '/api/catalog/search-results')).toBe(
      'getApiCatalogSearchResults'
    );
  });

  // Additional test cases for robustness
  it('should handle lowercase HTTP methods', () => {
    expect(generateMethodName('get', '/api/test')).toBe('getApiTest');
  });

  it('should handle uppercase HTTP methods', () => {
    expect(generateMethodName('POST', '/api/test')).toBe('postApiTest');
  });

  it('should handle mixed case HTTP methods', () => {
    expect(generateMethodName('Get', '/api/test')).toBe('getApiTest');
  });

  it('should handle root path', () => {
    expect(generateMethodName('GET', '/')).toBe('get');
  });

  it('should handle single segment path', () => {
    expect(generateMethodName('GET', '/test')).toBe('getTest');
  });

  it('should handle paths with hyphens in segments', () => {
    expect(generateMethodName('GET', '/api/test-path')).toBe('getApiTestPath');
  });

  it('should handle paths with mixed case segments', () => {
    expect(generateMethodName('GET', '/api/TestCase')).toBe('getApiTestCase');
  });

  it('should handle paths with both static and param segments', () => {
    expect(generateMethodName('GET', '/api/users/:userId/posts')).toBe('getApiUsersByUserIdPosts');
  });

  it('should handle paths with multiple param segments', () => {
    expect(generateMethodName('GET', '/:param1/:param2')).toBe('getByParam1ByParam2');
  });

  it('should handle empty path', () => {
    expect(generateMethodName('GET', '')).toBe('get');
  });

  it('should handle method with trailing slash', () => {
    expect(generateMethodName('GET', '/api/users/')).toBe('getApiUsers');
  });

  it('should handle path param followed by colon action: /{id}:recall', () => {
    expect(generateMethodName('PUT', '/api/v1/CompetencyLevelRequests/{id}:recall')).toBe(
      'putApiV1CompetencyLevelRequestsByIdRecall'
    );
  });

  it('should handle path param followed by colon action: /{id}:offertargets', () => {
    expect(generateMethodName('PUT', '/api/v1/CompetencyLevelRequests/{id}:offertargets')).toBe(
      'putApiV1CompetencyLevelRequestsByIdOffertargets'
    );
  });

  it('should handle path param followed by colon action: /{id}:execute', () => {
    expect(generateMethodName('PUT', '/api/v1/CompetencyLevelRequests/{id}:execute')).toBe(
      'putApiV1CompetencyLevelRequestsByIdExecute'
    );
  });

  it('should handle path param followed by colon action: /{id}:complete', () => {
    expect(generateMethodName('PUT', '/api/v1/CompetencyLevelRequests/{id}:complete')).toBe(
      'putApiV1CompetencyLevelRequestsByIdComplete'
    );
  });
});

describe('generateMethodNameFromOperationId', () => {
  it('should convert camelCase operationId to camelCase', () => {
    expect(generateMethodNameFromOperationId('getUser')).toBe('getUser');
  });

  it('should convert PascalCase operationId to camelCase', () => {
    expect(generateMethodNameFromOperationId('GetUser')).toBe('getUser');
  });

  it('should convert kebab-case operationId to camelCase', () => {
    expect(generateMethodNameFromOperationId('get-user')).toBe('getUser');
  });

  it('should convert snake_case operationId to camelCase', () => {
    expect(generateMethodNameFromOperationId('get_user')).toBe('getUser');
  });

  it('should convert mixed case and separators to camelCase', () => {
    expect(generateMethodNameFromOperationId('Get-User_Info')).toBe('getUserInfo');
  });

  it('should remove non-alphanumeric characters', () => {
    expect(generateMethodNameFromOperationId('get@user#info')).toBe('getUserInfo');
  });

  it('should handle numeric prefixes', () => {
    expect(generateMethodNameFromOperationId('123getUser')).toBe('_123getUser');
  });

  it('should handle reserved words by prefixing underscore', () => {
    expect(generateMethodNameFromOperationId('class')).toBe('_class');
  });

  it('should handle empty operationId', () => {
    expect(() => generateMethodNameFromOperationId('')).toThrow('Operation ID cannot be empty');
  });

  it('should handle operationId starting with number', () => {
    expect(generateMethodNameFromOperationId('123getProducts')).toBe('_123getProducts');
  });

  it('should handle complex operationIds', () => {
    expect(generateMethodNameFromOperationId('get-users-by-id')).toBe('getUsersById');
  });

  it('should handle operationId with special characters', () => {
    expect(generateMethodNameFromOperationId('get_user$%info')).toBe('getUserInfo');
  });
});

describe('getMethodName', () => {
  const testCases: Array<{
    method: string;
    path: string;
    operationId?: string;
    strategy: MethodNameStrategy;
    expected: string;
    shouldThrow?: boolean;
  }> = [
    // Path-based strategy ignores operationId
    {
      method: 'GET',
      path: '/api/users',
      operationId: 'getUserById',
      strategy: 'path-based',
      expected: 'getApiUsers',
    },
    {
      method: 'POST',
      path: '/api/products',
      operationId: 'createProduct',
      strategy: 'path-based',
      expected: 'postApiProducts',
    },
    // OperationId strategy requires operationId
    {
      method: 'GET',
      path: '/api/users',
      operationId: 'getUserById',
      strategy: 'operationId',
      expected: 'getUserById',
    },
    {
      method: 'POST',
      path: '/api/products',
      operationId: 'createProduct',
      strategy: 'operationId',
      expected: 'createProduct',
    },
    // OperationId-with-fallback uses operationId when available
    {
      method: 'GET',
      path: '/api/users',
      operationId: 'getUserById',
      strategy: 'operationId-with-fallback',
      expected: 'getUserById',
    },
    {
      method: 'POST',
      path: '/api/products',
      strategy: 'operationId-with-fallback',
      expected: 'postApiProducts',
    },
    // Test edge case with empty path
    {
      method: 'GET',
      path: '/',
      operationId: 'getRoot',
      strategy: 'operationId-with-fallback',
      expected: 'getRoot',
    },
    // Test with complex operationId
    {
      method: 'PATCH',
      path: '/api/products',
      operationId: 'update-product-quantity',
      strategy: 'operationId',
      expected: 'updateProductQuantity',
    },
  ];

  testCases.forEach((testCase) => {
    if (testCase.shouldThrow) {
      it(`should throw for ${testCase.method} ${testCase.path} with strategy ${testCase.strategy}`, () => {
        expect(() => {
          getMethodName(testCase.method, testCase.path, testCase.operationId, testCase.strategy);
        }).toThrow();
      });
    } else {
      it(`should generate ${testCase.expected} for ${testCase.method} ${testCase.path} with strategy ${testCase.strategy}`, () => {
        expect(
          getMethodName(testCase.method, testCase.path, testCase.operationId, testCase.strategy)
        ).toBe(testCase.expected);
      });
    }
  });

  it('should throw when operationId strategy is used but no operationId provided', () => {
    expect(() => {
      getMethodName('GET', '/api/users', undefined, 'operationId');
    }).toThrow('Operation ID is required for operationId strategy but not provided');
  });

  it('should throw for unknown strategy', () => {
    expect(() => {
      getMethodName('GET', '/api/users', 'getUser', 'unknown-strategy' as MethodNameStrategy);
    }).toThrow('Unknown method name strategy: unknown-strategy');
  });

  it('should handle empty operationId with path-based strategy', () => {
    expect(getMethodName('GET', '/api/users', undefined, 'path-based')).toBe('getApiUsers');
  });

  it('should handle empty operationId with operationId-with-fallback strategy', () => {
    expect(getMethodName('GET', '/api/users', undefined, 'operationId-with-fallback')).toBe(
      'getApiUsers'
    );
  });

  it('should sanitize operationId in operationId strategy', () => {
    expect(getMethodName('GET', '/api/users', 'get-user@123', 'operationId')).toBe('getUser123');
  });

  it('should handle operationId with reserved words', () => {
    expect(getMethodName('GET', '/api/users', 'getClass', 'operationId')).toBe('_getClass');
  });
});

// Integration tests with all 8 examples from the specification
describe('Integration tests - All 8 examples from specification', () => {
  const examples = [
    {
      method: 'GET',
      path: '/api/v1/Products',
      operationId: 'getProducts',
      expected: 'getApiV1Products',
    },
    {
      method: 'GET',
      path: '/api/v1/Products/:productId',
      operationId: 'getProductById',
      expected: 'getApiV1ProductsByProductId',
    },
    {
      method: 'POST',
      path: '/api/v1/Products',
      operationId: 'createProduct',
      expected: 'postApiV1Products',
    },
    {
      method: 'PATCH',
      path: '/api/v1/Products:change-quantity',
      operationId: 'updateProductQuantity',
      expected: 'patchApiV1ProductsChangeQuantity',
    },
    {
      method: 'GET',
      path: '/users/{userId}/posts/{postId}',
      operationId: 'getUserPosts',
      expected: 'getUsersByUserIdPostsByPostId',
    },
    {
      method: 'DELETE',
      path: '/api/v2/user-profile/items/{itemId}',
      operationId: 'deleteUserItem',
      expected: 'deleteApiV2UserProfileItemsByItemId',
    },
    {
      method: 'PUT',
      path: '/organizations/{orgId}/members',
      operationId: 'updateOrganizationMembers',
      expected: 'putOrganizationsByOrgIdMembers',
    },
    {
      method: 'GET',
      path: '/api/catalog/search-results',
      operationId: 'searchCatalog',
      expected: 'getApiCatalogSearchResults',
    },
  ];

  examples.forEach((example, index) => {
    it(`Example ${index + 1}: ${example.method} ${example.path} → ${example.expected}`, () => {
      // Test generateMethodName directly
      expect(generateMethodName(example.method, example.path)).toBe(example.expected);

      // Test getMethodName with path-based strategy
      expect(getMethodName(example.method, example.path, example.operationId, 'path-based')).toBe(
        example.expected
      );
    });
  });

  describe('All examples should work with operationId strategy', () => {
    examples.forEach((example) => {
      it(`should generate ${example.operationId} for ${example.method} ${example.path}`, () => {
        expect(
          getMethodName(example.method, example.path, example.operationId, 'operationId')
        ).toBe(example.operationId);
      });
    });
  });

  describe('All examples should work with operationId-with-fallback strategy', () => {
    examples.forEach((example) => {
      it(`should generate ${example.operationId} for ${example.method} ${example.path}`, () => {
        expect(
          getMethodName(
            example.method,
            example.path,
            example.operationId,
            'operationId-with-fallback'
          )
        ).toBe(example.operationId);
      });
    });
  });
});

describe('generateMethodName — weird route symbols (issue #25)', () => {
  it('sanitizes dots, tildes and brackets in path segments', () => {
    expect(generateMethodName('get', '/api/v1.2/user-settings/{id}/list~all')).toBe(
      'getApiV12UserSettingsByIdListAll'
    );
    expect(generateMethodName('post', '/payment.input')).toBe('postPaymentInput');
  });
});
