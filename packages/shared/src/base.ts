import { isArray } from './is';

/**
 * Reference to Object.prototype.toString
 * @type {Function}
 */
export const _toString = Object.prototype.toString;
const hasOwnProperty = Object.prototype.hasOwnProperty;

/**
 * Reference to Object.assign
 * @type {Function}
 */
export const extend = Object.assign;

/**
 * Checks if an object has a specific property.
 *
 * @param val - The target object to check.
 * @param key - The property name to check for.
 * @returns {boolean} True if the object has the property, false otherwise.
 */
export const hasOwn = (val: object, key: string | symbol): key is keyof typeof val =>
  hasOwnProperty.call(val, key);
/**
 * Forces a value to be an array.
 *
 * @param data - The data to convert, can be a single element or an array.
 * @returns The resulting array.
 */
export function coerceArray<T>(data: T | T[]): T[] {
  return isArray(data) ? data : [data];
}

/**
 * Checks if a value has changed.
 *
 * @param value - The new value.
 * @param oldValue - The old value.
 * @returns {boolean} True if the value has changed, false otherwise.
 */
export const hasChanged = (value: unknown, oldValue: unknown): boolean =>
  !Object.is(value, oldValue);

/**
 * Empty function, used for defaults and placeholders
 * @type {Function}
 */
export const noop = Function.prototype as () => void;

export function generateUniqueId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

/**
 * Creates a cached version of a string processing function.
 *
 * @param fn - The string processing function to cache.
 * @returns The cached function.
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
 * Checks if a property name is an event handler.
 *
 * @param key - The property name to check.
 * @returns {boolean} True if the property is an event handler, false otherwise.
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
 * @returns {unknown} - The global object for the current environment
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
