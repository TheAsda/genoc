import { describe, it, expect } from 'vitest';

import {
  kebabToPascalCase,
  camelCase,
  pascalCase,
  toPascalCaseSegment,
} from '../../src/utils/case';

describe('kebabToPascalCase', () => {
  it('converts kebab-case to PascalCase', () => {
    expect(kebabToPascalCase('change-quantity')).toBe('ChangeQuantity');
    expect(kebabToPascalCase('user-profile')).toBe('UserProfile');
  });

  it('handles simple words', () => {
    expect(kebabToPascalCase('api')).toBe('Api');
    expect(kebabToPascalCase('test')).toBe('Test');
  });

  it('handles single characters', () => {
    expect(kebabToPascalCase('x')).toBe('X');
    expect(kebabToPascalCase('a')).toBe('A');
  });

  it('handles empty string', () => {
    expect(kebabToPascalCase('')).toBe('');
  });

  it('handles multiple hyphens', () => {
    expect(kebabToPascalCase('xml-parser-api')).toBe('XmlParserApi');
    expect(kebabToPascalCase('get-user-by-id')).toBe('GetUserById');
  });
});

describe('camelCase', () => {
  it('converts PascalCase to camelCase', () => {
    expect(camelCase('ChangeQuantity')).toBe('changequantity');
    expect(camelCase('UserProfile')).toBe('userprofile');
  });

  it('handles simple words', () => {
    expect(camelCase('Api')).toBe('api');
    expect(camelCase('Test')).toBe('test');
  });

  it('handles single characters', () => {
    expect(camelCase('X')).toBe('x');
    expect(camelCase('A')).toBe('a');
  });

  it('handles empty string', () => {
    expect(camelCase('')).toBe('');
  });

  it('handles mixed case input', () => {
    expect(camelCase('XMLParser')).toBe('xmlparser');
    expect(camelCase('GetUserById')).toBe('getuserbyid');
  });
});

describe('pascalCase', () => {
  it('splits by spaces and converts to PascalCase', () => {
    expect(pascalCase('change quantity')).toBe('ChangeQuantity');
    expect(pascalCase('user profile')).toBe('UserProfile');
  });

  it('splits by hyphens and converts to PascalCase', () => {
    expect(pascalCase('change-quantity')).toBe('ChangeQuantity');
    expect(pascalCase('user-profile')).toBe('UserProfile');
  });

  it('splits by underscores and converts to PascalCase', () => {
    expect(pascalCase('change_quantity')).toBe('ChangeQuantity');
    expect(pascalCase('user_profile')).toBe('UserProfile');
  });

  it('handles mixed separators', () => {
    expect(pascalCase('user_profile_settings')).toBe('UserProfileSettings');
    expect(pascalCase('change-quantity-sold')).toBe('ChangeQuantitySold');
    expect(pascalCase('user name and email')).toBe('UserNameAndEmail');
  });

  it('handles simple words', () => {
    expect(pascalCase('api')).toBe('Api');
    expect(pascalCase('test')).toBe('Test');
  });

  it('handles single characters', () => {
    expect(pascalCase('x')).toBe('X');
    expect(pascalCase('a')).toBe('A');
  });

  it('handles empty string', () => {
    expect(pascalCase('')).toBe('');
  });
});

describe('toPascalCaseSegment', () => {
  it('detects kebab-case and converts', () => {
    expect(toPascalCaseSegment('change-quantity')).toBe('ChangeQuantity');
    expect(toPascalCaseSegment('user-profile')).toBe('UserProfile');
  });

  it('leaves already PascalCase segments unchanged', () => {
    expect(toPascalCaseSegment('Products')).toBe('Products');
    expect(toPascalCaseSegment('V1')).toBe('V1');
    expect(toPascalCaseSegment('UserProfile')).toBe('UserProfile');
  });

  it('handles simple words', () => {
    expect(toPascalCaseSegment('api')).toBe('Api');
    expect(toPascalCaseSegment('v1')).toBe('V1');
  });

  it('handles single characters', () => {
    expect(toPascalCaseSegment('x')).toBe('X');
    expect(toPascalCaseSegment('a')).toBe('A');
  });

  it('handles empty string', () => {
    expect(toPascalCaseSegment('')).toBe('');
  });

  it('handles mixed case', () => {
    expect(toPascalCaseSegment('XML-parser')).toBe('XMLParser');
    expect(toPascalCaseSegment('get-user')).toBe('GetUser');
  });

  it('handles multiple hyphens', () => {
    expect(toPascalCaseSegment('xml-parser-api')).toBe('XmlParserApi');
    expect(toPascalCaseSegment('get-user-by-id')).toBe('GetUserById');
  });

  it('handles edge cases with numbers', () => {
    expect(toPascalCaseSegment('v2-api')).toBe('V2Api');
    expect(toPascalCaseSegment('api-v2')).toBe('ApiV2');
    expect(toPascalCaseSegment('user1-profile')).toBe('User1Profile');
  });
});
