import { coerceArray, generateUniqueId, hasChanged, isBrowser, startsWith } from '../src';

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

describe('startsWith function', () => {
  it('should return true if str starts with searchString', () => {
    expect(startsWith('https://www.google.com', 'https')).toBe(true);
  });

  it('should return true if searchString is an empty string', () => {
    expect(startsWith('any string', '')).toBe(true);
  });

  it('should return true if str and searchString are the same', () => {
    expect(startsWith('https', 'https')).toBe(true);
  });

  it('should return false if str is an empty string and searchString is not', () => {
    expect(startsWith('', 'https')).toBe(false);
  });

  it('should be case-sensitive', () => {
    expect(startsWith('https://www.google.com', 'HTTP')).toBe(false);
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
