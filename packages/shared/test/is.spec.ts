import {
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
  isStringNumber,
  isSymbol,
  isWeakMap,
  isWeakSet,
} from '../src';

describe('isFunction function', () => {
  it('should return true if the input is a function', () => {
    expect(isFunction(() => {})).toBe(true);
    expect(isFunction(() => {})).toBe(true);
  });

  it('should return false if the input is not a function', () => {
    expect(isFunction({})).toBe(false);
    expect(isFunction('string')).toBe(false);
    expect(isFunction(123)).toBe(false);
    expect(isFunction(null)).toBe(false);
  });
});

describe('isPrimitive function', () => {
  it('should return true for primitive values', () => {
    expect(isPrimitive('string')).toBe(true);
    expect(isPrimitive(123)).toBe(true);
    expect(isPrimitive('')).toBe(true);
    expect(isPrimitive(0)).toBe(true);
    expect(isPrimitive(true)).toBe(true);
    expect(isPrimitive(null)).toBe(true);
  });

  it('should return false for non-primitive values', () => {
    expect(isPrimitive({})).toBe(false);
    expect(isPrimitive([])).toBe(false);
    expect(isPrimitive(() => {})).toBe(false);
  });
});

describe('isFalsy function', () => {
  it('should return true for falsy values', () => {
    expect(isFalsy(false)).toBe(true);
    expect(isFalsy(null)).toBe(true);
    expect(isFalsy(undefined)).toBe(true);
  });

  it('should return false for truthy values', () => {
    expect(isFalsy(true)).toBe(false);
    expect(isFalsy(0)).toBe(false);
    expect(isFalsy('string')).toBe(false);
    expect(isFalsy({})).toBe(false);
    expect(isFalsy('')).toBe(false);
  });
});

describe('isObject function', () => {
  it('should return true for objects', () => {
    expect(isObject({})).toBe(true);
    expect(isObject([])).toBe(true);
    expect(isObject(new Map())).toBe(true);
    expect(isObject(new Set())).toBe(true);
    expect(isObject(new WeakMap())).toBe(true);
    expect(isObject(new WeakSet())).toBe(true);
  });

  it('should return false for non-objects', () => {
    expect(isObject('string')).toBe(false);
    expect(isObject(123)).toBe(false);
    expect(isObject(null)).toBe(false);
    expect(isObject(undefined)).toBe(false);
  });
});

describe('isPromise function', () => {
  it('should return true for promises', () => {
    expect(isPromise(new Promise(() => {}))).toBe(true);
  });

  it('should return false for non-promises', () => {
    expect(isPromise({})).toBe(false);
    expect(isPromise([])).toBe(false);
    expect(isPromise(() => {})).toBe(false);
    expect(isPromise(null)).toBe(false);
    expect(isPromise(undefined)).toBe(false);
  });
});

describe('isSymbol', () => {
  it('should return true for symbols', () => {
    expect(isSymbol(Symbol('test'))).toBe(true);
    expect(isSymbol(Symbol())).toBe(true);
  });

  it('should return false for non-symbols', () => {
    expect(isSymbol('string')).toBe(false);
    expect(isSymbol(123)).toBe(false);
    expect(isSymbol({})).toBe(false);
    expect(isSymbol(null)).toBe(false);
    expect(isSymbol(undefined)).toBe(false);
  });
});

describe('isMap', () => {
  it('should return true for Map instances', () => {
    expect(isMap(new Map())).toBe(true);
    expect(
      isMap(
        new Map([
          [1, 'a'],
          [2, 'b'],
        ]),
      ),
    ).toBe(true);
  });

  it('should return false for non-Map instances', () => {
    expect(isMap(new Set())).toBe(false);
    expect(isMap([])).toBe(false);
    expect(isMap({})).toBe(false);
    expect(isMap(null)).toBe(false);
    expect(isMap(undefined)).toBe(false);
  });
});

