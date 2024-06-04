import { _toString } from './comm';

export const isObject = (val: unknown): val is Record<any, any> =>
  val !== null && typeof val === 'object';
export function isPromise(val: any): boolean {
  return _toString.call(val) === '[object Promise]';
}

export const isArray = Array.isArray;

export function isString(val: unknown): val is string {
  return typeof val === 'string';
}
export function isNull(val: any): val is null {
  return val === null;
}
export function isSymbol(val: unknown): val is symbol {
  return typeof val === 'symbol';
}
export function isMap(val: unknown): val is Map<any, any> {
  return _toString.call(val) === '[object Map]';
}
export function isNil(x: any): x is null | undefined {
  return x === null || x === undefined;
}

export const isFunction = (val: unknown): val is Function => typeof val === 'function';

export function isFalsy(x: any): x is false | null | undefined {
  return x === false || x === null || x === undefined || x === '';
}

export const isPrimitive = (
  val: unknown,
): val is string | number | boolean | symbol | null | undefined =>
  ['string', 'number', 'boolean', 'symbol', 'undefined'].includes(typeof val) || isNull(val);
