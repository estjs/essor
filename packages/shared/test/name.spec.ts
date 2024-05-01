import { camelCase, kebabCase } from '../src';

describe('kebabCase function', () => {
  it('should convert camel case string to kebab case', () => {
    expect(kebabCase('camelCaseString')).toBe('camel-case-string');
  });

  it('should handle already kebab case string', () => {
    expect(kebabCase('kebab-case-string')).toBe('kebab-case-string');
  });

  it('should handle empty string', () => {
    expect(kebabCase('')).toBe('');
  });

  it('should handle string with single character', () => {
    expect(kebabCase('a')).toBe('a');
  });
});

describe('camelCase function', () => {
  it('should convert kebab case string to camel case', () => {
    expect(camelCase('kebab-case-string')).toBe('kebabCaseString');
  });

  it('should convert space-separated string to camel case', () => {
    expect(camelCase('space separated string')).toBe('spaceSeparatedString');
  });

  it('should handle already camel case string', () => {
    expect(camelCase('camelCaseString')).toBe('camelCaseString');
  });

  it('should handle string with single character', () => {
    expect(camelCase('a')).toBe('a');
  });
});
