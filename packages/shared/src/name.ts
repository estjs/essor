export const kebabCase = (string: string): string => {
  return string.replaceAll(/[A-Z]+/g, (match, offset) => {
    return `${offset > 0 ? '-' : ''}${match.toLocaleLowerCase()}`;
  });
};

export const camelCase = (str: string): string => {
  const s = str.replaceAll(/[\s_-]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''));
  return s[0].toLowerCase() + s.slice(1);
};
/**
 * Capitalizes the first letter of a string.
 *
 * @param {string} inputString - The input string to capitalize the first letter.
 * @return {string} The string with the first letter capitalized.
 */
export const capitalizeFirstLetter = (inputString: string): string => {
  return inputString.charAt(0).toUpperCase() + inputString.slice(1);
};
