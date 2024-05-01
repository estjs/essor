export const _toString = Object.prototype.toString;
export const extend = Object.assign;
const hasOwnProperty = Object.prototype.hasOwnProperty;
export const hasOwn = (val: object, key: string | symbol): key is keyof typeof val =>
  hasOwnProperty.call(val, key);

export function coerceArray<T>(data: T | T[]): T[] {
  return Array.isArray(data) ? (data.flat() as T[]) : [data];
}
export function hasChanged(value, oldValue) {
  return !Object.is(value, oldValue);
}
export const noop = Function.prototype as () => void;
