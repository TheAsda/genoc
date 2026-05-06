// oxlint-disable no-underscore-dangle
// POC: Validate Symbol + intersection type pattern for error narrowing
// This file MUST compile with `tsc --strict --noEmit`
//
// KEY FINDINGS:
// 1. `as const` strips symbol-keyed properties from intersection types → use inferred return type
// 2. `Exclude<T, X>` conditional type prevents type inference in type guards → use resolved union types
// 3. Codegen must emit pre-resolved error unions (not Exclude<> wrappers) on the symbol-keyed property

// 1. Define the Symbol
const errorsSymbol = Symbol('errors');

// 2. Define ApiError and UnspecifiedApiError (mimicking generated code)
class ApiError<TStatus extends number, TData> extends Error {
  constructor(
    public readonly status: TStatus,
    public readonly data: TData,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

class UnspecifiedApiError extends ApiError<number, unknown> {
  constructor(status: number, data: unknown, message: string) {
    super(status, data, message);
    this.name = 'UnspecifiedApiError';
  }
}

// 3. Define error union types (mimicking generated code)
// Full error union includes UnspecifiedApiError
type MyMethodErrors =
  | ApiError<400, { message: string }>
  | ApiError<500, { error: string }>
  | UnspecifiedApiError;

// Pre-resolved defined errors (codegen emits this, NOT Exclude<>)
type MyMethodDefinedErrors = ApiError<400, { message: string }> | ApiError<500, { error: string }>;

// 4. Define decorateWithErrors
// Runtime errors param is decoupled from the type-level E parameter
function decorateWithErrors<T, E>(item: T, runtimeErrors: unknown): T & { [errorsSymbol]: E } {
  Object.defineProperty(item, errorsSymbol, {
    value: runtimeErrors,
    enumerable: false,
    configurable: true,
    writable: false,
  });
  return item as T & { [errorsSymbol]: E };
}

// 5. Define isDefinedError type guard
function isDefinedError<E extends ApiError<number, unknown>>(
  err: unknown,
  fn: { [errorsSymbol]: E }
): err is E {
  if (err instanceof UnspecifiedApiError) return false;
  if (!(err instanceof ApiError)) return false;
  return true;
}

// 6. Create the client (inferred return type, no `as const`, no Exclude<>)
function createClient() {
  return {
    myMethod: decorateWithErrors<(input: string) => Promise<string>, MyMethodDefinedErrors>(
      async (input: string): Promise<string> => {
        return input.toUpperCase();
      },
      [400, 500]
    ),
    otherMethod: decorateWithErrors<
      (id: number) => Promise<boolean>,
      ApiError<404, { notFound: true }>
    >(
      async (id: number): Promise<boolean> => {
        return id > 0;
      },
      [404]
    ),
  };
}

// 7. VALIDATION: This code MUST compile without errors
const client = createClient();

// Test 1: Methods are callable with correct return types
async function testCall() {
  const result1: string = await client.myMethod('hello');
  const result2: boolean = await client.otherMethod(42);
}

// Test 2: isDefinedError narrows per-method error types in catch block
async function testNarrowing() {
  try {
    await client.myMethod('test');
  } catch (err: unknown) {
    if (isDefinedError(err, client.myMethod)) {
      // err narrowed to MyMethodDefinedErrors = ApiError<400, {...}> | ApiError<500, {...}>
      const _status: number = err.status;
      const _data = err.data;
    }
  }
}

// Test 3: Different methods have different error types
async function testDifferentMethod() {
  try {
    await client.otherMethod(1);
  } catch (err: unknown) {
    if (isDefinedError(err, client.otherMethod)) {
      // err narrowed to ApiError<404, { notFound: true }>
      const _status: 404 = err.status;
      const _data: { notFound: true } = err.data;
    }
  }
}

// Test 4: UnspecifiedApiError is excluded by the type guard at runtime
async function testUnspecified() {
  const err: unknown = new UnspecifiedApiError(418, {}, "I'm a teapot");
  if (isDefinedError(err, client.myMethod)) {
    // At runtime this branch is unreachable (isDefinedError returns false for UnspecifiedApiError)
    // At type level, err is narrowed to MyMethodDefinedErrors
    const _status: number = err.status;
  }
}

// Test 5: Symbol property is accessible at runtime
const _codes = (client.myMethod as any)[errorsSymbol];

console.log('POC compiles successfully!');
