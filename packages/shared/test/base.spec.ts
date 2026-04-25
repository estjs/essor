import { _toString } from '../src/base';
import {
  EMPTY_ARR,
  EMPTY_OBJ,
  cacheStringFunction,
  coerceArray,
  extend,
  generateUniqueId,
  getGlobalThis,
  hasChanged,
  hasOwn,
  isBrowser,
  isOn,
  noop,
  startsWith,
} from '../src';

describe('base Utils', () => {
  describe('coerceArray', () => {
    const testCases = [
      { input: [1, 2, 3], expected: [1, 2, 3] },
      { input: ['a', 'b'], expected: ['a', 'b'] },
      { input: 1, expected: [1] },
      { input: 'test', expected: ['test'] },
      { input: null, expected: [null] },
      { input: undefined, expected: [undefined] },
    ];

    testCases.forEach(({ input, expected }) => {
      it(`should coerce ${JSON.stringify(input)} to ${JSON.stringify(expected)}`, () => {
        expect(coerceArray(input)).toEqual(expected);
      });
    });
  });

  describe('cacheStringFunction', () => {
    it('should cache function results', () => {
      const fn = cacheStringFunction((str: string) => str.toUpperCase());
      expect(fn('hello')).toBe('HELLO');
      expect(fn('hello')).toBe('HELLO'); // Should return cached result
      expect(fn('world')).toBe('WORLD');
    });

    it('should handle empty strings', () => {
      const fn = cacheStringFunction((str: string) => str);
      expect(fn('')).toBe('');
    });
  });

  describe('hasChanged', () => {
    const testCases = [
      { value: 5, oldValue: 10, expected: true },
      { value: 'old', oldValue: 'new', expected: true },
      { value: { prop: 'old' }, oldValue: { prop: 'new' }, expected: true },
      { value: 5, oldValue: 5, expected: false },
      { value: 'same', oldValue: 'same', expected: false },
      { value: { prop: 'same' }, oldValue: { prop: 'same' }, expected: true },
      { value: Number.NaN, oldValue: Number.NaN, expected: false },
      { value: Number.NaN, oldValue: 5, expected: true },
    ];

    testCases.forEach(({ value, oldValue, expected }) => {
      it(`should return ${expected} for value ${JSON.stringify(value)} and oldValue ${JSON.stringify(oldValue)}`, () => {
        expect(hasChanged(value, oldValue)).toBe(expected);
      });
    });
  });

  describe('startsWith', () => {
    const testCases = [
      { str: 'Hello, World!', searchString: 'Hello', expected: true },
      { str: 'Hello, World!', searchString: 'world', expected: false },
      { str: null, searchString: 'hello', expected: false },
      { str: 123, searchString: 'hello', expected: false },
      { str: {}, searchString: 'hello', expected: false },
      { str: '', searchString: '', expected: true },
      { str: 'hello', searchString: '', expected: true },
      { str: 'hi', searchString: 'hello', expected: false },
    ];

    testCases.forEach(({ str, searchString, expected }) => {
      it(`should return ${expected} for startsWith('${str}', '${searchString}')`, () => {
        // @ts-ignore
        expect(startsWith(str, searchString)).toBe(expected);
      });
    });
  });

  describe('hasOwn', () => {
    const sym = Symbol('symKey'); // Define the symbol once
    const objWithSymbol = { key: 'value', [sym]: 'symbolValue' }; // Use the defined symbol

    const parent = { inheritedKey: 'value' };
    const child = Object.create(parent);
    child.ownKey = 'ownValue';

    const testCases = [
      { obj: { key: 'value' }, key: 'key', expected: true },
      { obj: { key: 'value' }, key: 'nonExistentKey', expected: false },
      { obj: child, key: 'inheritedKey', expected: false },
      { obj: child, key: 'ownKey', expected: true },
      { obj: objWithSymbol, key: sym, expected: true }, // Use the defined symbol
      { obj: {}, key: 'key', expected: false },
      { obj: () => {}, key: 'key', expected: false },
      { obj: new Set(), key: 'key', expected: false },
    ];

    testCases.forEach(({ obj, key, expected }) => {
      it(`should return ${expected} for hasOwn(${JSON.stringify(obj)}, '${String(key)}')`, () => {
        expect(hasOwn(obj, key)).toBe(expected);
      });
    });
  });

  describe('generateUniqueId', () => {
    it('should generate a string of length 8', () => {
      const id = generateUniqueId();
      expect(id).toHaveLength(8);
    });

    it('should generate a string containing only allowed characters', () => {
      const id = generateUniqueId();
      const validCharacters = /^[\da-z]+$/i;
      expect(id).toMatch(validCharacters);
    });

    it('should generate unique IDs for multiple calls', () => {
      const ids = new Set();
      for (let i = 0; i < 1000; i++) {
        const id = generateUniqueId();
        expect(ids.has(id)).toBe(false);
        ids.add(id);
      }
    });

    it('should generate different IDs in subsequent calls', () => {
      const id1 = generateUniqueId();
      const id2 = generateUniqueId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('isBrowser', () => {
    it('should return true if the current environment is a browser', () => {
      expect(isBrowser()).toBe(true);
    });
  });

  describe('isOn', () => {
    const testCases = [
      { key: 'onA', expected: true },
      { key: 'onZ', expected: true },
      { key: 'on1', expected: false },
      { key: 'onb', expected: false },
      { key: 'on ', expected: false },
      { key: 'off', expected: false },
      { key: 'oN', expected: false },
      { key: '', expected: false },
      { key: 'o', expected: false },
      { key: 'on!', expected: false },
    ];

    testCases.forEach(({ key, expected }) => {
      it(`should return ${expected} for isOn('${key}')`, () => {
        expect(isOn(key)).toBe(expected);
      });
    });

    it('should handle all uppercase letters A-Z', () => {
      const uppercaseLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      for (const letter of uppercaseLetters) {
        expect(isOn(`on${letter}`)).toBe(true);
      }
    });

    it('should reject lowercase letters after "on"', () => {
      const lowercaseLetters = 'abcdefghijklmnopqrstuvwxyz';
      for (const letter of lowercaseLetters) {
        expect(isOn(`on${letter}`)).toBe(false);
      }
    });

    it('should reject special characters after "on"', () => {
      const specialChars = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`';
      for (const char of specialChars) {
        expect(isOn(`on${char}`)).toBe(false);
      }
    });

    it('should handle edge cases with short strings', () => {
      expect(isOn('o')).toBe(false);
      expect(isOn('on')).toBe(false);
      expect(isOn('onA')).toBe(true);
    });
  });

  describe('_toString', () => {
    it('should return the correct string tag', () => {
      expect(_toString.call({})).toBe('[object Object]');
      expect(_toString.call([])).toBe('[object Array]');
      expect(_toString.call('')).toBe('[object String]');
      expect(_toString.call(1)).toBe('[object Number]');
      expect(_toString.call(true)).toBe('[object Boolean]');
      expect(_toString.call(null)).toBe('[object Null]');
      expect(_toString.call(undefined)).toBe('[object Undefined]');
      expect(_toString.call(new Date())).toBe('[object Date]');
      expect(_toString.call(/a/)).toBe('[object RegExp]');
      expect(_toString.call(new Map())).toBe('[object Map]');
      expect(_toString.call(new Set())).toBe('[object Set]');
    });
  });

  describe('extend', () => {
    it('should extend an object with properties from other objects', () => {
      const a = { x: 1, y: 2 };
      const b = { y: 3, z: 4 };
      const c = { a: 5 };
      extend(a, b, c);
      expect(a).toEqual({ x: 1, y: 3, z: 4, a: 5 });
    });

    it('should return the target object', () => {
      const a = {};
      const b = { x: 1 };
      const result = extend(a, b);
      expect(result).toBe(a);
    });

    it('should handle empty objects', () => {
      const a = {};
      extend(a, {});
      expect(a).toEqual({});
    });

    it('should overwrite existing properties', () => {
      const a = { x: 1 };
      const b = { x: 2 };
      extend(a, b);
      expect(a.x).toBe(2);
    });
  });

  describe('noop', () => {
    it('should be an empty function', () => {
      expect(noop()).toBeUndefined();
      expect(typeof noop).toBe('function');
    });
  });

  describe('eMPTY_OBJ', () => {
    it('should be a frozen empty object', () => {
      expect(EMPTY_OBJ).toEqual({});
      expect(Object.isFrozen(EMPTY_OBJ)).toBe(true);
      expect(() => {
        // @ts-ignore
        EMPTY_OBJ.foo = 'bar';
      }).toThrow();
      expect(EMPTY_OBJ).toEqual({});
    });
  });

  describe('eMPTY_ARR', () => {
    it('should be a frozen empty array', () => {
      expect(EMPTY_ARR).toEqual([]);
      expect(Object.isFrozen(EMPTY_ARR)).toBe(true);
      expect(() => {
        // @ts-ignore
        EMPTY_ARR.push(1);
      }).toThrow();
      expect(EMPTY_ARR).toEqual([]);
    });
  });

  describe('getGlobalThis', () => {
    it('should return the global object', () => {
      const globalObject = getGlobalThis();
      // In a browser environment, globalThis should be window
      expect(globalObject).toBeDefined();
      // Depending on the test environment, this might be `window`, `self`, or `global`
      // For browser tests, it should be window
      if (typeof window !== 'undefined') {
        expect(globalObject).toBe(window);
      } else if (typeof self !== 'undefined') {
        expect(globalObject).toBe(self);
      } else if (typeof global !== 'undefined') {
        expect(globalObject).toBe(global);
      }
    });

    it('should cache the global object on subsequent calls', () => {
      const first = getGlobalThis();
      const second = getGlobalThis();
      expect(first).toBe(second);
    });

    it('should return globalThis when available', () => {
      const globalObject = getGlobalThis();
      // globalThis is the standard way to access the global object
      if (typeof globalThis !== 'undefined') {
        expect(globalObject).toBe(globalThis);
      }
    });

    it('should return window in browser environment', () => {
      const globalObject = getGlobalThis();
      // In JSDOM environment, window should be available
      expect(globalObject).toBe(window);
      expect(globalObject).toBe(globalThis);
    });

    it('should handle multiple calls efficiently', () => {
      // Call multiple times to ensure caching works
      const results = Array.from({ length: 10 }, () => getGlobalThis());
      // All results should be the same object
      results.forEach(result => {
        expect(result).toBe(results[0]);
      });
    });
  });
});
