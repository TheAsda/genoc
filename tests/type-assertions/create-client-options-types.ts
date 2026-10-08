// oxlint-disable no-underscore-dangle
// Compile-only type assertions for the `createClient` options surface (spec #71 T4).
//
// Run: npx tsc --strict --noEmit --ignoreConfig --esModuleInterop --module nodenext \
//       --moduleResolution nodenext tests/type-assertions/create-client-options-types.ts
//
// Asserts the options argument contract of the generated factory: `String` is
// assignable as the default `formatPathParam`, a contextually typed
// `(value) => string` override is accepted with `value` inferred as the
// formatter's parameter union, and an incompatible override (returning
// `number`) is rejected.
//
// Like the other files in tests/type-assertions/, the shapes below are inline
// replicas of generator output (not imports of generated files), so the
// assertions survive without a generation step. They were transcribed verbatim
// from the generated client file (renderClient in
// src/generator/client-generator.ts, branch impl/71-t4-polish). If the options
// surface changes shape, regenerate and re-transcribe before trusting a green
// run. The `Requester` replica is a minimal stand-in — its shape is not under
// assertion here.

import { expectTypeOf } from 'vitest';

type Accepts<T, U> = U extends T ? true : false;

// --- Replica of the generated client options surface --------------------------
type Requester = <TResponse>(method: string, path: string) => Promise<TResponse>;

/**
 * Options for `createClient`.
 */
type CreateClientOptions = {
  /**
   * Formats one path parameter value to its string form before URL-encoding
   * and interpolation. Defaults to `String`.
   *
   * The union includes `null` because a nullable path parameter maps to a
   * `T | null` signature; the default `String` renders `null` as `"null"`.
   */
  formatPathParam?: (value: string | number | boolean | null) => string;
};

type FormatPathParam = NonNullable<CreateClientOptions['formatPathParam']>;

declare function createClient(requester: Requester, options?: CreateClientOptions): unknown;
declare const requester: Requester;

// --- The default: `String` is assignable as the formatter ---------------------
declare const stringIsAcceptable: Accepts<FormatPathParam, typeof String>;
const _stringDefaultOk: true = stringIsAcceptable;

// The whole options argument is optional, and `String` can also be passed
// explicitly where the formatter is expected.
const _defaultClient = createClient(requester);
const _explicitStringClient = createClient(requester, { formatPathParam: String });

// --- A user-supplied `(value) => string` override is accepted -----------------
const _customClient = createClient(requester, {
  formatPathParam: (value) => {
    // The override's parameter is contextually typed to the formatter's
    // parameter union — it is not `any`.
    expectTypeOf(value).toEqualTypeOf<string | number | boolean | null>();
    return String(value);
  },
});

// --- An incompatible override is rejected -------------------------------------
// Returning `number` does not satisfy the `(…) => string` formatter surface.
declare const returnsNumberRejected: Accepts<
  FormatPathParam,
  (value: string | number | boolean | null) => number
>;
const _returnsNumberRejected: false = returnsNumberRejected;
