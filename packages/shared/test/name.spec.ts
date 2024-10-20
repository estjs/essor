import { camelCase, capitalize, kebabCase } from '../src';

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

  it('should handle already camel case string', () => {
    expect(camelCase('camelCaseString')).toBe('camelCaseString');
  });

  it('should handle string with single character', () => {
    expect(camelCase('a')).toBe('a');
  });
});

describe('capitalize', () => {
  it('capitalizes the first letter of a normal string', () => {
    expect(capitalize('hello')).toBe('Hello');
  });

  it('returns an empty string for an empty string', () => {
    expect(capitalize('')).toBe('');
  });

  it('capitalizes the first letter of a single-letter string', () => {
    expect(capitalize('h')).toBe('H');
  });

  it('capitalizes the first letter and leaves non-letter characters unchanged', () => {
    expect(capitalize('hello123')).toBe('Hello123');
  });

  it('capitalizes the first letter of a string with numbers', () => {
    expect(capitalize('hello9')).toBe('Hello9');
  });

  it('capitalizes the first letter of a string with special characters', () => {
    expect(capitalize('hello!')).toBe('Hello!');
  });

  it('capitalizes the first letter of a string with spaces', () => {
    expect(capitalize(' Hello, World!')).toBe(' Hello, World!');
  });

  it('returns the same string if the first letter is already uppercase', () => {
    expect(capitalize('Hello')).toBe('Hello');
  });
});
