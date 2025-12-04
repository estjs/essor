/**
 * Regular expression for matching HTML special characters
 * @type {RegExp}
 */
const escapeRE = /["&'<>]/;

/**
 * Escapes HTML special characters in a string to their corresponding entity references
 * @param {unknown} string - The string to escapeHTML
 * @returns {string} - The escaped string
 */
export function escapeHTML(string: unknown): string {
  const str = `${string}`;
  const match = escapeRE.exec(str);

  if (!match) {
    return str;
  }

  let html = '';
  let escaped: string;
  let index: number;
  let lastIndex = 0;
  for (index = match.index; index < str.length; index++) {
    switch (str.charCodeAt(index)) {
      case 34: // "
        escaped = '&quot;';
        break;
      case 38: // &
        escaped = '&amp;';
        break;
      case 39: // '
        escaped = '&#39;';
        break;
      case 60: // <
        escaped = '&lt;';
        break;
      case 62: // >
        escaped = '&gt;';
        break;
      default:
        continue;
    }

    if (lastIndex !== index) {
      html += str.slice(lastIndex, index);
    }

    lastIndex = index + 1;
    html += escaped;
  }

  return lastIndex !== index ? html + str.slice(lastIndex, index) : html;
}

/**
 * Regular expression for stripping HTML comment markers
 * Reference: https://www.w3.org/TR/html52/syntax.html#comments
 * @type {RegExp}
 */
const commentStripRE = /^-?>|<!--|-->|--!>|<!-$/g;

/**
 * Strips special characters from HTML comments
 * @param {string} src - The source string
 * @returns {string} - The cleaned string
 */
export function escapeHTMLComment(src: string): string {
  return src.replaceAll(commentStripRE, '');
}

/**
 * Regular expression for matching special characters in CSS variable names
 * @type {RegExp}
 */
export const cssVarNameEscapeSymbolsRE = /[ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~]/g;

/**
 * Escapes special characters in CSS variable names
 * @param {string} key - The CSS variable name
 * @param {boolean} doubleEscape - Whether to apply double escaping
 * @returns {string} - The escaped CSS variable name
 */
export function getEscapedCssVarName(key: string, doubleEscape: boolean): string {
  return key.replaceAll(cssVarNameEscapeSymbolsRE, s =>
    doubleEscape ? (s === '"' ? '\\\\\\"' : `\\\\${s}`) : `\\${s}`,
  );
}
