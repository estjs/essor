import { camelCase, capitalize, kebabCase } from '../src';

describe('string Utility Functions', () => {
  describe('kebabCase', () => {
    it('should convert camelCase to kebab-case', () => {
      expect(kebabCase('camelCaseString')).toBe('camel-case-string');
      expect(kebabCase('backgroundColor')).toBe('background-color');
      expect(kebabCase('WebkitTransform')).toBe('webkit-transform');
    });

    it('should handle strings that are already kebab-case', () => {
      expect(kebabCase('kebab-case-string')).toBe('kebab-case-string');
      expect(kebabCase('background-color')).toBe('background-color');
    });

    it('should handle empty strings', () => {
      expect(kebabCase('')).toBe('');
    });

    it('should handle single characters', () => {
      expect(kebabCase('a')).toBe('a');
      expect(kebabCase('A')).toBe('a');
    });

    it('should handle consecutive capital letters', () => {
      expect(kebabCase('RGB')).toBe('r-g-b');
      expect(kebabCase('BGColor')).toBe('b-g-color');
    });
  });

  describe('camelCase', () => {
    it('should convert kebab-case to camelCase', () => {
      expect(camelCase('kebab-case-string')).toBe('kebabCaseString');
      expect(camelCase('background-color')).toBe('backgroundColor');
      expect(camelCase('-webkit-transform')).toBe('webkitTransform');
    });

    it('should handle strings that are already camelCase', () => {
      expect(camelCase('camelCaseString')).toBe('camelCaseString');
      expect(camelCase('backgroundColor')).toBe('backgroundColor');
    });

    it('should handle empty strings', () => {
      expect(camelCase('')).toBe('');
    });

    it('should handle single characters', () => {
      expect(camelCase('a')).toBe('a');
      expect(camelCase('-a')).toBe('a');
    });

    it('should handle consecutive hyphens', () => {
      expect(camelCase('--foo-bar')).toBe('fooBar');
      expect(camelCase('foo--bar')).toBe('fooBar');
    });

    it('should handle various kebab-case patterns', () => {
      expect(camelCase('foo-bar')).toBe('fooBar');
      expect(camelCase('foo-bar-baz')).toBe('fooBarBaz');
      expect(camelCase('-foo-bar')).toBe('fooBar');
      expect(camelCase('foo-')).toBe('foo');
    });

    it('should handle strings with multiple hyphens', () => {
      expect(camelCase('foo--bar')).toBe('fooBar');
      expect(camelCase('foo---bar')).toBe('fooBar');
    });

    it('should handle edge cases with empty strings and special characters', () => {
      expect(camelCase('')).toBe('');
      expect(camelCase('-')).toBe('');
      expect(camelCase('foo')).toBe('foo');
    });
  });

  describe('capitalize', () => {
    it('should capitalize the first letter', () => {
      expect(capitalize('hello')).toBe('Hello');
      expect(capitalize('world')).toBe('World');
      expect(capitalize('helloWorld')).toBe('HelloWorld');
    });

    it('should handle empty strings', () => {
      expect(capitalize('')).toBe('');
    });

    it('should handle single characters', () => {
      expect(capitalize('a')).toBe('A');
      expect(capitalize('z')).toBe('Z');
    });

    it('should handle strings that are already capitalized', () => {
      expect(capitalize('Hello')).toBe('Hello');
      expect(capitalize('World')).toBe('World');
    });

    it('should handle strings with numbers and special characters', () => {
      expect(capitalize('123abc')).toBe('123abc');
      expect(capitalize('!hello')).toBe('!hello');
      expect(capitalize(' hello')).toBe(' hello');
    });

    it('should correctly capitalize various string formats', () => {
      expect(capitalize('foo')).toBe('Foo');
      expect(capitalize('foo bar')).toBe('Foo bar');
      expect(capitalize('fooBar')).toBe('FooBar');
    });

    it('should preserve already capitalized strings', () => {
      expect(capitalize('Foo')).toBe('Foo');
      expect(capitalize('FOO')).toBe('FOO');
    });

    it('should handle edge cases with empty and single character strings', () => {
      expect(capitalize('')).toBe('');
      expect(capitalize('f')).toBe('F');
    });
  });

  describe('hyphenate', () => {
    it('should convert camelCase to kebab-case', () => {
      expect(kebabCase('fooBar')).toBe('foo-bar');
      expect(kebabCase('fooBarBaz')).toBe('foo-bar-baz');
      expect(kebabCase('Foo')).toBe('foo');
    });

    it('should handle strings with multiple uppercase letters', () => {
      expect(kebabCase('FOOBar')).toBe('f-o-o-bar');
      expect(kebabCase('fooBAR')).toBe('foo-b-a-r');
    });

    it('should handle empty strings and edge cases', () => {
      expect(kebabCase('')).toBe('');
      expect(kebabCase('foo')).toBe('foo');
    });
  });
});
