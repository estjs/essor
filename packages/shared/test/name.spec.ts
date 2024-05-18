import { camelCase, capitalizeFirstLetter, kebabCase } from '../src';

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

describe('capitalizeFirstLetter', () => {
  it('capitalizes the first letter of a normal string', () => {
    expect(capitalizeFirstLetter('hello')).toBe('Hello');
  });

  it('returns an empty string for an empty string', () => {
    expect(capitalizeFirstLetter('')).toBe('');
  });

  it('capitalizes the first letter of a single-letter string', () => {
    expect(capitalizeFirstLetter('h')).toBe('H');
  });

  it('capitalizes the first letter and leaves non-letter characters unchanged', () => {
    expect(capitalizeFirstLetter('hello123')).toBe('Hello123');
  });

  it('capitalizes the first letter of a string with numbers', () => {
    expect(capitalizeFirstLetter('hello9')).toBe('Hello9');
  });

  it('capitalizes the first letter of a string with special characters', () => {
    expect(capitalizeFirstLetter('hello!')).toBe('Hello!');
  });

  it('capitalizes the first letter of a string with spaces', () => {
    expect(capitalizeFirstLetter(' hello world')).toBe(' hello world');
  });

  it('returns the same string if the first letter is already uppercase', () => {
    expect(capitalizeFirstLetter('Hello')).toBe('Hello');
  });
});
