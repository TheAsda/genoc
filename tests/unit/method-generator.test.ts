import { describe, expect, it } from 'vitest';

import type {
  AnalyzedOperation,
  AnalyzedParameter,
  AnalyzedRequestBody,
  AnalyzedResponse,
} from '../../src/analyzer/path-analyzer.js';
import { generateMethod } from '../../src/generator/method-generator.js';

function makeOp(overrides: Partial<AnalyzedOperation>): AnalyzedOperation {
  return {
    method: 'get',
    path: '/api/v1/products',
    operationId: undefined,
    methodName: 'getApiV1Products',
    summary: undefined,
    description: undefined,
    deprecated: false,
    tags: [],
    pathParams: [],
    queryParams: [],
    headerParams: [],
    cookieParams: [],
    requestBody: undefined,
    responses: [],
    ...overrides,
  };
}

function successResponse(statusCode: string, tsType = 'unknown'): AnalyzedResponse {
  return {
    statusCode,
    description: undefined,
    schema: undefined,
    tsType,
    isSuccess: true,
    isBinary: false,
  };
}

function makeErrorResponse(statusCode: string): AnalyzedResponse {
  return {
    statusCode,
    description: undefined,
    schema: undefined,
    tsType: 'unknown',
    isSuccess: false,
    isBinary: false,
  };
}

function pathParam(name: string): AnalyzedParameter {
  return {
    name,
    in: 'path',
    required: true,
    schema: { type: 'string' },
    tsType: 'string',
    description: undefined,
  };
}

function queryParam(name: string, required = false, tsType = 'string'): AnalyzedParameter {
  return {
    name,
    in: 'query',
    required,
    schema: { type: 'string' },
    tsType,
    description: undefined,
  };
}

