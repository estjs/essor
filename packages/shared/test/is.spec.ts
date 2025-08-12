import {
  isArray,
  isBoolean,
  isFalsy,
  isFunction,
  isHTMLElement,
  isHTMLNode,
  isIntegerKey,
  isMap,
  isNil,
  isNull,
  isNumber,
  isObject,
  isPlainObject,
  isPrimitive,
  isPromise,
  isSet,
  isString,
  isStringNumber,
  isSymbol,
  isUndefined,
  isWeakMap,
  isWeakSet,
} from '../src';

describe('type Check Utils', () => {
  describe('isObject', () => {
    const testCases = [
      { value: {}, expected: true },
      { value: [], expected: true },
      { value: new Map(), expected: true },
      { value: new Set(), expected: true },
      { value: new WeakMap(), expected: true },
      { value: new WeakSet(), expected: true },
      { value: 'string', expected: false },
      { value: 123, expected: false },
      { value: null, expected: false },
      { value: undefined, expected: false },
    ];

    testCases.forEach(({ value, expected }) => {
      it(`should return ${expected} for isObject(${JSON.stringify(value)})`, () => {
        expect(isObject(value)).toBe(expected);
      });
    });
  });

  describe('isPromise', () => {
    const testCases = [
      { value: Promise.resolve(), expected: true },
      { value: new Promise(() => {}), expected: true },
      { value: {}, expected: false },
      { value: [], expected: false },
      { value: () => {}, expected: false },
      { value: null, expected: false },
      { value: undefined, expected: false },
    ];

    testCases.forEach(({ value, expected }) => {
      it(`should return ${expected} for isPromise(${JSON.stringify(value)})`, () => {
        expect(isPromise(value)).toBe(expected);
      });
    });
  });

  describe('isArray', () => {
    const testCases = [
      { value: [], expected: true },
      { value: [1, 2, 3], expected: true },
      { value: {}, expected: false },
      { value: 'string', expected: false },
      { value: 123, expected: false },
      { value: null, expected: false },
      { value: undefined, expected: false },
    ];

    testCases.forEach(({ value, expected }) => {
      it(`should return ${expected} for isArray(${JSON.stringify(value)})`, () => {
        expect(isArray(value)).toBe(expected);
      });
    });
  });

  describe('isString', () => {
    const testCases = [
      { value: '', expected: true },
      { value: 'string', expected: true },
      { value: String('string'), expected: true },
      { value: 123, expected: false },
      { value: {}, expected: false },
      { value: [], expected: false },
      { value: null, expected: false },
      { value: undefined, expected: false },
    ];

    testCases.forEach(({ value, expected }) => {
      it(`should return ${expected} for isString(${JSON.stringify(value)})`, () => {
        expect(isString(value)).toBe(expected);
      });
    });
  });

  describe('isNumber', () => {
    const testCases = [
      { value: 123, expected: true },
      { value: 0, expected: true },
      { value: -1, expected: true },
      { value: 1.23, expected: true },
      { value: Number.NaN, expected: true },
      { value: Infinity, expected: true },
      { value: '123', expected: false },
      { value: null, expected: false },
      { value: undefined, expected: false },
    ];

    testCases.forEach(({ value, expected }) => {
      it(`should return ${expected} for isNumber(${JSON.stringify(value)})`, () => {
        expect(isNumber(value)).toBe(expected);
      });
    });
  });

  describe('isNull', () => {
    const testCases = [
      { value: null, expected: true },
      { value: undefined, expected: false },
      { value: 0, expected: false },
      { value: '', expected: false },
    ];

    testCases.forEach(({ value, expected }) => {
      it(`should return ${expected} for isNull(${JSON.stringify(value)})`, () => {
        expect(isNull(value)).toBe(expected);
      });
    });
  });

  describe('isSymbol', () => {
    const testCases = [
      { value: Symbol(), expected: true },
      { value: Symbol('test'), expected: true },
      { value: 'string', expected: false },
      { value: 123, expected: false },
      { value: {}, expected: false },
      { value: null, expected: false },
      { value: undefined, expected: false },
    ];

    testCases.forEach(({ value, expected }) => {
      it(`should return ${expected} for isSymbol(${JSON.stringify(value)})`, () => {
        expect(isSymbol(value)).toBe(expected);
      });
    });
  });

  describe('isSet', () => {
    const testCases = [
      { value: new Set(), expected: true },
      { value: new Set([1, 2, 3]), expected: true },
      { value: new Map(), expected: false },
      { value: [], expected: false },
      { value: {}, expected: false },
      { value: null, expected: false },
      { value: undefined, expected: false },
    ];

    testCases.forEach(({ value, expected }) => {
      it(`should return ${expected} for isSet(${JSON.stringify(value)})`, () => {
        expect(isSet(value)).toBe(expected);
      });
    });
  });

  describe('isWeakMap', () => {
    const testCases = [
      { value: new WeakMap(), expected: true },
      { value: new Map(), expected: false },
      { value: [], expected: false },
      { value: {}, expected: false },
      { value: null, expected: false },
      { value: undefined, expected: false },
    ];

    testCases.forEach(({ value, expected }) => {
      it(`should return ${expected} for isWeakMap(${JSON.stringify(value)})`, () => {
        expect(isWeakMap(value)).toBe(expected);
      });
    });
  });

  describe('isWeakSet', () => {
    const testCases = [
      { value: new WeakSet(), expected: true },
      { value: new Set(), expected: false },
      { value: [], expected: false },
      { value: {}, expected: false },
      { value: null, expected: false },
      { value: undefined, expected: false },
    ];

    testCases.forEach(({ value, expected }) => {
      it(`should return ${expected} for isWeakSet(${JSON.stringify(value)})`, () => {
        expect(isWeakSet(value)).toBe(expected);
      });
    });
  });

  describe('isMap', () => {
    const testCases = [
      { value: new Map(), expected: true },
      { value: new Map([['key', 'value']]), expected: true },
      { value: new Set(), expected: false },
      { value: [], expected: false },
      { value: {}, expected: false },
      { value: null, expected: false },
      { value: undefined, expected: false },
    ];

    testCases.forEach(({ value, expected }) => {
      it(`should return ${expected} for isMap(${JSON.stringify(value)})`, () => {
        expect(isMap(value)).toBe(expected);
      });
    });
  });

  describe('isNil', () => {
    const testCases = [
      { value: null, expected: true },
      { value: undefined, expected: true },
      { value: 0, expected: false },
      { value: '', expected: false },
      { value: [], expected: false },
      { value: {}, expected: false },
      { value: false, expected: false },
    ];

    testCases.forEach(({ value, expected }) => {
      it(`should return ${expected} for isNil(${JSON.stringify(value)})`, () => {
        expect(isNil(value)).toBe(expected);
      });
    });
  });

  describe('isFunction', () => {
    const testCases = [
      { value: () => {}, expected: true },
      { value: async () => {}, expected: true },
      { *value() {}, expected: true },
      { value: {}, expected: false },
      { value: [], expected: false },
      { value: 'string', expected: false },
      { value: 123, expected: false },
      { value: null, expected: false },
      { value: undefined, expected: false },
    ];

    testCases.forEach(({ value, expected }) => {
      it(`should return ${expected} for isFunction(${JSON.stringify(value)})`, () => {
        expect(isFunction(value)).toBe(expected);
      });
    });
  });

  describe('isFalsy', () => {
    const testCases = [
      { value: false, expected: true },
      { value: null, expected: true },
      { value: undefined, expected: true },
      { value: true, expected: false },
      { value: 0, expected: false },
      { value: '', expected: false },
      { value: [], expected: false },
      { value: {}, expected: false },
    ];

    testCases.forEach(({ value, expected }) => {
      it(`should return ${expected} for isFalsy(${JSON.stringify(value)})`, () => {
        expect(isFalsy(value)).toBe(expected);
      });
    });
  });

  describe('isPrimitive', () => {
    const testCases = [
      { value: 'string', expected: true },
      { value: 123, expected: true },
      { value: true, expected: true },
      { value: Symbol(), expected: true },
      { value: null, expected: true },
      { value: undefined, expected: true },
      { value: {}, expected: false },
      { value: [], expected: false },
      { value: () => {}, expected: false },
      { value: new Date(), expected: false },
      { value: /(?:)/, expected: false },
    ];

    testCases.forEach(({ value, expected }) => {
      it(`should return ${expected} for isPrimitive(${JSON.stringify(value)})`, () => {
        expect(isPrimitive(value)).toBe(expected);
      });
    });
  });

  describe('isHTMLElement', () => {
    it('should correctly identify HTML elements', () => {
      const div = document.createElement('div');
      expect(isHTMLElement(div)).toBe(true);
    });

    it('should correctly identify non-HTML elements', () => {
      expect(isHTMLElement({})).toBe(false);
      expect(isHTMLElement([])).toBe(false);
      expect(isHTMLElement(null)).toBe(false);
      expect(isHTMLElement(undefined)).toBe(false);
      expect(isHTMLElement('string')).toBe(false);
      expect(isHTMLElement(123)).toBe(false);
    });
  });

  describe('isHTMLNode', () => {
    it('should correctly identify HTML nodes', () => {
      const div = document.createElement('div');
      expect(isHTMLNode(div)).toBe(true);
    });

    it('should correctly identify non-HTML nodes', () => {
      expect(isHTMLNode({})).toBe(false);
      expect(isHTMLNode([])).toBe(false);
      expect(isHTMLNode(null)).toBe(false);
      expect(isHTMLNode(undefined)).toBe(false);
      expect(isHTMLNode('string')).toBe(false);
      expect(isHTMLNode(123)).toBe(false);
    });
  });

  describe('isPlainObject', () => {
    const testCases = [
      { value: {}, expected: true },
      { value: { a: 1, b: 2 }, expected: true },
      { value: Object.create(null), expected: true },
      { value: [], expected: false },
      { value: () => {}, expected: false },
      { value: new Date(), expected: false },
      { value: /(?:)/, expected: false },
      { value: null, expected: false },
      { value: undefined, expected: false },
    ];

    testCases.forEach(({ value, expected }) => {
      it(`should return ${expected} for isPlainObject(${JSON.stringify(value)})`, () => {
        expect(isPlainObject(value)).toBe(expected);
      });
    });
  });

  describe('isStringNumber', () => {
    const testCases = [
      { value: '0', expected: true },
      { value: '123', expected: true },
      { value: '-123', expected: true },
      { value: '123.456', expected: true },
      { value: '1e5', expected: true },
      { value: 'abc', expected: false },
      { value: '123abc', expected: false },
      { value: '', expected: false },
      { value: 123, expected: false },
      { value: null, expected: false },
      { value: undefined, expected: false },
    ];

    testCases.forEach(({ value, expected }) => {
      it(`should return ${expected} for isStringNumber(${JSON.stringify(value)})`, () => {
        expect(isStringNumber(value)).toBe(expected);
      });
    });
  });

  describe('isUndefined', () => {
    const testCases = [
      { value: undefined, expected: true },
      { value: null, expected: false },
      { value: 0, expected: false },
      { value: '', expected: false },
    ];

    testCases.forEach(({ value, expected }) => {
      it(`should return ${expected} for isUndefined(${JSON.stringify(value)})`, () => {
        expect(isUndefined(value)).toBe(expected);
      });
    });
  });

  describe('isBoolean', () => {
    const testCases = [
      { value: true, expected: true },
      { value: false, expected: true },
      { value: 0, expected: false },
      { value: 1, expected: false },
      { value: null, expected: false },
      { value: undefined, expected: false },
      { value: '', expected: false },
      { value: 'true', expected: false },
    ];

    testCases.forEach(({ value, expected }) => {
      it(`should return ${expected} for isBoolean(${JSON.stringify(value)})`, () => {
        expect(isBoolean(value)).toBe(expected);
      });
    });
  });

  describe('isIntegerKey', () => {
    const testCases = [
      { key: '0', expected: true },
      { key: '123', expected: true },
      { key: '-123', expected: false },
      { key: 'NaN', expected: false },
      { key: '1.23', expected: false },
      { key: 'abc', expected: false },
      { key: 123, expected: false },
      { key: null, expected: false },
      { key: undefined, expected: false },
    ];

    testCases.forEach(({ key, expected }) => {
      it(`should return ${expected} for isIntegerKey(${JSON.stringify(key)})`, () => {
        expect(isIntegerKey(key)).toBe(expected);
      });
    });
  });
});
