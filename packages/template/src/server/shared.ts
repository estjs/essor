import { isArray, isFunction, isNil, isString } from '@estjs/shared';

/** Hydration identifier counter, used to generate unique IDs */
let hydrationCounter = 0;

/**
 * get the hydration key
 * @returns {string} the hydration key
 */
export function getHydrationKey(): string {
  return `${hydrationCounter++}`;
}

/**
 * reset the hydration key
 */
export function resetHydrationKey(): void {
  hydrationCounter = 0;
}

let isHydrationActive = false;

/**
 * start the hydration
 */
export function startHydration(): void {
  isHydrationActive = true;
}

/**
 * end the hydration
 */
export function endHydration(): void {
  isHydrationActive = false;
}

/**
 * check if the hydration is active
 * @returns {boolean} true if the hydration is active, false otherwise
 */
export function isHydrating(): boolean {
  return isHydrationActive;
}

/**
 * convert the content to string
 * @param {unknown} content - the content to convert
 * @param {boolean} isSvg - whether the content is SVG
 * @returns {string} the content as a string
 */
export function convertToString(content: unknown, isSvg = false): string {
  // if result is null or undefined, return html
  if (isNil(content)) {
    return '';
  }

  // if result is a string, return result
  if (isString(content)) {
    return content;
  }

  // if result is an array, return the result of the array
  if (isArray(content)) {
    return content.map(item => convertToString(item, isSvg)).join('');
  }

  // if result is a function, return the result of the function
  if (isFunction(content)) {
    return convertToString(content(), isSvg);
  }

  // if result is other type, return the result of the string
  return String(content);
}

/**
 * add attributes to the html content
 * @param {string} htmlContent - the html content
 * @param {string} hydrationId - the hydration id
 * @returns {string} the html content with attributes
 */
export function addAttributes(htmlContent: string, hydrationId: string): string {
  // match the root element regex
  const rootElementRegex = /^<([a-z]+)(\s*)([^>]*)>/i;
  // match the index attribute regex
  const indexAttributeRegex = /data-idx="(\d+)"/g;
  const commentRegex = /<!--(.*?)-->/g;

  // handle the html:
  // 1. add the hydration id to the root element
  // 2. add the hydration id prefix to all the index attributes
  const enhancedHtml = htmlContent
    .replace(rootElementRegex, `<$1$2$3 data-hk="${hydrationId}">`)
    .replaceAll(indexAttributeRegex, `data-idx="${hydrationId}-$1"`)
    .replaceAll(commentRegex, `<!--${hydrationId}-$1-->`);

  return enhancedHtml;
}