describe('generateMethod', () => {
  describe('Section 7.2 Example 1: GET /api/v1/products', () => {
    it('generates correct signature with optional query param object', () => {
      const op = makeOp({
        method: 'get',
        path: '/api/v1/products',
        methodName: 'getApiV1Products',
        queryParams: [queryParam('page', false), queryParam('limit', false)],
        responses: [successResponse('200', 'Product[]')],
      });

      const result = generateMethod(op);

      expect(result.name).toBe('getApiV1Products');
      expect(result.signature).toBe(
        'getApiV1Products(query?: GetApiV1ProductsQuery): Promise<GetApiV1ProductsResponse>'
      );
    });

    it('generates implementation with query string construction', () => {
      const op = makeOp({
        method: 'get',
        path: '/api/v1/products',
        methodName: 'getApiV1Products',
        queryParams: [queryParam('page'), queryParam('limit')],
        responses: [successResponse('200', 'Product[]')],
      });

      const result = generateMethod(op);

      expect(result.implementation).toMatchSnapshot();
    });
  });

  describe('Section 7.2 Example 2: GET /api/v1/products/{productId}', () => {
    it('generates correct signature with flat path param', () => {
      const op = makeOp({
        method: 'get',
        path: '/api/v1/products/{productId}',
        methodName: 'getApiV1ProductsByProductId',
        pathParams: [pathParam('productId')],
        responses: [successResponse('200', 'Product')],
      });

      const result = generateMethod(op);

      expect(result.name).toBe('getApiV1ProductsByProductId');
      expect(result.signature).toBe(
        'getApiV1ProductsByProductId(productId: string): Promise<GetApiV1ProductsProductIdResponse>'
      );
    });

    it('generates URL with encodeURIComponent for path params', () => {
      const op = makeOp({
        method: 'get',
        path: '/api/v1/products/{productId}',
        methodName: 'getApiV1ProductsByProductId',
        pathParams: [pathParam('productId')],
        responses: [successResponse('200')],
      });

      const result = generateMethod(op);

      expect(result.implementation).toMatchSnapshot();
    });
  });

  describe('Section 7.2 Example 3: GET /users/{userId}/posts/{postId}', () => {
    it('generates correct signature with multiple flat path params', () => {
      const op = makeOp({
        method: 'get',
        path: '/users/{userId}/posts/{postId}',
        methodName: 'getUsersByUserIdPostsByPostId',
        pathParams: [pathParam('userId'), pathParam('postId')],
        responses: [successResponse('200', 'Post')],
      });

      const result = generateMethod(op);

      expect(result.name).toBe('getUsersByUserIdPostsByPostId');
      expect(result.signature).toBe(
        'getUsersByUserIdPostsByPostId(userId: string, postId: string): Promise<GetUsersUserIdPostsPostIdResponse>'
      );
    });

    it('generates URL with both path params encoded', () => {
      const op = makeOp({
        method: 'get',
        path: '/users/{userId}/posts/{postId}',
        methodName: 'getUsersByUserIdPostsByPostId',
        pathParams: [pathParam('userId'), pathParam('postId')],
        responses: [successResponse('200')],
      });

      const result = generateMethod(op);

      expect(result.implementation).toMatchSnapshot();
    });
  });

  describe('Section 7.2 Example 4: POST /api/v1/products', () => {
    it('generates correct signature with body param', () => {
      const requestBody: AnalyzedRequestBody = {
        required: true,
        contentTypes: ['application/json'],
        schema: { type: 'object' },
        tsType: 'PostApiV1ProductsBody',
        isMultipart: false,
      };

      const op = makeOp({
        method: 'post',
        path: '/api/v1/products',
        methodName: 'postApiV1Products',
        requestBody,
        responses: [successResponse('201', 'CreatedProduct')],
      });

      const result = generateMethod(op);

      expect(result.name).toBe('postApiV1Products');
      expect(result.signature).toBe(
        'postApiV1Products(body: PostApiV1ProductsBody): Promise<PostApiV1ProductsResponse>'
      );
    });

    it('generates implementation with body in requester options', () => {
      const requestBody: AnalyzedRequestBody = {
        required: true,
        contentTypes: ['application/json'],
        schema: { type: 'object' },
        tsType: 'PostApiV1ProductsBody',
        isMultipart: false,
      };

      const op = makeOp({
        method: 'post',
        path: '/api/v1/products',
        methodName: 'postApiV1Products',
        requestBody,
        responses: [successResponse('201')],
      });

      const result = generateMethod(op);

      expect(result.implementation).toMatchSnapshot();
    });
  });

  describe('Section 7.2 Example 5: PATCH /api/v1/products:changeQuantity', () => {
    it('generates correct signature with optional query and void return', () => {
      const op = makeOp({
        method: 'patch',
        path: '/api/v1/products:changeQuantity',
        methodName: 'patchApiV1ProductsChangeQuantity',
        queryParams: [queryParam('delta', false)],
        responses: [successResponse('204', 'void')],
      });

      const result = generateMethod(op);

      expect(result.name).toBe('patchApiV1ProductsChangeQuantity');
      expect(result.signature).toBe(
        'patchApiV1ProductsChangeQuantity(query?: PatchApiV1ProductsChangeQuantityQuery): Promise<void>'
      );
    });

    it('generates requester call with void return type for 204', () => {
      const op = makeOp({
        method: 'patch',
        path: '/api/v1/products:changeQuantity',
        methodName: 'patchApiV1ProductsChangeQuantity',
        queryParams: [queryParam('delta', false)],
        responses: [successResponse('204', 'void')],
      });

      const result = generateMethod(op);

      expect(result.implementation).toMatchSnapshot();
    });
  });

  describe('Section 7.2 Example 6: PUT /organizations/{orgId}/members', () => {
    it('generates correct signature with path param and body', () => {
      const requestBody: AnalyzedRequestBody = {
        required: true,
        contentTypes: ['application/json'],
        schema: { type: 'object' },
        tsType: 'PutOrganizationsOrgIdMembersBody',
        isMultipart: false,
      };

      const op = makeOp({
        method: 'put',
        path: '/organizations/{orgId}/members',
        methodName: 'putOrganizationsByOrgIdMembers',
        pathParams: [pathParam('orgId')],
        requestBody,
        responses: [successResponse('200', 'Member[]')],
      });

      const result = generateMethod(op);

      expect(result.name).toBe('putOrganizationsByOrgIdMembers');
      expect(result.signature).toBe(
        'putOrganizationsByOrgIdMembers(orgId: string, body: PutOrganizationsOrgIdMembersBody): Promise<PutOrganizationsOrgIdMembersResponse>'
      );
    });

    it('generates implementation with both params and body', () => {
      const requestBody: AnalyzedRequestBody = {
        required: true,
        contentTypes: ['application/json'],
        schema: { type: 'object' },
        tsType: 'PutOrganizationsOrgIdMembersBody',
        isMultipart: false,
      };

      const op = makeOp({
        method: 'put',
        path: '/organizations/{orgId}/members',
        methodName: 'putOrganizationsByOrgIdMembers',
        pathParams: [pathParam('orgId')],
        requestBody,
        responses: [successResponse('200')],
      });

      const result = generateMethod(op);

      expect(result.implementation).toMatchSnapshot();
    });
  });

  describe('Section 7.2 Example 7: GET /items/{itemId}/reviews', () => {
    it('generates correct signature with path param and optional query', () => {
      const op = makeOp({
        method: 'get',
        path: '/items/{itemId}/reviews',
        methodName: 'getItemsByItemIdReviews',
        pathParams: [pathParam('itemId')],
        queryParams: [queryParam('sort', false), queryParam('order', false)],
        responses: [successResponse('200', 'Review[]')],
      });

      const result = generateMethod(op);

      expect(result.name).toBe('getItemsByItemIdReviews');
      expect(result.signature).toBe(
        'getItemsByItemIdReviews(itemId: string, query?: GetItemsItemIdReviewsQuery): Promise<GetItemsItemIdReviewsResponse>'
      );
    });

    it('generates implementation with path param, query, and correct type prefix', () => {
      const op = makeOp({
        method: 'get',
        path: '/items/{itemId}/reviews',
        methodName: 'getItemsByItemIdReviews',
        pathParams: [pathParam('itemId')],
        queryParams: [queryParam('sort', false)],
        responses: [successResponse('200')],
      });

      const result = generateMethod(op);

      expect(result.implementation).toMatchSnapshot();
    });
  });

  describe('return types', () => {
    it('returns Promise<unknown> when no success responses', () => {
      const op = makeOp({
        responses: [makeErrorResponse('400'), makeErrorResponse('500')],
      });

      const result = generateMethod(op);

      expect(result.signature).toContain('Promise<unknown>');
    });

    it('returns Promise<void> for 204 No Content only', () => {
      const op = makeOp({
        responses: [successResponse('204', 'void')],
      });

      const result = generateMethod(op);

      expect(result.signature).toContain('Promise<void>');
    });

    it('uses single Response type for success with same schema', () => {
      const op = makeOp({
        responses: [successResponse('200'), successResponse('201')],
      });

      const result = generateMethod(op);

      expect(result.signature).toContain('Promise<GetApiV1ProductsResponse>');
    });
  });

  describe('query param optionality', () => {
    it('query object is required when any query param is required', () => {
      const op = makeOp({
        queryParams: [queryParam('page', true), queryParam('sort', false)],
        responses: [successResponse('200')],
      });

      const result = generateMethod(op);

      expect(result.signature).toContain('query: GetApiV1ProductsQuery');
      expect(result.signature).not.toContain('query?:');
    });

    it('query object is optional when all query params are optional', () => {
      const op = makeOp({
        queryParams: [queryParam('page', false), queryParam('sort', false)],
        responses: [successResponse('200')],
      });

      const result = generateMethod(op);

      expect(result.signature).toContain('query?: GetApiV1ProductsQuery');
    });

    it('query object uses explicit undefined when all query params are optional AND body is required', () => {
      const requestBody: AnalyzedRequestBody = {
        required: true,
        contentTypes: ['application/json'],
        schema: { type: 'object' },
        tsType: 'PostApiV1ProductsBody',
        isMultipart: false,
      };

      const op = makeOp({
        queryParams: [queryParam('page', false), queryParam('sort', false)],
        requestBody,
        responses: [successResponse('200', 'Product[]')],
      });

      const result = generateMethod(op);

      expect(result.signature).toContain('query: GetApiV1ProductsQuery | undefined');
      expect(result.signature).not.toContain('query?:');
    });

    it('query object is optional when all query params are optional AND body is optional', () => {
      const requestBody: AnalyzedRequestBody = {
        required: false,
        contentTypes: ['application/json'],
        schema: { type: 'object' },
        tsType: 'PostApiV1ProductsBody',
        isMultipart: false,
      };

      const op = makeOp({
        queryParams: [queryParam('page', false), queryParam('sort', false)],
        requestBody,
        responses: [successResponse('200', 'Product[]')],
      });

      const result = generateMethod(op);

      expect(result.signature).toContain('query?: GetApiV1ProductsQuery');
    });
  });

  describe('JSDoc generation', () => {
    it('generates JSDoc from summary', () => {
      const op = makeOp({
        summary: 'List all products',
        responses: [successResponse('200')],
      });

      const result = generateMethod(op);

      expect(result.jsDoc).toBe(`/**
 * List all products
 */`);
    });

    it('generates JSDoc with summary and description separated by blank line', () => {
      const op = makeOp({
        summary: 'List all products',
        description: 'Returns a paginated list of products.',
        responses: [successResponse('200')],
      });

      const result = generateMethod(op);

      expect(result.jsDoc).toBe(`/**
 * List all products
 *
 * Returns a paginated list of products.
 */`);
    });

    it('generates JSDoc with only description when no summary', () => {
      const op = makeOp({
        description: 'Returns a paginated list of products.',
        responses: [successResponse('200')],
      });

      const result = generateMethod(op);

      expect(result.jsDoc).toBe(`/**
 * Returns a paginated list of products.
 */`);
    });

    it('does not duplicate summary as description', () => {
      const op = makeOp({
        summary: 'List all products',
        description: 'List all products',
        responses: [successResponse('200')],
      });

      const result = generateMethod(op);

      expect(result.jsDoc).toBe(`/**
 * List all products
 */`);
    });

    it('adds @deprecated tag for deprecated operations', () => {
      const op = makeOp({
        summary: 'List all products',
        deprecated: true,
        responses: [successResponse('200')],
      });

      const result = generateMethod(op);

      expect(result.jsDoc).toContain('@deprecated');
    });

    it('adds @deprecated even without summary/description', () => {
      const op = makeOp({
        deprecated: true,
        responses: [successResponse('200')],
      });

      const result = generateMethod(op);

      expect(result.jsDoc).toBe(`/**
 * @deprecated
 */`);
    });

    it('returns empty string when no summary, description, or deprecated', () => {
      const op = makeOp({ responses: [successResponse('200')] });

      const result = generateMethod(op);

      expect(result.jsDoc).toBe('');
    });

    it('adds @category tag for single tag', () => {
      const op = makeOp({
        summary: 'List all products',
        tags: ['pets'],
        responses: [successResponse('200')],
      });

      const result = generateMethod(op);

      expect(result.jsDoc).toBe(`/**
 * List all products
 *
 * @category pets
 */`);
    });

    it('adds @category tag for multiple tags', () => {
      const op = makeOp({
        summary: 'List all products',
        tags: ['pets', 'admin'],
        responses: [successResponse('200')],
      });

      const result = generateMethod(op);

      expect(result.jsDoc).toBe(`/**
 * List all products
 *
 * @category pets
 * @category admin
 */`);
    });

    it('adds @category tags in order after summary/description', () => {
      const op = makeOp({
        summary: 'List all products',
        description: 'Returns a paginated list of products.',
        tags: ['pets', 'store'],
        responses: [successResponse('200')],
      });

      const result = generateMethod(op);

      expect(result.jsDoc).toBe(`/**
 * List all products
 *
 * Returns a paginated list of products.
 *
 * @category pets
 * @category store
 */`);
    });

    it('adds @category tags before @deprecated tag', () => {
      const op = makeOp({
        summary: 'List all products',
        tags: ['pets'],
        deprecated: true,
        responses: [successResponse('200')],
      });

      const result = generateMethod(op);

      expect(result.jsDoc).toBe(`/**
 * List all products
 *
 * @category pets
 *
 * @deprecated
 */`);
    });

    it("adds @category tags when there's no summary or description", () => {
      const op = makeOp({
        tags: ['admin'],
        responses: [successResponse('200')],
      });

      const result = generateMethod(op);

      expect(result.jsDoc).toBe(`/**
 * @category admin
 */`);
    });

    it('handles empty tags array', () => {
      const op = makeOp({
        summary: 'List all products',
        tags: [],
        responses: [successResponse('200')],
      });

      const result = generateMethod(op);

      expect(result.jsDoc).toBe(`/**
 * List all products
 */`);
    });
  });

  describe('error types in implementation', () => {
    it("uses 'never' for error type when no error responses", () => {
      const op = makeOp({
        responses: [successResponse('200')],
      });

      const result = generateMethod(op);

      expect(result.implementation).toMatchSnapshot();
    });

    it('uses status-specific error types when error responses exist', () => {
      const op = makeOp({
        responses: [successResponse('200'), makeErrorResponse('400'), makeErrorResponse('404')],
      });

      const result = generateMethod(op);

      expect(result.implementation).toMatchSnapshot();
    });
  });

  describe('optional body', () => {
    it('marks body as optional when requestBody.required is false', () => {
      const requestBody: AnalyzedRequestBody = {
        required: false,
        contentTypes: ['application/json'],
        schema: { type: 'object' },
        tsType: 'SomeBody',
        isMultipart: false,
      };

      const op = makeOp({
        method: 'post',
        path: '/api/v1/products',
        methodName: 'postApiV1Products',
        requestBody,
        responses: [successResponse('200')],
      });

      const result = generateMethod(op);

      expect(result.signature).toContain('body?: PostApiV1ProductsBody');
    });
  });

  describe('no parameters at all', () => {
    it('generates empty parameter list with no params', () => {
      const op = makeOp({
        responses: [successResponse('200')],
      });

      const result = generateMethod(op);

      expect(result.signature).toBe('getApiV1Products(): Promise<GetApiV1ProductsResponse>');
    });

    it('implementation uses empty object for requester options with no params', () => {
      const op = makeOp({
        responses: [successResponse('200')],
      });

      const result = generateMethod(op);

      expect(result.implementation).toMatchSnapshot();
    });
  });

  describe('header params included in signature', () => {
    it('includes optional header params in method signature', () => {
      const headerParam: AnalyzedParameter = {
        name: 'X-Request-Id',
        in: 'header',
        required: false,
        schema: { type: 'string' },
        tsType: 'string',
        description: undefined,
      };

      const op = makeOp({
        headerParams: [headerParam],
        responses: [successResponse('200')],
      });

      const result = generateMethod(op);

      expect(result.signature).toContain('headers?: GetApiV1ProductsHeaders');
      expect(result.implementation).toMatchSnapshot();
    });

    it('includes required header params without optional marker', () => {
      const headerParam: AnalyzedParameter = {
        name: 'X-Api-Key',
        in: 'header',
        required: true,
        schema: { type: 'string' },
        tsType: 'string',
        description: undefined,
      };

      const op = makeOp({
        headerParams: [headerParam],
        responses: [successResponse('200')],
      });

      const result = generateMethod(op);

      expect(result.signature).toContain('headers: GetApiV1ProductsHeaders');
      expect(result.signature).not.toContain('headers?:');
    });

    it('uses explicit undefined for optional headers when body is required', () => {
      const headerParam: AnalyzedParameter = {
        name: 'X-Request-Id',
        in: 'header',
        required: false,
        schema: { type: 'string' },
        tsType: 'string',
        description: undefined,
      };

      const op = makeOp({
        headerParams: [headerParam],
        requestBody: {
          required: true,
          contentTypes: ['application/json'],
          schema: { type: 'object', properties: { name: { type: 'string' } } },
        },
        responses: [successResponse('200')],
      });

      const result = generateMethod(op);

      expect(result.signature).toContain('headers?: GetApiV1ProductsHeaders');
    });

    it('does not include cookie params in method signature', () => {
      const cookieParam: AnalyzedParameter = {
        name: 'session',
        in: 'cookie',
        required: false,
        schema: { type: 'string' },
        tsType: 'string',
        description: undefined,
      };

      const op = makeOp({
        cookieParams: [cookieParam],
        responses: [successResponse('200')],
      });

      const result = generateMethod(op);

      expect(result.signature).not.toContain('session');
    });
  });

  describe('GeneratedMethod structure', () => {
    it('returns object with all four required fields', () => {
      const op = makeOp({
        summary: 'Test',
        responses: [successResponse('200')],
      });

      const result = generateMethod(op);

      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('jsDoc');
      expect(result).toHaveProperty('signature');
      expect(result).toHaveProperty('implementation');
    });

    it('implementation starts with signature and wraps in function body', () => {
      const op = makeOp({
        responses: [successResponse('200')],
      });

      const result = generateMethod(op);

      expect(result.implementation.startsWith(result.signature)).toBe(true);
      expect(result.implementation).toMatchSnapshot();
    });
  });

  describe('multipart form data', () => {
    it('generates FormData construction for multipart body', () => {
      const requestBody: AnalyzedRequestBody = {
        required: true,
        contentTypes: ['multipart/form-data'],
        schema: {
          type: 'object',
          properties: {
            file: { type: 'string', format: 'binary' },
            name: { type: 'string' },
          },
          required: ['file'],
        },
        tsType: 'PostUploadBody',
        isMultipart: true,
      };

      const op = makeOp({
        method: 'post',
        path: '/upload',
        methodName: 'postUpload',
        requestBody,
        responses: [successResponse('200')],
      });

      const result = generateMethod(op);

      expect(result.implementation).toMatchSnapshot();
    });

    it('generates optional binary field with undefined check in multipart body', () => {
      const requestBody: AnalyzedRequestBody = {
        required: true,
        contentTypes: ['multipart/form-data'],
        schema: {
          type: 'object',
          properties: {
            avatar: { type: 'string', format: 'binary' },
            thumbnail: { type: 'string', format: 'binary' },
          },
          required: ['avatar'],
        },
        tsType: 'PostUploadBody',
        isMultipart: true,
      };

      const op = makeOp({
        method: 'post',
        path: '/upload',
        methodName: 'postUpload',
        requestBody,
        responses: [successResponse('200')],
      });

      const result = generateMethod(op);

      expect(result.implementation).toMatchSnapshot();
    });
  });

  describe('binary stream response', () => {
    it('adds expectStream: true for binary success response', () => {
      const binaryResponse: AnalyzedResponse = {
        statusCode: '200',
        description: undefined,
        schema: { type: 'string', format: 'binary' },
        tsType: 'StreamResponse',
        isSuccess: true,
        isBinary: true,
      };

      const op = makeOp({
        method: 'get',
        path: '/files/{id}',
        methodName: 'getFilesId',
        pathParams: [pathParam('id')],
        responses: [binaryResponse],
      });

      const result = generateMethod(op);

      expect(result.implementation).toMatchSnapshot();
    });

    it('does not add responseType for non-binary response', () => {
      const op = makeOp({
        method: 'get',
        path: '/files/{id}',
        methodName: 'getFilesId',
        pathParams: [pathParam('id')],
        responses: [successResponse('200', 'string')],
      });

      const result = generateMethod(op);

      expect(result.implementation).not.toContain('responseType');
    });
  });

  describe('void/no-content responses', () => {
    it('200 no-content produces void signature', () => {
      const op = makeOp({
        responses: [successResponse('200', 'void')],
      });

      const result = generateMethod(op);

      expect(result.signature).toContain('Promise<void>');
      expect(result.implementation).toMatchSnapshot();
    });

    it('201 no-content produces void signature', () => {
      const op = makeOp({
        method: 'post',
        path: '/api/v1/items',
        methodName: 'postApiV1Items',
        responses: [successResponse('201', 'void')],
      });

      const result = generateMethod(op);

      expect(result.signature).toContain('Promise<void>');
      expect(result.implementation).toMatchSnapshot();
    });

    it('mixed 200+schema and 204 void returns schema type', () => {
      const op = makeOp({
        responses: [successResponse('200', 'Product'), successResponse('204', 'void')],
      });

      const result = generateMethod(op);

      expect(result.signature).toContain('Promise<GetApiV1ProductsResponse>');
      expect(result.signature).not.toContain('Promise<void>');
    });
  });
});