describe('isSet', () => {
  it('should return true for Set instances', () => {
    expect(isSet(new Set())).toBe(true);
    expect(isSet(new Set([1, 2, 3]))).toBe(true);
  });

  it('should return false for non-Set instances', () => {
    expect(isSet(new Map())).toBe(false);
    expect(isSet([])).toBe(false);
    expect(isSet({})).toBe(false);
    expect(isSet(null)).toBe(false);
    expect(isSet(undefined)).toBe(false);
  });
});

describe('isWeakMap', () => {
  it('should return true for WeakMap instances', () => {
    expect(isWeakMap(new WeakMap())).toBe(true);
  });

  it('should return false for non-WeakMap instances', () => {
    expect(isWeakMap(new Set())).toBe(false);
    expect(isWeakMap([])).toBe(false);
    expect(isWeakMap({})).toBe(false);
    expect(isWeakMap(null)).toBe(false);
    expect(isWeakMap(undefined)).toBe(false);
  });
});

describe('isWeakSet', () => {
  it('should return true for WeakSet instances', () => {
    expect(isWeakSet(new WeakSet())).toBe(true);
  });

  it('should return false for non-WeakSet instances', () => {
    expect(isWeakSet(new Set())).toBe(false);
    expect(isWeakSet([])).toBe(false);
    expect(isWeakSet({})).toBe(false);
    expect(isWeakSet(null)).toBe(false);
    expect(isWeakSet(undefined)).toBe(false);
  });
});

describe('isNil', () => {
  it('should return true for null or undefined', () => {
    expect(isNil(null)).toBe(true);
    expect(isNil(undefined)).toBe(true);
  });

  it('should return false for non-null and non-undefined values', () => {
    expect(isNil(0)).toBe(false);
    expect(isNil('')).toBe(false);
    expect(isNil([])).toBe(false);
    expect(isNil({})).toBe(false);
    expect(isNil(false)).toBe(false);
  });
});

describe('isHTMLElement', () => {
  it('should return true for HTML elements', () => {
    const div = document.createElement('div');
    expect(isHTMLElement(div)).toBe(true);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    expect(isHTMLElement(svg)).toBe(true);
  });

  it('should return false for non-HTML elements', () => {
    expect(isHTMLElement({})).toBe(false);
    expect(isHTMLElement([])).toBe(false);
    expect(isHTMLElement(null)).toBe(false);
    expect(isHTMLElement(undefined)).toBe(false);
    expect(isHTMLElement('string')).toBe(false);
    expect(isHTMLElement(123)).toBe(false);
  });
});

describe('isPlainObject', () => {
  it('should return true for plain objects', () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ a: 1, b: 2 })).toBe(true);
  });

  it('should return false for non-plain objects', () => {
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject(undefined)).toBe(false);
    expect(isPlainObject('string')).toBe(false);
    expect(isPlainObject(123)).toBe(false);

    expect(isPlainObject(() => {})).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-extraneous-class
    expect(isPlainObject(class A {})).toBe(false);
    expect(isPlainObject(Symbol())).toBe(false);
    expect(isPlainObject(Promise.resolve())).toBe(false);
    expect(isPlainObject(new Date())).toBe(false);
    // eslint-disable-next-line unicorn/error-message
    expect(isPlainObject(new Error())).toBe(false);
    expect(isPlainObject(new Map())).toBe(false);
    expect(isPlainObject(new Set())).toBe(false);
    expect(isPlainObject(new WeakMap())).toBe(false);
    expect(isPlainObject(new WeakSet())).toBe(false);
  });
});

describe('isStringNumber', () => {
  it('should return true for string numbers', () => {
    expect(isStringNumber('1')).toBe(true);
    expect(isStringNumber('123')).toBe(true);
    expect(isStringNumber('123.123e3')).toBe(true);
  });

  it('should return false for non-string numbers', () => {
    //@ts-ignore
    expect(isStringNumber(1)).toBe(false);
    //@ts-ignore
    expect(isStringNumber(123)).toBe(false);
  });
});
