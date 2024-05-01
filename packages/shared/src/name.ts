export const kebabCase = (string: string): string => {
  return string.replaceAll(/[A-Z]+/g, (match, offset) => {
    return `${offset > 0 ? '-' : ''}${match.toLocaleLowerCase()}`;
  });
};

export const camelCase = (str: string): string => {
  const s = str.replaceAll(/[\s_-]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''));
  return s[0].toLowerCase() + s.slice(1);
};