describe('@deprecated parameter JSDoc generation', () => {
  it('emits @deprecated tags for deprecated query parameters', () => {
    const op = makeOp({
      method: 'get',
      path: '/api/v1/products',
      methodName: 'getApiV1Products',
      queryParams: [
        queryParam('page', false, 'number'),
        { ...queryParam('limit', false, 'number'), deprecated: true },
      ],
      responses: [successResponse('200', 'Product[]')],
    });

    const result = generateMethod(op);

    expect(result.jsDoc).toContain('* @deprecated limit — This parameter is deprecated');
    expect(result.jsDoc).not.toContain('* @deprecated page');
  });

  it('emits @deprecated tags for deprecated path parameters', () => {
    const op = makeOp({
      method: 'get',
      path: '/api/v1/products/{id}',
      methodName: 'getApiV1Products',
      pathParams: [pathParam('id'), { ...pathParam('version'), deprecated: true }],
      responses: [successResponse('200', 'Product')],
    });

    const result = generateMethod(op);

    expect(result.jsDoc).toContain('* @deprecated version — This parameter is deprecated');
    expect(result.jsDoc).not.toContain('* @deprecated id');
  });

  it('emits @deprecated tags for deprecated header parameters', () => {
    const op = makeOp({
      method: 'post',
      path: '/api/v1/products',
      methodName: 'postApiV1Products',
      headerParams: [
        { ...queryParam('X-Request-ID', true, 'string'), in: 'header' as const },
        { ...queryParam('X-Deprecated', true, 'string'), in: 'header' as const, deprecated: true },
      ],
      responses: [successResponse('201', 'Product')],
    });

    const result = generateMethod(op);

    expect(result.jsDoc).toContain('* @deprecated X-Deprecated — This parameter is deprecated');
    expect(result.jsDoc).not.toContain('* @deprecated X-Request-ID');
  });

  it('emits @deprecated tags for deprecated cookie parameters', () => {
    const op = makeOp({
      method: 'get',
      path: '/api/v1/session',
      methodName: 'getSession',
      cookieParams: [
        { ...queryParam('sessionId', true, 'string'), in: 'cookie' as const },
        { ...queryParam('legacyToken', true, 'string'), in: 'cookie' as const, deprecated: true },
      ],
      responses: [successResponse('200', 'Session')],
    });

    const result = generateMethod(op);

    expect(result.jsDoc).toContain('* @deprecated legacyToken — This parameter is deprecated');
    expect(result.jsDoc).not.toContain('* @deprecated sessionId');
  });

  it('emits multiple @deprecated tags when multiple parameters are deprecated', () => {
    const op = makeOp({
      method: 'get',
      path: '/api/v1/data',
      methodName: 'getData',
      queryParams: [
        { ...queryParam('oldParam', false, 'string'), deprecated: true },
        { ...queryParam('olderParam', false, 'string'), deprecated: true },
      ],
      headerParams: [
        { ...queryParam('X-Archive', true, 'string'), in: 'header' as const, deprecated: true },
      ],
      responses: [successResponse('200', 'Data')],
    });

    const result = generateMethod(op);

    expect(result.jsDoc).toContain('* @deprecated oldParam — This parameter is deprecated');
    expect(result.jsDoc).toContain('* @deprecated olderParam — This parameter is deprecated');
    expect(result.jsDoc).toContain('* @deprecated X-Archive — This parameter is deprecated');
  });

  it('positions parameter @deprecated after operation-level @deprecated', () => {
    const op = makeOp({
      method: 'get',
      path: '/api/v1/old-endpoint',
      methodName: 'getApiV1OldEndpoint',
      deprecated: true,
      queryParams: [{ ...queryParam('oldParam', false, 'string'), deprecated: true }],
      responses: [successResponse('200', 'Data')],
    });

    const result = generateMethod(op);

    const jsDocLines = result.jsDoc.split('\n');
    const deprecatedLineIndex = jsDocLines.findIndex((line) => line.includes('* @deprecated'));
    const paramDeprecatedLineIndex = jsDocLines.findIndex((line) =>
      line.includes('* @deprecated oldParam')
    );

    expect(deprecatedLineIndex).toBeGreaterThanOrEqual(0);
    expect(paramDeprecatedLineIndex).toBeGreaterThan(deprecatedLineIndex);
  });

  it('handles mixed deprecated and non-deprecated parameters', () => {
    const op = makeOp({
      method: 'get',
      path: '/api/v1/mixed',
      methodName: 'getApiV1Mixed',
      queryParams: [
        queryParam('active', false, 'string'),
        { ...queryParam('legacy', false, 'string'), deprecated: true },
        queryParam('current', false, 'string'),
      ],
      headerParams: [
        { ...queryParam('X-Version', true, 'string'), in: 'header' as const, deprecated: true },
      ],
      responses: [successResponse('200', 'Data')],
    });

    const result = generateMethod(op);

    expect(result.jsDoc).toContain('* @deprecated legacy — This parameter is deprecated');
    expect(result.jsDoc).toContain('* @deprecated X-Version — This parameter is deprecated');
    expect(result.jsDoc).not.toContain('* @deprecated active');
    expect(result.jsDoc).not.toContain('* @deprecated current');
  });
});
