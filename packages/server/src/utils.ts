import { isArray, isFunction, isNil, isString } from '@estjs/shared';

/**
 * Convert content to string for SSR output
 *
 * @param content - the content to convert
 * @param isSvg - whether the content is SVG
 * @returns the content as a string
 */
export function convertToString(content: unknown, isSvg = false): string {
  if (isNil(content)) {
    return '';
  }

  if (isString(content)) {
    return content;
  }

  if (isArray(content)) {
    return (content as unknown[]).map((item: unknown) => convertToString(item, isSvg)).join('');
  }

  if (isFunction(content)) {
    return convertToString((content as () => unknown)(), isSvg);
  }

  return String(content);
}

/** Regex to match the root element */
const ROOT_ELEMENT_REGEX = /^<([a-z]+)(\s*)([^>]*)>/i;
/** Regex to match data-idx attributes */
const INDEX_ATTRIBUTE_REGEX = /data-idx="(\d+)"/g;
/** Regex to match HTML comments */
const COMMENT_REGEX = /<!--(.*?)-->/g;

/**
 * Add hydration attributes to HTML content
 *
 * @param htmlContent - the html content
 * @param hydrationId - the hydration id
 * @returns the html content with hydration attributes
 */
export function addAttributes(htmlContent: string, hydrationId: string): string {
  return htmlContent
    .replace(ROOT_ELEMENT_REGEX, `<$1$2$3 data-hk="${hydrationId}">`)
    .replaceAll(INDEX_ATTRIBUTE_REGEX, `data-idx="${hydrationId}-$1"`)
    .replaceAll(COMMENT_REGEX, `<!--${hydrationId}-$1-->`);
}
