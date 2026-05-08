import { describe, it, expect } from 'vitest';

import type { AnalyzedOperation } from '../../src/analyzer/path-analyzer.js';
import { generateErrorTypes } from '../../src/generator/error-types.js';

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

describe('generateErrorTypes', () => {
  it('generates ApiError class', () => {
    const output = generateErrorTypes([]);

    expect(output).toMatchSnapshot();
  });

  it('generates UnspecifiedApiError class', () => {
    const output = generateErrorTypes([]);

    expect(output).toMatchSnapshot();
  });

  it('generates error union for operation with multiple error status codes', () => {
    const op = makeOp({
      methodName: 'getApiV1Products',
      responses: [
        {
          statusCode: '200',
          tsType: 'Product',
          isSuccess: true,
          schema: undefined,
          description: undefined,
        },
        {
          statusCode: '400',
          tsType: 'BadRequestError',
          isSuccess: false,
          schema: undefined,
          description: undefined,
        },
        {
          statusCode: '404',
          tsType: 'NotFoundError',
          isSuccess: false,
          schema: undefined,
          description: undefined,
        },
        {
          statusCode: '500',
          tsType: 'InternalServerError',
          isSuccess: false,
          schema: undefined,
          description: undefined,
        },
      ],
    });

    const output = generateErrorTypes([op]);

    expect(output).toMatchSnapshot();
  });

  it('includes catch-all UnspecifiedApiError in error unions', () => {
    const op = makeOp({
      methodName: 'deleteApiV1Products',
      responses: [
        {
          statusCode: '204',
          tsType: 'void',
          isSuccess: true,
          schema: undefined,
          description: undefined,
        },
        {
          statusCode: '404',
          tsType: 'NotFoundError',
          isSuccess: false,
          schema: undefined,
          description: undefined,
        },
      ],
    });

    const output = generateErrorTypes([op]);

    expect(output).toMatchSnapshot();
  });

  it('handles default response with DefaultErrorBody', () => {
    const op = makeOp({
      methodName: 'postApiV1Users',
      responses: [
        {
          statusCode: '201',
          tsType: 'User',
          isSuccess: true,
          schema: undefined,
          description: undefined,
        },
        {
          statusCode: '400',
          tsType: 'ValidationError',
          isSuccess: false,
          schema: undefined,
          description: undefined,
        },
        {
          statusCode: 'default',
          tsType: 'unknown',
          isSuccess: false,
          schema: undefined,
          description: undefined,
        },
      ],
    });

    const output = generateErrorTypes([op]);

    expect(output).toMatchSnapshot();
  });

  it('does not emit DefaultErrorBody when no operation uses default response', () => {
    const op = makeOp({
      methodName: 'getApiV1Items',
      responses: [
        {
          statusCode: '200',
          tsType: 'Item[]',
          isSuccess: true,
          schema: undefined,
          description: undefined,
        },
        {
          statusCode: '404',
          tsType: 'NotFoundError',
          isSuccess: false,
          schema: undefined,
          description: undefined,
        },
      ],
    });

    const output = generateErrorTypes([op]);

    expect(output).not.toContain('DefaultErrorBody');
    expect(output).toMatchSnapshot();
  });

  it('skips operations with no error responses', () => {
    const op = makeOp({
      methodName: 'getHealth',
      responses: [
        {
          statusCode: '200',
          tsType: 'HealthCheck',
          isSuccess: true,
          schema: undefined,
          description: undefined,
        },
      ],
    });

    const output = generateErrorTypes([op]);

    expect(output).not.toContain('getHealthError');
    expect(output).not.toContain('getHealthErrors');
    expect(output).toMatchSnapshot();
  });

  it('skips operations with only success responses and default', () => {
    const op = makeOp({
      methodName: 'ping',
      responses: [
        {
          statusCode: '200',
          tsType: 'Pong',
          isSuccess: true,
          schema: undefined,
          description: undefined,
        },
      ],
    });

    const output = generateErrorTypes([op]);

    expect(output).not.toContain('pingError');
    expect(output).not.toContain('pingErrors');
    expect(output).toMatchSnapshot();
  });

  it('uses unknown when tsType is empty', () => {
    const op = makeOp({
      methodName: 'putApiV1Config',
      responses: [
        {
          statusCode: '400',
          tsType: '',
          isSuccess: false,
          schema: undefined,
          description: undefined,
        },
      ],
    });

    const output = generateErrorTypes([op]);

    expect(output).toMatchSnapshot();
  });

  it('generates error types for multiple operations', () => {
    const op1 = makeOp({
      methodName: 'getApiV1Products',
      responses: [
        {
          statusCode: '200',
          tsType: 'Product[]',
          isSuccess: true,
          schema: undefined,
          description: undefined,
        },
        {
          statusCode: '404',
          tsType: 'NotFoundError',
          isSuccess: false,
          schema: undefined,
          description: undefined,
        },
      ],
    });

    const op2 = makeOp({
      method: 'post',
      path: '/api/v1/users',
      methodName: 'postApiV1Users',
      responses: [
        {
          statusCode: '201',
          tsType: 'User',
          isSuccess: true,
          schema: undefined,
          description: undefined,
        },
        {
          statusCode: '400',
          tsType: 'ValidationError',
          isSuccess: false,
          schema: undefined,
          description: undefined,
        },
        {
          statusCode: '409',
          tsType: 'ConflictError',
          isSuccess: false,
          schema: undefined,
          description: undefined,
        },
      ],
    });

    const output = generateErrorTypes([op1, op2]);

    expect(output).toMatchSnapshot();
  });

  it('formats multi-branch error unions with pipe on new lines', () => {
    const op = makeOp({
      methodName: 'getApiV1Orders',
      responses: [
        {
          statusCode: '200',
          tsType: 'Order[]',
          isSuccess: true,
          schema: undefined,
          description: undefined,
        },
        {
          statusCode: '400',
          tsType: 'BadRequest',
          isSuccess: false,
          schema: undefined,
          description: undefined,
        },
        {
          statusCode: '401',
          tsType: 'Unauthorized',
          isSuccess: false,
          schema: undefined,
          description: undefined,
        },
        {
          statusCode: '403',
          tsType: 'Forbidden',
          isSuccess: false,
          schema: undefined,
          description: undefined,
        },
      ],
    });

    const output = generateErrorTypes([op]);

    expect(output).toMatchSnapshot();
  });

  it('does not include success responses in error types', () => {
    const op = makeOp({
      methodName: 'getApiV1Status',
      responses: [
        {
          statusCode: '200',
          tsType: 'StatusOk',
          isSuccess: true,
          schema: undefined,
          description: undefined,
        },
        {
          statusCode: '201',
          tsType: 'StatusCreated',
          isSuccess: true,
          schema: undefined,
          description: undefined,
        },
        {
          statusCode: '500',
          tsType: 'ServerError',
          isSuccess: false,
          schema: undefined,
          description: undefined,
        },
      ],
    });

    const output = generateErrorTypes([op]);

    expect(output).not.toContain('Error200');
    expect(output).not.toContain('Error201');
    expect(output).toMatchSnapshot();
  });

  it('handles operation with only default error response', () => {
    const op = makeOp({
      methodName: 'patchApiV1Settings',
      responses: [
        {
          statusCode: '200',
          tsType: 'Settings',
          isSuccess: true,
          schema: undefined,
          description: undefined,
        },
        {
          statusCode: 'default',
          tsType: 'unknown',
          isSuccess: false,
          schema: undefined,
          description: undefined,
        },
      ],
    });

    const output = generateErrorTypes([op]);

    expect(output).not.toContain('patchApiV1SettingsError4');
    expect(output).toMatchSnapshot();
  });

  it('always produces ApiError and UnspecifiedApiError classes even with empty operations', () => {
    const output = generateErrorTypes([]);

    expect(output).toMatchSnapshot();
  });

  it('uses methodName as prefix for error type names', () => {
    const op = makeOp({
      methodName: 'deleteApiV1UsersByUserId',
      responses: [
        {
          statusCode: '404',
          tsType: 'UserNotFoundError',
          isSuccess: false,
          schema: undefined,
          description: undefined,
        },
      ],
    });

    const output = generateErrorTypes([op]);

    expect(output).toMatchSnapshot();
  });
});
