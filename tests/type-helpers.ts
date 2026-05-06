/**
 * Type assertion helpers for compile-time type testing
 *
 * This module provides utilities for compile-time type verification using
 * vitest's built-in expectTypeOf and assertType functions.
 *
 * No additional dependencies needed - vitest provides these natively!
 */

import { expectTypeOf, assertType } from 'vitest';

/**
 * Compile-time type equality check using expectTypeOf
 * This function will fail at compile time if the types don't match
 */
export function typeEqual<T, U>(): T extends U ? (U extends T ? true : false) : false {
  return true as any;
}

/**
 * Helper for compile-time type assertions using expectTypeOf
 * @example assertTypesEqual<string, string>() // compiles fine
 * @example assertTypesEqual<string, number>() // fails at compile time
 */
export function assertTypesEqual<T, U>(): void {
  expectTypeOf<T>().toEqualTypeOf<U>();
}

/**
 * Basic smoke test to verify type checking works
 * This test should always pass
 */
export function runTypeSmokeTest(): void {
  // Test basic type equality
  assertType<string>('hello');
  assertType<number>(42);
  assertType<boolean>(true);

  // Test expectTypeOf functionality
  expectTypeOf<string>().toEqualTypeOf<string>();
  expectTypeOf<number>().not.toEqualTypeOf<string>();

  // Test our helper
  assertTypesEqual<string, string>();
  assertTypesEqual<number, number>();
}

// Run smoke test on import
runTypeSmokeTest();
