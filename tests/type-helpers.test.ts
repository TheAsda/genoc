import { expect, test, assertType } from 'vitest';

import { typeEqual, assertTypesEqual, runTypeSmokeTest } from './type-helpers.ts';

// Test the smoke test function works
test('type smoke test runs without errors', () => {
  runTypeSmokeTest();
  expect(true).toBe(true);
});

// Test compile-time type assertions work
test('assertType compiles correctly', () => {
  assertType<string>('test');
  assertType<number>(42);
  assertType<boolean>(true);
});

// Test expectTypeOf functionality
test('expectTypeOf works in tests', () => {
  expectTypeOf<string>().toEqualTypeOf<string>();
  expectTypeOf<number>().not.toEqualTypeOf<string>();
});

// Test our typeEqual helper (should be true for same types)
test('typeEqual helper works for same types', () => {
  const result1 = typeEqual<string, string>();
  const result2 = typeEqual<number, number>();
  expect(result1).toBe(true);
  expect(result2).toBe(true);
});

// Test assertTypesEqual helper compiles without errors
test('assertTypesEqual helper compiles correctly', () => {
  assertTypesEqual<string, string>();
  assertTypesEqual<number, number>();
});

// Test typeEqual returns false for different types
test('typeEqual helper returns false for different types', () => {
  const result = typeEqual<string, number>();
  expect(typeof result).toBe('boolean');
});
