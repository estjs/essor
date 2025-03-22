import { camelCase, capitalize, kebabCase } from '../src';

describe('字符串工具函数', () => {
  describe('kebabCase', () => {
    it('应该将驼峰转换为连字符', () => {
      expect(kebabCase('camelCaseString')).toBe('camel-case-string');
      expect(kebabCase('backgroundColor')).toBe('background-color');
      expect(kebabCase('WebkitTransform')).toBe('webkit-transform');
    });

    it('应该处理已经是连字符的字符串', () => {
      expect(kebabCase('kebab-case-string')).toBe('kebab-case-string');
      expect(kebabCase('background-color')).toBe('background-color');
    });

    it('应该处理空字符串', () => {
      expect(kebabCase('')).toBe('');
    });

    it('应该处理单个字符', () => {
      expect(kebabCase('a')).toBe('a');
      expect(kebabCase('A')).toBe('a');
    });

    it('应该处理连续的大写字母', () => {
      expect(kebabCase('RGB')).toBe('r-g-b');
      expect(kebabCase('BGColor')).toBe('b-g-color');
    });
  });

  describe('camelCase', () => {
    it('应该将连字符转换为驼峰', () => {
      expect(camelCase('kebab-case-string')).toBe('kebabCaseString');
      expect(camelCase('background-color')).toBe('backgroundColor');
      expect(camelCase('-webkit-transform')).toBe('webkitTransform');
    });

    it('应该处理已经是驼峰的字符串', () => {
      expect(camelCase('camelCaseString')).toBe('camelCaseString');
      expect(camelCase('backgroundColor')).toBe('backgroundColor');
    });

    it('应该处理空字符串', () => {
      expect(camelCase('')).toBe('');
    });

    it('应该处理单个字符', () => {
      expect(camelCase('a')).toBe('a');
      expect(camelCase('-a')).toBe('a');
    });

    it('应该处理连续的连字符', () => {
      expect(camelCase('--foo-bar')).toBe('fooBar');
      expect(camelCase('foo--bar')).toBe('fooBar');
    });

    it('should convert kebab-case to camelCase', () => {
      expect(camelCase('foo-bar')).toBe('fooBar');
      expect(camelCase('foo-bar-baz')).toBe('fooBarBaz');
      expect(camelCase('-foo-bar')).toBe('fooBar');
      expect(camelCase('foo-')).toBe('foo');
    });

    it('should handle strings with multiple hyphens', () => {
      expect(camelCase('foo--bar')).toBe('fooBar');
      expect(camelCase('foo---bar')).toBe('fooBar');
    });

    it('should handle empty strings and edge cases', () => {
      expect(camelCase('')).toBe('');
      expect(camelCase('-')).toBe('');
      expect(camelCase('foo')).toBe('foo');
    });
  });

  describe('capitalize', () => {
    it('应该将首字母大写', () => {
      expect(capitalize('hello')).toBe('Hello');
      expect(capitalize('world')).toBe('World');
      expect(capitalize('helloWorld')).toBe('HelloWorld');
    });

    it('应该处理空字符串', () => {
      expect(capitalize('')).toBe('');
    });

    it('应该处理单个字符', () => {
      expect(capitalize('a')).toBe('A');
      expect(capitalize('z')).toBe('Z');
    });

    it('应该处理已经是首字母大写的字符串', () => {
      expect(capitalize('Hello')).toBe('Hello');
      expect(capitalize('World')).toBe('World');
    });

    it('应该处理包含数字和特殊字符的字符串', () => {
      expect(capitalize('123abc')).toBe('123abc');
      expect(capitalize('!hello')).toBe('!hello');
      expect(capitalize(' hello')).toBe(' hello');
    });

    it('should capitalize the first letter of a string', () => {
      expect(capitalize('foo')).toBe('Foo');
      expect(capitalize('foo bar')).toBe('Foo bar');
      expect(capitalize('fooBar')).toBe('FooBar');
    });

    it('should handle strings that are already capitalized', () => {
      expect(capitalize('Foo')).toBe('Foo');
      expect(capitalize('FOO')).toBe('FOO');
    });

    it('should handle empty strings and edge cases', () => {
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
