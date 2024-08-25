import {
  isFalsy,
  isFunction,
  isHTMLElement,
  isMap,
  isNil,
  isObject,
  isPrimitive,
  isPromise,
  isSymbol,
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
    expect(isFalsy('')).toBe(false);
  });

  it('should return false for truthy values', () => {
    expect(isFalsy(true)).toBe(false);
    expect(isFalsy(0)).toBe(false);
    expect(isFalsy('string')).toBe(false);
    expect(isFalsy({})).toBe(false);
  });
});

describe('isObject function', () => {
  it('should return true for objects', () => {
    expect(isObject({})).toBe(true);
    expect(isObject([])).toBe(true);
    expect(isObject(new Map())).toBe(true);
    expect(isObject(new Set())).toBe(true);
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
