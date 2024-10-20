import { cacheStringFunction } from './comm';

const hyphenateRE = /\B([A-Z])/g;
export const kebabCase: (str: string) => string = cacheStringFunction((str: string) =>
  str.replaceAll(hyphenateRE, '-$1').toLowerCase(),
);

const camelizeRE = /-(\w)/g;
export const camelCase: (str: string) => string = cacheStringFunction((str: string): string => {
  return str.replaceAll(camelizeRE, (_, c) => (c ? c.toUpperCase() : ''));
});
/**
 * Capitalizes the first letter of a string.
 *
 * @param {string} inputString - The input string to capitalize the first letter.
 * @return {string} The string with the first letter capitalized.
 */
export const capitalize: <T extends string>(str: T) => Capitalize<T> = cacheStringFunction(
  <T extends string>(str: T) => {
    return (str.charAt(0).toUpperCase() + str.slice(1)) as Capitalize<T>;
  },
);
