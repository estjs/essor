import {
  isArray,
  isFalsy,
  isFunction,
  isHTMLElement,
  isMap,
  isNil,
  isObject,
  isPlainObject,
  isPrimitive,
  isPromise,
  isSet,
  isString,
  isStringNumber,
  isSymbol,
  isWeakMap,
  isWeakSet,
} from '../src';

describe('type Check Utils', () => {
  describe('isObject', () => {
    it('should correctly identify objects', () => {
      expect(isObject({})).toBe(true);
      expect(isObject([])).toBe(true);
      expect(isObject(new Map())).toBe(true);
      expect(isObject(new Set())).toBe(true);
      expect(isObject(new WeakMap())).toBe(true);
      expect(isObject(new WeakSet())).toBe(true);
    });

    it('should correctly identify non-objects', () => {
      expect(isObject('string')).toBe(false);
      expect(isObject(123)).toBe(false);
      expect(isObject(null)).toBe(false);
      expect(isObject(undefined)).toBe(false);
    });
  });

  describe('isPromise', () => {
    it('should correctly identify Promises', () => {
      expect(isPromise(Promise.resolve())).toBe(true);
      expect(isPromise(new Promise(() => {}))).toBe(true);
    });

    it('should correctly identify non-Promises', () => {
      expect(isPromise({})).toBe(false);
      expect(isPromise([])).toBe(false);
      expect(isPromise(() => {})).toBe(false);
      expect(isPromise(null)).toBe(false);
      expect(isPromise(undefined)).toBe(false);
    });
  });

  describe('isArray', () => {
    it('should correctly identify arrays', () => {
      expect(isArray([])).toBe(true);
      expect(isArray([1, 2, 3])).toBe(true);
    });

    it('should correctly identify non-arrays', () => {
      expect(isArray({})).toBe(false);
      expect(isArray('string')).toBe(false);
      expect(isArray(123)).toBe(false);
      expect(isArray(null)).toBe(false);
      expect(isArray(undefined)).toBe(false);
    });
  });

  describe('isString', () => {
    it('should correctly identify strings', () => {
      expect(isString('')).toBe(true);
      expect(isString('string')).toBe(true);
      expect(isString(String('string'))).toBe(true);
    });

    it('should correctly identify non-strings', () => {
      expect(isString(123)).toBe(false);
      expect(isString({})).toBe(false);
      expect(isString([])).toBe(false);
      expect(isString(null)).toBe(false);
      expect(isString(undefined)).toBe(false);
    });
  });

  describe('isSymbol', () => {
    it('should correctly identify Symbols', () => {
      expect(isSymbol(Symbol())).toBe(true);
      expect(isSymbol(Symbol('test'))).toBe(true);
    });

    it('should correctly identify non-Symbols', () => {
      expect(isSymbol('string')).toBe(false);
      expect(isSymbol(123)).toBe(false);
      expect(isSymbol({})).toBe(false);
      expect(isSymbol(null)).toBe(false);
      expect(isSymbol(undefined)).toBe(false);
    });
  });

  describe('isSet', () => {
    it('should correctly identify Sets', () => {
      expect(isSet(new Set())).toBe(true);
      expect(isSet(new Set([1, 2, 3]))).toBe(true);
    });

    it('should correctly identify non-Sets', () => {
      expect(isSet(new Map())).toBe(false);
      expect(isSet([])).toBe(false);
      expect(isSet({})).toBe(false);
      expect(isSet(null)).toBe(false);
      expect(isSet(undefined)).toBe(false);
    });
  });

  describe('isWeakMap', () => {
    it('should correctly identify WeakMaps', () => {
      expect(isWeakMap(new WeakMap())).toBe(true);
    });

    it('should correctly identify non-WeakMaps', () => {
      expect(isWeakMap(new Map())).toBe(false);
      expect(isWeakMap([])).toBe(false);
      expect(isWeakMap({})).toBe(false);
      expect(isWeakMap(null)).toBe(false);
      expect(isWeakMap(undefined)).toBe(false);
    });
  });

  describe('isWeakSet', () => {
    it('should correctly identify WeakSets', () => {
      expect(isWeakSet(new WeakSet())).toBe(true);
    });

    it('should correctly identify non-WeakSets', () => {
      expect(isWeakSet(new Set())).toBe(false);
      expect(isWeakSet([])).toBe(false);
      expect(isWeakSet({})).toBe(false);
      expect(isWeakSet(null)).toBe(false);
      expect(isWeakSet(undefined)).toBe(false);
    });
  });

  describe('isMap', () => {
    it('should correctly identify Maps', () => {
      expect(isMap(new Map())).toBe(true);
      expect(isMap(new Map([['key', 'value']]))).toBe(true);
    });

    it('should correctly identify non-Maps', () => {
      expect(isMap(new Set())).toBe(false);
      expect(isMap([])).toBe(false);
      expect(isMap({})).toBe(false);
      expect(isMap(null)).toBe(false);
      expect(isMap(undefined)).toBe(false);
    });
  });

  describe('isNil', () => {
    it('should correctly identify null and undefined', () => {
      expect(isNil(null)).toBe(true);
      expect(isNil(undefined)).toBe(true);
    });

    it('should correctly identify non-null and non-undefined values', () => {
      expect(isNil(0)).toBe(false);
      expect(isNil('')).toBe(false);
      expect(isNil([])).toBe(false);
      expect(isNil({})).toBe(false);
      expect(isNil(false)).toBe(false);
    });
  });

  describe('isFunction', () => {
    it('should correctly identify functions', () => {
      expect(isFunction(() => {})).toBe(true);
      expect(isFunction(() => {})).toBe(true);
      expect(isFunction(async () => {})).toBe(true);
      expect(isFunction(function* () {})).toBe(true);
    });

    it('should correctly identify non-functions', () => {
      expect(isFunction({})).toBe(false);
      expect(isFunction([])).toBe(false);
      expect(isFunction('string')).toBe(false);
      expect(isFunction(123)).toBe(false);
      expect(isFunction(null)).toBe(false);
      expect(isFunction(undefined)).toBe(false);
    });
  });

  describe('isFalsy', () => {
    it('should correctly identify falsy values', () => {
      expect(isFalsy(false)).toBe(true);
      expect(isFalsy(null)).toBe(true);
      expect(isFalsy(undefined)).toBe(true);
    });

    it('should correctly identify non-falsy values', () => {
      expect(isFalsy(true)).toBe(false);
      expect(isFalsy(0)).toBe(false);
      expect(isFalsy('')).toBe(false);
      expect(isFalsy([])).toBe(false);
      expect(isFalsy({})).toBe(false);
    });
  });

  describe('isPrimitive', () => {
    it('should correctly identify primitive values', () => {
      expect(isPrimitive('string')).toBe(true);
      expect(isPrimitive(123)).toBe(true);
      expect(isPrimitive(true)).toBe(true);
      expect(isPrimitive(Symbol())).toBe(true);
      expect(isPrimitive(null)).toBe(true);
      expect(isPrimitive(undefined)).toBe(true);
    });

    it('should correctly identify non-primitive values', () => {
      expect(isPrimitive({})).toBe(false);
      expect(isPrimitive([])).toBe(false);
      expect(isPrimitive(() => {})).toBe(false);
      expect(isPrimitive(new Date())).toBe(false);
      expect(isPrimitive(/(?:)/)).toBe(false);
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

  describe('isPlainObject', () => {
    it('should correctly identify plain objects', () => {
      expect(isPlainObject({})).toBe(true);
      expect(isPlainObject({ a: 1, b: 2 })).toBe(true);
      expect(isPlainObject(Object.create(null))).toBe(true);
    });

    it('should correctly identify non-plain objects', () => {
      expect(isPlainObject([])).toBe(false);
      expect(isPlainObject(() => {})).toBe(false);
      expect(isPlainObject(new Date())).toBe(false);
      expect(isPlainObject(/(?:)/)).toBe(false);
      expect(isPlainObject(null)).toBe(false);
      expect(isPlainObject(undefined)).toBe(false);
    });
  });

  describe('isStringNumber', () => {
    it('should correctly identify string numbers', () => {
      expect(isStringNumber('0')).toBe(true);
      expect(isStringNumber('123')).toBe(true);
      expect(isStringNumber('-123')).toBe(true);
      expect(isStringNumber('123.456')).toBe(true);
      expect(isStringNumber('1e5')).toBe(true);
    });

    it('should correctly identify non-string numbers', () => {
      expect(isStringNumber('abc')).toBe(false);
      expect(isStringNumber('123abc')).toBe(false);
      expect(isStringNumber('')).toBe(false);
      expect(isStringNumber(123)).toBe(false);
      expect(isStringNumber(null)).toBe(false);
      expect(isStringNumber(undefined)).toBe(false);
    });
  });
});
