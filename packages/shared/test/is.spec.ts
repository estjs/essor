import {
  isFalsy,
  isFunction,
  isIntegerKey,
  isObject,
  isPrimitive,
  isPromise,
} from '../src';

describe('isIntegerKey function', () => {
  it('should return true for integer-like strings representing non-negative integers', () => {
    expect(isIntegerKey('0')).toBe(true);
    expect(isIntegerKey('1')).toBe(true);
    expect(isIntegerKey('123')).toBe(true);
  });

  it('should return false for non-integer-like strings or negative integers', () => {
    expect(isIntegerKey('')).toBe(false);
    expect(isIntegerKey('abc')).toBe(false);
    expect(isIntegerKey('-1')).toBe(false);
    expect(isIntegerKey('-123')).toBe(false);
    expect(isIntegerKey('NaN')).toBe(false);
  });
});

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
  });

  it('should return false for non-primitive values', () => {
    expect(isPrimitive({})).toBe(false);
    expect(isPrimitive([])).toBe(false);
    expect(isPrimitive(() => {})).toBe(false);
    expect(isPrimitive(null)).toBe(false);
    expect(isPrimitive(undefined)).toBe(false);
  });
});

describe('isFalsy function', () => {
  it('should return true for falsy values', () => {
    expect(isFalsy(false)).toBe(true);
    expect(isFalsy(null)).toBe(true);
    expect(isFalsy(undefined)).toBe(true);
    expect(isFalsy('')).toBe(true);
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
