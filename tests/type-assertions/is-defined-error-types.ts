// oxlint-disable no-underscore-dangle
// Compile-only type assertion tests for isDefinedError error narrowing
//
// Run: npx tsc --strict --noEmit tests/type-assertions/is-defined-error-types.ts \
//       --esModuleInterop --moduleResolution node16 --module nodenext
//
// These tests verify that isDefinedError correctly narrows caught errors to a
// method's spec-defined error union type at the TypeScript type level.

import { expectTypeOf } from 'vitest';

// ---------------------------------------------------------------------------
// Infrastructure: replicate the generated pattern (same as POC in
// tests/poc/symbol-const-check.ts and the codegen output)
// ---------------------------------------------------------------------------

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

class RequesterFailError extends Error {
  constructor(originalError: unknown) {
    super(String(originalError));
    this.name = 'RequesterFailError';
  }
}

function decorateWithErrors<T, E>(item: T, runtimeErrors: unknown): T & { __definedErrors: E } {
  Object.defineProperty(item, '__definedErrors', {
    value: runtimeErrors,
    enumerable: false,
    configurable: true,
    writable: false,
  });
  return item as T & { __definedErrors: E };
}

function isDefinedError<E extends ApiError<number, unknown>>(
  err: unknown,
  fn: { __definedErrors: E }
): err is E {
  if (err instanceof UnspecifiedApiError) return false;
  if (!(err instanceof ApiError)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Per-method error types (mimicking codegen output)
// ---------------------------------------------------------------------------

type GetPetsError400 = ApiError<400, { message: string }>;
type GetPetsError500 = ApiError<500, { error: string }>;
type GetPetsErrors = GetPetsError400 | GetPetsError500;

type PostPetError404 = ApiError<404, { detail: string }>;
type PostPetErrors = PostPetError404;

// Empty errors route — no spec-defined errors
type NoErrorsDefined = never;

// ---------------------------------------------------------------------------
// Mock client (inferred return type, no `as const` — preserves symbol-keyed
// intersection types per POC findings)
// ---------------------------------------------------------------------------

function createMockClient() {
  return {
    getPets: decorateWithErrors<
      (query?: { limit?: number }) => Promise<{ id: number; name: string }[]>,
      GetPetsErrors
    >(async (query?: { limit?: number }) => [], [400, 500]),

    postPet: decorateWithErrors<
      (body: { name: string }) => Promise<{ id: number; name: string }>,
      PostPetErrors
    >(async (body) => ({ id: 1, name: body.name }), [404]),

    getNoErrors: decorateWithErrors<() => Promise<void>, NoErrorsDefined>(async () => {}, []),
  };
}

const client = createMockClient();

// ===========================================================================
// TEST 1 — Happy path: isDefinedError narrows to the correct error union
// ===========================================================================

async function test_happyPath_narrowsToCorrectUnion() {
  try {
    await client.getPets({ limit: 10 });
  } catch (err: unknown) {
    if (isDefinedError(err, client.getPets)) {
      // err is narrowed to GetPetsErrors (the pre-resolved defined-error union)
      expectTypeOf(err).toEqualTypeOf<GetPetsErrors>();
    }
  }
}

// ===========================================================================
// TEST 2 — Multi-status: after narrowing, can discriminate by status code
// ===========================================================================

async function test_multiStatus_discriminateByCode() {
  try {
    await client.getPets({ limit: 10 });
  } catch (err: unknown) {
    if (isDefinedError(err, client.getPets)) {
      // Before discrimination: full union
      expectTypeOf(err).toEqualTypeOf<GetPetsErrors>();

      // Discriminate to 400 variant
      if (err.status === 400) {
        expectTypeOf(err).toEqualTypeOf<GetPetsError400>();
        expectTypeOf(err.data).toEqualTypeOf<{ message: string }>();
      }

      // Discriminate to 500 variant
      if (err.status === 500) {
        expectTypeOf(err).toEqualTypeOf<GetPetsError500>();
        expectTypeOf(err.data).toEqualTypeOf<{ error: string }>();
      }
    }
  }
}

// ===========================================================================
// TEST 3 — Different methods narrow to different error types
// ===========================================================================

async function test_differentMethods_differentErrorTypes() {
  try {
    await client.postPet({ name: 'Rex' });
  } catch (err: unknown) {
    if (isDefinedError(err, client.postPet)) {
      // postPet narrows to PostPetErrors (NOT GetPetsErrors)
      expectTypeOf(err).toEqualTypeOf<PostPetErrors>();
      expectTypeOf(err).toEqualTypeOf<ApiError<404, { detail: string }>>();
    }
  }
}

// ===========================================================================
// TEST 4 — Negative: UnspecifiedApiError NOT in the defined error union
// ===========================================================================

function test_negative_unspecifiedApiError_notInUnion() {
  // If GetPetsErrors already included UnspecifiedApiError, widening the union
  // by adding UnspecifiedApiError would produce the same type — and this
  // assertion would fail to compile.
  expectTypeOf<GetPetsErrors>().not.toEqualTypeOf<GetPetsErrors | UnspecifiedApiError>();

  // The narrowed error's status is a literal union (400 | 500), not the broad
  // `number` that UnspecifiedApiError carries.
  expectTypeOf<GetPetsErrors['status']>().toEqualTypeOf<400 | 500>();
}

// ===========================================================================
// TEST 5 — Negative: RequesterFailError NOT in the defined error union
// ===========================================================================

function test_negative_requestorFailError_notInUnion() {
  // RequesterFailError is a completely different class hierarchy
  expectTypeOf<GetPetsErrors>().not.toEqualTypeOf<GetPetsErrors | RequesterFailError>();

  // Defined errors have `status: number` and `data: unknown` properties.
  // RequesterFailError has neither — it only has `message`.
}

// ===========================================================================
// TEST 6 — Negative: Generic Error NOT in the defined error union
// ===========================================================================

function test_negative_genericError_notInUnion() {
  // Generic Error is not the same as the specific ApiError union
  expectTypeOf<GetPetsErrors>().not.toEqualTypeOf<Error>();

  // And adding Error to the union widens it
  expectTypeOf<GetPetsErrors>().not.toEqualTypeOf<GetPetsErrors | Error>();
}

// ===========================================================================
// TEST 7 — Empty errors route: isDefinedError narrows to `never`
// ===========================================================================

async function test_emptyErrors_narrowsToNever() {
  try {
    await client.getNoErrors();
  } catch (err: unknown) {
    if (isDefinedError(err, client.getNoErrors)) {
      // No spec-defined errors → the error union is `never`
      expectTypeOf(err).toEqualTypeOf<never>();
    }
  }
}

// ===========================================================================
// TEST 8 — String-keyed property: method.__definedErrors carries error type at
//           compile time; runtime values are status code arrays

function test_symbolProperty_carriesType() {
  type GetPetsExtracted = (typeof client.getPets)['__definedErrors'];
  expectTypeOf<GetPetsExtracted>().toEqualTypeOf<GetPetsErrors>();

  type PostPetExtracted = (typeof client.postPet)['__definedErrors'];
  expectTypeOf<PostPetExtracted>().toEqualTypeOf<PostPetErrors>();

  type NoErrorsExtracted = (typeof client.getNoErrors)['__definedErrors'];
  expectTypeOf<NoErrorsExtracted>().toEqualTypeOf<never>();
}

// ===========================================================================
// TEST 9 — Methods remain callable with correct return types
// ===========================================================================

async function test_methodsStillCallable_correctReturnTypes() {
  const pets = await client.getPets({ limit: 5 });
  expectTypeOf(pets).toEqualTypeOf<{ id: number; name: string }[]>();

  const pet = await client.postPet({ name: 'Rex' });
  expectTypeOf(pet).toEqualTypeOf<{ id: number; name: string }>();

  const voidResult = await client.getNoErrors();
  expectTypeOf(voidResult).toEqualTypeOf<void>();
}

// ===========================================================================
// TEST 10 — Catch block narrowing composes with further discrimination
// ===========================================================================

async function test_catchBlock_composableNarrowing() {
  try {
    await client.getPets();
  } catch (err: unknown) {
    // Before any guard: err is unknown
    if (isDefinedError(err, client.getPets)) {
      // After guard: err is GetPetsErrors
      // Can switch on status for exhaustive handling
      switch (err.status) {
        case 400: {
          expectTypeOf(err).toEqualTypeOf<GetPetsError400>();
          break;
        }
        case 500: {
          expectTypeOf(err).toEqualTypeOf<GetPetsError500>();
          break;
        }
      }
    }
  }
}
