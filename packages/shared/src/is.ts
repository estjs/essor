import { _toString } from './base';

/**
 * Checks if a value is an object
 * @param {unknown} val - The value to check
 * @returns {boolean} - Returns true if the value is an object, false otherwise
 */
export const isObject = (val: unknown): val is Record<any, unknown> =>
  val !== null && typeof val === 'object';

/**
 * Checks if a value is a Promise
 * @template T - The type of the Promise's resolved value
 * @param {unknown} val - The value to check
 * @returns {boolean} - Returns true if the value is a Promise, false otherwise
 */
export function isPromise<T = unknown>(val: unknown): val is Promise<T> {
  return _toString.call(val) === '[object Promise]';
}

/**
 * Checks if a value is an Array
 * @type {(arg: unknown ) => arg is unknown []}
 */
export const isArray = Array.isArray;

/**
 * Checks if a value is a string
 * @param {unknown} val - The value to check
 * @returns {boolean} - Returns true if the value is a string, false otherwise
 */
export function isString(val: unknown): val is string {
  return typeof val === 'string';
}

/**
 * Checks if a value is a number
 * @param {unknown} val - The value to check
 * @returns {boolean} - Returns true if the value is a number, false otherwise
 */
export function isNumber(val: unknown): val is number {
  return typeof val === 'number';
}
/**
 * Checks if a value is null
 * @param {unknown} val - The value to check
 * @returns {boolean} - Returns true if the value is null, false otherwise
 */
export function isNull(val: unknown): val is null {
  return val === null;
}

/**
 * Checks if a value is a Symbol
 * @param {unknown} val - The value to check
 * @returns {boolean} - Returns true if the value is a Symbol, false otherwise
 */
export function isSymbol(val: unknown): val is symbol {
  return typeof val === 'symbol';
}

/**
 * Checks if a value is a Set
 * @param {unknown} val - The value to check
 * @returns {boolean} - Returns true if the value is a Set, false otherwise
 */
export function isSet(val: unknown): val is Set<unknown> {
  return _toString.call(val) === '[object Set]';
}

/**
 * Checks if a value is a WeakMap
 * @param {unknown} val - The value to check
 * @returns {boolean} - Returns true if the value is a WeakMap, false otherwise
 */
export function isWeakMap(val: unknown): val is WeakMap<any, unknown> {
  return _toString.call(val) === '[object WeakMap]';
}

/**
 * Checks if a value is a WeakSet
 * @param {unknown} val - The value to check
 * @returns {boolean} - Returns true if the value is a WeakSet, false otherwise
 */
export function isWeakSet(val: unknown): val is WeakSet<any> {
  return _toString.call(val) === '[object WeakSet]';
}

/**
 * Checks if a value is a Map
 * @param {unknown} val - The value to check
 * @returns {boolean} - Returns true if the value is a Map, false otherwise
 */
export function isMap(val: unknown): val is Map<unknown, unknown> {
  return _toString.call(val) === '[object Map]';
}

/**
 * Checks if a value is null or undefined
 * @param {unknown} val - The value to check
 * @returns {boolean} - Returns true if the value is null or undefined, false otherwise
 */
export function isNil(val: unknown): val is null | undefined {
  return val === null || val === undefined;
}

/**
 * Checks if a value is a function
 * @param {unknown} val - The value to check
 * @returns {boolean} - Returns true if the value is a function, false otherwise
 */
export const isFunction = (val: unknown): val is Function => typeof val === 'function';

/**
 * Checks if a value is falsy (false, null, or undefined)
 * @param {unknown} val - The value to check
 * @returns {boolean} - Returns true if the value is falsy, false otherwise
 */
export function isFalsy(val: unknown): val is false | null | undefined {
  return val === false || val === null || val === undefined;
}

/**
 * Checks if a value is a primitive type (string, number, boolean, symbol, null, or undefined)
 * @param {unknown} val - The value to check
 * @returns {boolean} - Returns true if the value is a primitive type, false otherwise
 */
export const isPrimitive = (
  val: unknown,
): val is string | number | boolean | symbol | null | undefined =>
  ['string', 'number', 'boolean', 'symbol', 'undefined'].includes(typeof val) || isNull(val);

/**
 * Checks if a value is an HTMLElement
 * @param {unknown} val - The value to check
 * @returns {boolean} - Returns true if the value is an HTMLElement, false otherwise
 */
export function isHTMLElement(val: unknown): val is HTMLElement {
  return val instanceof HTMLElement;
}

/**
 * Checks if a value is a plain object (created using Object constructor)
 * @param {unknown} val - The value to check
 * @returns {boolean} - Returns true if the value is a plain object, false otherwise
 */
export const isPlainObject = (val: unknown): val is object =>
  _toString.call(val) === '[object Object]';

/**
 * String representation of a number
 * @typedef {`${number}`} StringNumber
 */
export type StringNumber = `${number}`;

/**
 * Checks if a value is a string representation of a number
 * @param {unknown} val - The value to check
 * @returns {boolean} - Returns true if the value is a string number, false otherwise
 */
export function isStringNumber(val: unknown): val is StringNumber {
  if (!isString(val) || val === '') {
    return false;
  }
  return !Number.isNaN(Number(val));
}

/**
 * Checks if a value is a HTML node
 * @param {unknown} val - The value to check
 * @returns {boolean} - Returns true if the value is a HTML node, false otherwise
 */
export function isHTMLNode(val: unknown): val is HTMLElement {
  return val instanceof HTMLElement;
}

/**
 * Checks if a value is undefined
 * @param {unknown} val - The value to check
 * @returns {boolean} - Returns true if the value is undefined, false otherwise
 */
export function isUndefined(val: unknown): val is undefined {
  return typeof val === 'undefined';
}

/**
 * Checks if a value is a boolean
 * @param {unknown} val - The value to check
 * @returns {boolean} - Returns true if the value is a boolean, false otherwise
 */
export function isBoolean(val: unknown): val is boolean {
  return typeof val === 'boolean';
}
