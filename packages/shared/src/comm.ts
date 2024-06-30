import { isPrimitive } from './is';

export const _toString = Object.prototype.toString;
export const extend = Object.assign;
const hasOwnProperty = Object.prototype.hasOwnProperty;
export const hasOwn = (val: object, key: string | symbol): key is keyof typeof val =>
  hasOwnProperty.call(val, key);

export function coerceArray<T>(data: T | T[]): T[] {
  return Array.isArray(data) ? (data.flat() as T[]) : [data];
}
export const hasChanged = (value, oldValue) =>
  value !== oldValue && (value === value || oldValue === oldValue);
export const noop = Function.prototype as () => void;

/**
 * A function that checks if a string starts with a specific substring.
 *  indexOf faster under normal circumstances
 * @see https://www.measurethat.net/Benchmarks/Show/12350/0/startswith-vs-test-vs-match-vs-indexof#latest_results_block

 * @param {string} str - The input string to check.
 * @param {string} searchString - The substring to check for at the beginning of the input string.
 * @return {boolean} Returns true if the input string starts with the specified substring, otherwise false.
 */
export function startsWith(str, searchString) {
  return str.indexOf(searchString) === 0;
}

/**
 * Recursively clones an object, including its nested properties and special types like Date, RegExp, Map, and Set.
 *
 * @param {any} obj - The object to clone.
 * @param {WeakMap<object, object>} [hash] - A WeakMap used to track circular references.
 * @return {any} The cloned object.
 */
export function deepClone(obj, hash = new WeakMap()) {
  // Return primitives and functions as-is
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  // Handle circular references
  if (hash.has(obj)) {
    return hash.get(obj);
  }

  // Handle special types
  if (obj instanceof Date) {
    return new Date(obj);
  }

  if (obj instanceof RegExp) {
    return new RegExp(obj);
  }

  if (obj instanceof Map) {
    const mapClone = new Map();
    hash.set(obj, mapClone);
    obj.forEach((value, key) => {
      mapClone.set(deepClone(key, hash), deepClone(value, hash));
    });
    return mapClone;
  }

  if (obj instanceof Set) {
    const setClone = new Set();
    hash.set(obj, setClone);
    obj.forEach(value => {
      setClone.add(deepClone(value, hash));
    });
    return setClone;
  }

  // Initialize the clone and store it in the WeakMap
  const cloneObj = Array.isArray(obj) ? [] : {};
  hash.set(obj, cloneObj);

  // Iterate over object keys
  const keys = Object.keys(obj);
  for (const key of keys) {
    cloneObj[key] = deepClone(obj[key], hash);
  }

  return cloneObj;
}

/**
 * Determines whether two values are deeply equal.
 *
 * @param {any} a - The first value to compare.
 * @param {any} b - The second value to compare.
 * @param {WeakMap<object, object>} [seen] - A WeakMap used to store previously seen objects to avoid infinite recursion.
 * @return {boolean} True if the values are deeply equal, false otherwise.
 */
export function deepEqual(a: any, b: any, seen = new WeakMap()): boolean {
  if (isPrimitive(a) && isPrimitive(b)) {
    return a === b;
  }

  if (a === b) {
    return true;
  }

  if (a == null || b == null || typeof a !== 'object' || typeof b !== 'object') {
    return false;
  }

  if (a.constructor !== b.constructor) {
    return false;
  }

  if (seen.has(a)) {
    return seen.get(a) === b;
  }

  seen.set(a, b);

  if (Array.isArray(a)) {
    if (a.length !== b.length) {
      return false;
    }
    for (const [i, element] of a.entries()) {
      if (!deepEqual(element, b[i], seen)) {
        return false;
      }
    }
    return true;
  }

  if (a instanceof Map) {
    if (a.size !== b.size) {
      return false;
    }
    for (const [key, value] of a) {
      if (!b.has(key) || !deepEqual(value, b.get(key), seen)) {
        return false;
      }
    }
    return true;
  }

  if (a instanceof Set) {
    if (a.size !== b.size) {
      return false;
    }
    const arrA = Array.from(a).sort();
    const arrB = Array.from(b).sort();
    for (const [i, element] of arrA.entries()) {
      if (!deepEqual(element, arrB[i], seen)) {
        return false;
      }
    }
    return true;
  }

  const keysA = Object.keys(a);
  const keysB = new Set(Object.keys(b));

  if (keysA.length !== keysB.size) {
    return false;
  }

  for (const key of keysA) {
    if (!keysB.has(key) || !deepEqual(a[key], b[key], seen)) {
      return false;
    }
  }

  return true;
}



/**
 * Escapes special HTML characters in a string.
 * @param str - The string to escape.
 * @returns The escaped string.
 */
export function escape(str: string): string {
  return str.replaceAll(/["&'<>]/g, char => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#039;';
      default:
        return char;
    }
  });
}
