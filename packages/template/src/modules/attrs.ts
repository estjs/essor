import { includeBooleanAttr, isSpecialBooleanAttr, isSymbol } from '@estjs/shared';

/**
 * XML namespace for xlink attributes
 * @internal
 */
export const xlinkNS = 'http://www.w3.org/1999/xlink';

/**
 * Type definition for attribute values
 * @public
 */
export type AttrValue = string | boolean | number | null | undefined;

/**
 * Cache for boolean attributes to avoid repeated lookups
 * @internal
 */
const booleanAttrsCache = new Set([
  'disabled',
  'checked',
  'required',
  'readonly',
  'hidden',
  'open',
  'selected',
  'autofocus',
  'itemscope',
  'multiple',
  'novalidate',
  'allowfullscreen',
  'async',
  'compact',
  'declare',
  'default',
  'defer',
  'formnovalidate',
  'ismap',
  'loop',
  'reversed',
  'scoped',
  'seamless',
  'typemustmatch',
]);

/**
 * Creates an attribute patching function for a specific element
 * Optimized to minimize DOM operations
 *
 * @param el - The element to patch attributes on
 * @param key - The attribute name
 * @param isSVG - Whether the element is an SVG element
 * @returns A function that applies attribute changes
 * @public
 */
export function patchAttr(el: Element, key: string, isSVG?: boolean) {
  // Cache attribute type for better performance
  const isBoolean = isSpecialBooleanAttr(key);
  const isXlink = isSVG && key.startsWith('xlink:');

  // Cache previous value for faster diffing
  let prevValue: any = null;

  /**
   * Applies attribute changes to the element
   *
   * @param value - New attribute value
   */
  return (value: AttrValue): void => {
    // Skip update if value hasn't changed
    if (value === prevValue) {
      return;
    }

    // Update cached value
    prevValue = value;

    // Handle xlink attributes (for SVG)
    if (isXlink) {
      if (value == null) {
        el.removeAttributeNS(xlinkNS, key.slice(6));
      } else {
        el.setAttributeNS(xlinkNS, key, String(value));
      }
      return;
    }

    // Handle boolean attributes
    if (isBoolean) {
      if (value == null || !includeBooleanAttr(value)) {
        el.removeAttribute(key);
      } else {
        el.setAttribute(key, '');
      }
      return;
    }

    // Handle regular attributes
    if (value == null) {
      el.removeAttribute(key);
    } else {
      // Convert value to string
      const attrValue = isSymbol(value) ? String(value) : value;
      el.setAttribute(key, String(attrValue));
    }
  };
}

/**
 * Checks if an attribute is a boolean attribute
 * Uses a cache for better performance
 *
 * @param name - The attribute name
 * @returns Whether the attribute is a boolean attribute
 * @public
 */
export function isBooleanAttr(name: string): boolean {
  return booleanAttrsCache.has(name);
}

/**
 * Sets an attribute on an element
 * Direct method for one-time attribute setting
 *
 * @param el - The element to set the attribute on
 * @param key - The attribute name
 * @param value - The attribute value
 * @param isSVG - Whether the element is an SVG element
 * @public
 */
export function setAttribute(el: Element, key: string, value: AttrValue, isSVG?: boolean): void {
  patchAttr(el, key, isSVG)(value);
}
