import { coerceArray, generateUniqueId, hasChanged, hasOwn, isBrowser, startsWith } from '../src';

describe('coerceArray function', () => {
  it('should return an array containing the input value if it is not an array', () => {
    expect(coerceArray(5)).toEqual([5]);
    expect(coerceArray('test')).toEqual(['test']);
    expect(coerceArray({ key: 'value' })).toEqual([{ key: 'value' }]);
  });

  it('should return the input array unchanged if it is already an array', () => {
    const inputArray = [1, 2, 3];
    expect(coerceArray(inputArray)).toEqual(inputArray);
  });
});

describe('hasChanged function', () => {
  it('should return true if the value has changed from the oldValue', () => {
    expect(hasChanged(5, 10)).toBe(true);
    expect(hasChanged('old', 'new')).toBe(true);
    expect(hasChanged({ prop: 'old' }, { prop: 'new' })).toBe(true);
  });

  it('should return false if the value has not changed from the oldValue', () => {
    expect(hasChanged(5, 5)).toBe(false);
    expect(hasChanged('same', 'same')).toBe(false);
    expect(hasChanged({ prop: 'same' }, { prop: 'same' })).toBe(true);
  });

  it('should handle special cases like NaN', () => {
    expect(hasChanged(Number.NaN, Number.NaN)).toBe(false);
    expect(hasChanged(Number.NaN, 5)).toBe(true);
  });
});

describe('startsWith', () => {
  it('should return true if the string starts with the specified substring', () => {
    expect(startsWith('Hello, World!', 'Hello')).toBe(true);
  });

  it('should return false if the string does not start with the specified substring', () => {
    expect(startsWith('Hello, World!', 'world')).toBe(false);
  });

  it('should return false if the first argument is not a string', () => {
    expect(startsWith(null, 'hello')).toBe(false);
    expect(startsWith(123, 'hello')).toBe(false);
    expect(startsWith({}, 'hello')).toBe(false);
  });

  it('should handle empty strings correctly', () => {
    expect(startsWith('', '')).toBe(true); // An empty string starts with an empty string
    expect(startsWith('hello', '')).toBe(true); // Any string starts with an empty string
  });

  it('should return false if the search string is longer than the input string', () => {
    expect(startsWith('hi', 'hello')).toBe(false);
  });
});

describe('hasOwn', () => {
  it('should return true if the object has the specified own property', () => {
    const obj = { key: 'value' };
    expect(hasOwn(obj, 'key')).toBe(true);
  });

  it('should return false if the object does not have the specified own property', () => {
    const obj = { key: 'value' };
    expect(hasOwn(obj, 'nonExistentKey')).toBe(false);
  });

  it('should return false if the property is inherited, not own', () => {
    const parent = { inheritedKey: 'value' };
    const child = Object.create(parent);
    child.ownKey = 'ownValue';
    expect(hasOwn(child, 'inheritedKey')).toBe(false);
    expect(hasOwn(child, 'ownKey')).toBe(true);
  });

  it('should return true for symbol properties', () => {
    const sym = Symbol('symKey');
    const obj = { [sym]: 'symbolValue' };
    expect(hasOwn(obj, sym)).toBe(true);
  });

  it('should return false for not own values', () => {
    expect(hasOwn({}, 'key')).toBe(false);
    expect(hasOwn(() => {}, 'key')).toBe(false);
    expect(hasOwn(new Set(), 'key')).toBe(false);
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
      expect(ids.has(id)).toBe(false); // Ensure no duplicates
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
