import { cacheStringFunction } from './base';

/**
 * Regular expression for converting camelCase to kebab-case
 * @type {RegExp}
 */
const hyphenateRE = /\B([A-Z])/g;

/**
 * Converts a camelCase string to kebab-case
 * Example: myFunction -> my-function
 * @param {string} str - The camelCase string to convert
 * @returns {string} - The kebab-case string
 */
export const kebabCase: (str: string) => string = cacheStringFunction((str: string) =>
  str.replace(hyphenateRE, '-$1').toLowerCase(),
);

/**
 * Regular expression for converting kebab-case or snake_case to camelCase
 * @type {RegExp}
 */
const camelizeRE = /[_-](\w)/g;

/**
 * Converts a kebab-case or snake_case string to camelCase
 * Example: my-function or my_function -> myFunction
 * @param {string} str - The kebab-case or snake_case string to convert
 * @returns {string} - The camelCase string
 */
export const camelCase: (str: string) => string = cacheStringFunction((str: string): string => {
  // Remove leading and trailing hyphens or underscores
  str = str.replace(/^[_-]+|[_-]+$/g, '');
  // Replace consecutive hyphens or underscores with a single hyphen
  str = str.replace(/[_-]+/g, '-');
  // Convert to camelCase
  return str.replace(camelizeRE, (_, c) => c.toUpperCase());
});

/**
 * Capitalizes the first letter of a string
 * Example: hello -> Hello
 * @template T - The input string type
 * @param {T} str - The string to capitalize
 * @returns {Capitalize<T>} - The capitalized string
 */
export const capitalize: <T extends string>(str: T) => Capitalize<T> = cacheStringFunction(
  <T extends string>(str: T) => {
    return (str.charAt(0).toUpperCase() + str.slice(1)) as Capitalize<T>;
  },
);
