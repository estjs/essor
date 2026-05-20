import { cacheStringFunction } from './base';
import { isString } from './is';

/**
 * Regular expression for converting camelCase to kebab-case
 * @type {RegExp}
 */
const hyphenateRE = /\B([A-Z])/g;

/**
 * Converts a camelCase string to kebab-case.
 *
 * @param str - The camelCase string to convert.
 * @returns {string} The kebab-case string.
 *
 * @example
 * ```typescript
 * kebabCase('myFunction') // 'my-function'
 * ```
 */
export const kebabCase: (str: string) => string = cacheStringFunction((str: string) =>
  str.replaceAll(hyphenateRE, '-$1').toLowerCase(),
);

/**
 * Regular expression for converting kebab-case or snake_case to camelCase
 * @type {RegExp}
 */
const camelizeRE = /[_-](\w)/g;

/**
 * Converts a kebab-case or snake_case string to camelCase.
 *
 * @param str - The kebab-case or snake_case string to convert.
 * @returns {string} The camelCase string.
 *
 * @example
 * ```typescript
 * camelCase('my-function') // 'myFunction'
 * camelCase('my_function') // 'myFunction'
 * ```
 */
export const camelCase: (str: string) => string = cacheStringFunction((str: string): string => {
  // Remove leading and trailing hyphens or underscores
  str = str.replaceAll(/^[_-]+|[_-]+$/g, '');
  // Replace consecutive hyphens or underscores with a single hyphen
  str = str.replaceAll(/[_-]+/g, '-');
  // Convert to camelCase
  return str.replaceAll(camelizeRE, (_, c) => c.toUpperCase());
});

/**
 * Capitalizes the first letter of a string.
 *
 * @template T - The input string type.
 * @param str - The string to capitalize.
 * @returns {Capitalize<T>} The capitalized string.
 *
 * @example
 * ```typescript
 * capitalize('hello') // 'Hello'
 * ```
 */
export const capitalize: <T extends string>(str: T) => Capitalize<T> = cacheStringFunction(
  <T extends string>(str: T) => {
    return (str.charAt(0).toUpperCase() + str.slice(1)) as Capitalize<T>;
  },
);
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
