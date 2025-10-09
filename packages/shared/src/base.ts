import { isArray, isFunction, isString } from './is';

/**
 * Reference to Object.prototype.toString
 * @type {Function}
 */
export const _toString = Object.prototype.toString;

/**
 * Reference to Object.assign
 * @type {Function}
 */
export const extend = Object.assign;

/**
 * Checks if an object has a specific property
 * @template T
 * @param {object} val - The target object to check
 * @param {string | symbol} key - The property name to check for
 * @returns {key is keyof T} - Returns true if the object has the property, false otherwise
 */
export const hasOwn = (val: object, key: string | symbol): key is keyof typeof val =>
  Object.hasOwn(val, key);

/**
 * Forces a value to be an array
 * @template T - The type of array elements
 * @param {T | T[]} data - The data to convert, can be a single element or an array
 * @returns {T[]} - The resulting array
 */
export function coerceArray<T>(data: T | T[]): T[] {
  return isArray(data) ? data : [data];
}

/**
 * Checks if a value has changed
 * @param {unknown } value - The new value
 * @param {unknown } oldValue - The old value
 * @returns {boolean} - Returns true if the value has changed, false otherwise
 */
export const hasChanged = (value: unknown, oldValue: unknown): boolean =>
  !Object.is(value, oldValue);

/**
 * Empty function, used for defaults and placeholders
 * @type {Function}
 */
export const noop = Function.prototype as () => void;

/**
 * Checks if a string starts with a specified substring
 * 
 * Uses indexOf for better performance in most cases
 * @see https://www.measurethat.net/Benchmarks/Show/12350/0/startswith-vs-test-vs-match-vs-indexof#latest_results_block
 * @param {string} str - The string to check
 * @param {string} searchString - The substring to search for
 * @returns {boolean} - Returns true if the string starts with the substring, false otherwise
 */
export function startsWith(str: string, searchString: string): boolean {
  if (!isString(str)) {
    return false;
  }
  return str.indexOf(searchString) === 0;
}

/**
 * Generates an 8-character random string as a unique identifier
 * 
 * Note: Uses Math.random() which is not cryptographically secure.
 * For security-sensitive use cases, consider using crypto.getRandomValues()
 * @returns {string} - The generated unique identifier
 */
export function generateUniqueId(): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const charactersLength = characters.length;
  for (let i = 0; i < 8; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

/**
 * Checks if the current environment is a browser
 * @returns {boolean} - Returns true if in a browser environment, false otherwise
 */
export function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

/**
 * Creates a cached version of a string processing function
 * @template T - The function type
 * @param {T} fn - The string processing function to cache
 * @returns {T} - The cached function
 */
export const cacheStringFunction = <T extends (str: string) => string>(fn: T): T => {
  const cache: Record<string, string> = Object.create(null);
  return ((str: string) => {
    const hit = cache[str];
    return hit || (cache[str] = fn(str));
  }) as T;
};

/**
 * Read-only empty object
 * @type {Readonly<Record<string, unknown >>}
 */
export const EMPTY_OBJ: { readonly [key: string]: unknown } = Object.freeze({});

/**
 * Read-only empty array
 * @type {readonly never[]}
 */
export const EMPTY_ARR: readonly never[] = Object.freeze([]);

/**
 * Checks if a property name is an event handler (starts with 'on' followed by uppercase letter)
 * 
 * Matches patterns like: onClick, onChange, onKeyDown (but not 'onclick' or 'on123')
 * @param {string} key - The property name to check
 * @returns {boolean} - Returns true if the property is an event handler, false otherwise
 */
export const isOn = (key: string): boolean =>
  key.charCodeAt(0) === 111 /* o */ &&
  key.charCodeAt(1) === 110 /* n */ &&
  key.charCodeAt(2) >= 65 && // uppercase letter A-Z
  key.charCodeAt(2) <= 90;

declare let global: {};

let _globalThis: unknown;
/**
 * Gets the global object for the current environment
 * 
 * Supports multiple environments: browser (globalThis/window/self) and Node.js (global)
 * The result is cached after first call for better performance
 * @returns {unknown } - The global object for the current environment
 */
export const getGlobalThis = (): unknown => {
  return (
    _globalThis ||
    (_globalThis =
      typeof globalThis !== 'undefined'
        ? globalThis
        : typeof self !== 'undefined'
          ? self
          : typeof window !== 'undefined'
            ? window
            : typeof global !== 'undefined'
              ? global
              : {})
  );
};

export type ExcludeType = ((key: string | symbol) => boolean) | (string | symbol)[];

/**
 * Checks if a key should be excluded
 * @param {string | symbol} key - The key to check
 * @param {ExcludeType} [exclude] - The exclusion condition, can be a function or array
 * @returns {boolean} - Returns true if the key should be excluded, false otherwise
 */
export function isExclude(key: string | symbol, exclude?: ExcludeType): boolean {
  if (!exclude) {
    return false;
  }
  return isArray(exclude) ? exclude.includes(key) : isFunction(exclude) ? exclude(key) : false;
}
