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
