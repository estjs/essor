import { camelCase, capitalize, isArray, isObject, isString } from '@estjs/shared';
import { isHydrating } from '../hydration/shared';

/**
 * Symbol for storing CSS variable text in style objects
 * @internal
 */
export const CSS_VAR_TEXT: unique symbol = Symbol('CSS_VAR_TEXT');

// Cache regex patterns for better performance
const importantRE = /\s*!important$/;

// Cache browser prefixes for better performance
const prefixes = ['Webkit', 'Moz', 'ms'];
const prefixCache: Record<string, string> = {};

/**
 * Type definition for style values
 * @public
 */
export type Style = string | Record<string, string | string[]> | null | undefined;

/**
 * Patches the style of an element, optimized for different style formats
 * Supports silent hydration (skips DOM updates during hydration phase)
 *
 * @param el - The element to patch styles on
 * @public
 */
export function patchStyle(el: HTMLElement, prev: unknown, next: unknown) {
  const style = el.style;
  const isCssString = isString(next);
  if (isHydrating()) {
    return;
  }
  if (next && isCssString) {
    if (prev !== next) {
      style.cssText = next;
    }
    return;
  }

  if (!next) {
    if (prev) {
      el.removeAttribute('style');
    }
    return;
  }

  // Handle object-based styles
  if (prev && !isString(prev)) {
    // Remove styles that are no longer present
    for (const key in prev) {
      if (!next || next[key as keyof typeof next] == null) {
        setStyle(style, key, '');
      }
    }
  } else if (prev && isString(prev)) {
    // Handle previous string-based styles
    const prevStyles = prev.split(';');
    for (const stylePart of prevStyles) {
      const colonIndex = stylePart.indexOf(':');
      if (colonIndex > 0) {
        const key = stylePart.slice(0, colonIndex).trim();
        if (next && isObject(next) && next[key] == null) {
          setStyle(style, key, '');
        }
      }
    }
  }

  // Set new styles
  if (next && !isString(next)) {
    for (const key in next) {
      const value = next[key];
      if ((!prev || isString(prev) || prev[key] !== value) && value != null) {
        setStyle(style, key, value);
      }
    }
  }
}

/**
 * Sets an individual style property with various optimizations
 *
 * @param style - The style object to modify
 * @param name - The style property name
 * @param val - The style property value
 * @private
 */
export function setStyle(style: CSSStyleDeclaration, name: string, val: string | string[]): void {
  // Handle array values (vendor prefixed values)
  if (isArray(val)) {
    for (const element of val) {
      setStyle(style, name, element);
    }
    return;
  }

  if (val == null || val === '') {
    val = '';
  }

  // Handle CSS custom properties
  if (name.startsWith('--')) {
    style.setProperty(name, val);
    return;
  }

  // Handle regular CSS properties with potential prefixing
  const prefixed = autoPrefix(style, name);

  // Handle !important
  if (typeof val === 'string' && importantRE.test(val)) {
    style.setProperty(camelCase(prefixed), val.replace(importantRE, ''), 'important');
  } else {
    style[prefixed] = val;
  }
}

/**
 * Adds vendor prefixes to style properties as needed
 *
 * @param style - The style object to check against
 * @param rawName - The raw property name
 * @returns The prefixed property name if needed
 * @private
 */
function autoPrefix(style: CSSStyleDeclaration, rawName: string): string {
  // Check cache first
  const cached = prefixCache[rawName];
  if (cached) {
    return cached;
  }

  // Try camelCase version directly
  let name = camelCase(rawName);
  if (name !== 'filter' && name in style) {
    return (prefixCache[rawName] = name);
  }

  // Try with vendor prefixes
  name = capitalize(name);
  for (const prefix of prefixes) {
    const prefixed = prefix + name;
    if (prefixed in style) {
      return (prefixCache[rawName] = prefixed);
    }
  }

  return rawName;
}
