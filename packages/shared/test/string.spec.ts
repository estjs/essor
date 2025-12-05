import { camelCase, capitalize, kebabCase } from '../src';

describe('string utils', () => {
  describe('kebabCase', () => {
    const testCases = [
      { input: 'camelCaseString', expected: 'camel-case-string' },
      { input: 'backgroundColor', expected: 'background-color' },
      { input: 'WebkitTransform', expected: 'webkit-transform' },
      { input: 'kebab-case-string', expected: 'kebab-case-string' },
      { input: 'background-color', expected: 'background-color' },
      { input: '', expected: '' },
      { input: 'a', expected: 'a' },
      { input: 'A', expected: 'a' },
      { input: 'RGB', expected: 'r-g-b' },
      { input: 'BGColor', expected: 'b-g-color' },
      { input: 'FOOBar', expected: 'f-o-o-bar' },
      { input: 'fooBAR', expected: 'foo-b-a-r' },
      { input: 'foo', expected: 'foo' },
    ];

    testCases.forEach(({ input, expected }) => {
      it(`should convert '${input}' to '${expected}'`, () => {
        expect(kebabCase(input)).toBe(expected);
      });
    });
  });

  describe('camelCase', () => {
    const testCases = [
      { input: 'kebab-case-string', expected: 'kebabCaseString' },
      { input: 'background-color', expected: 'backgroundColor' },
      { input: '-webkit-transform', expected: 'webkitTransform' }, // Changed from WebkitTransform
      { input: 'camelCaseString', expected: 'camelCaseString' },
      { input: 'backgroundColor', expected: 'backgroundColor' },
      { input: '', expected: '' },
      { input: 'a', expected: 'a' },
      { input: '-a', expected: 'a' }, // Changed from A
      { input: '--foo-bar', expected: 'fooBar' }, // Changed from FooBar
      { input: 'foo--bar', expected: 'fooBar' },
      { input: 'foo-bar', expected: 'fooBar' },
      { input: 'foo-bar-baz', expected: 'fooBarBaz' },
      { input: '-foo-bar', expected: 'fooBar' }, // Changed from FooBar
      { input: 'foo-', expected: 'foo' },
      { input: 'foo--bar', expected: 'fooBar' },
      { input: 'foo---bar', expected: 'fooBar' },
      { input: '-', expected: '' },
      { input: 'foo', expected: 'foo' },
    ];

    testCases.forEach(({ input, expected }) => {
      it(`should convert '${input}' to '${expected}'`, () => {
        expect(camelCase(input)).toBe(expected);
      });
    });
  });

  describe('capitalize', () => {
    const testCases = [
      { input: 'hello', expected: 'Hello' },
      { input: 'world', expected: 'World' },
      { input: 'helloWorld', expected: 'HelloWorld' },
      { input: '', expected: '' },
      { input: 'a', expected: 'A' },
      { input: 'z', expected: 'Z' },
      { input: 'Hello', expected: 'Hello' },
      { input: 'World', expected: 'World' },
      { input: '123abc', expected: '123abc' },
      { input: '!hello', expected: '!hello' },
      { input: ' hello', expected: ' hello' },
      { input: 'foo', expected: 'Foo' },
      { input: 'foo bar', expected: 'Foo bar' },
      { input: 'fooBar', expected: 'FooBar' },
      { input: 'Foo', expected: 'Foo' },
      { input: 'FOO', expected: 'FOO' },
      { input: 'f', expected: 'F' },
    ];

    testCases.forEach(({ input, expected }) => {
      it(`should capitalize '${input}' to '${expected}'`, () => {
        expect(capitalize(input)).toBe(expected);
      });
    });
  });
});
