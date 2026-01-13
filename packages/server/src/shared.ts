/**
 * Server-side utility functions
 */

import { isArray, isFunction, isNil, isString } from '@estjs/shared';

/**
 * Hydration state management - isomorphic code shared between client and server
 */

/** Hydration identifier counter, used to generate unique IDs */
let hydrationCounter = 0;

/**
 * Get the hydration key
 * @returns {string} the hydration key
 */
export function getHydrationKey(): string {
  return `${hydrationCounter++}`;
}

/**
 * Reset the hydration key counter
 */
export function resetHydrationKey(): void {
  hydrationCounter = 0;
}

/**
 * Convert content to string for SSR output
 * @param content - the content to convert
 * @param isSvg - whether the content is SVG
 * @returns the content as a string
 */
export function convertToString(content: unknown, isSvg = false): string {
  // if result is null or undefined, return empty string
  if (isNil(content)) {
    return '';
  }

  // if result is a string, return result
  if (isString(content)) {
    return content as string;
  }

  // if result is an array, return the result of the array
  if (isArray(content)) {
    return (content as unknown[]).map((item: unknown) => convertToString(item, isSvg)).join('');
  }

  // if result is a function, return the result of the function
  if (isFunction(content)) {
    return convertToString((content as () => unknown)(), isSvg);
  }

  // if result is other type, return the result of the string
  return String(content);
}

/**
 * Add hydration attributes to HTML content
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
