import { camelCase, capitalize, isArray, isString, kebabCase, warn } from '@estjs/shared';

/**
 * Symbol for storing CSS variable text in style objects
 * @internal
 */
export const CSS_VAR_TEXT: unique symbol = Symbol(__DEV__ ? 'CSS_VAR_TEXT' : '');

/**
 * Type definition for style values
 * @public
 */
export type Style = string | Record<string, string | string[]> | null;

/**
 * Regular expressions for style validation and processing
 * @internal
 */
const semicolonRE = /[^\\];\s*$/;
const importantRE = /\s*!important$/;

/**
 * Browser vendor prefixes for CSS properties
 * @internal
 */
const VENDOR_PREFIXES = ['Webkit', 'Moz', 'ms'];

/**
 * Cache for prefixed CSS property names to avoid repeated lookups
 * @internal
 */
const prefixCache: Record<string, string> = Object.create(null);

/**
 * Creates a style patching function for a specific element
 * Optimized to minimize DOM operations and memory usage
 *
 * @param el - The element to patch styles on
 * @returns A function that applies style changes
 * @public
 */
export function patchStyle(el: Element) {
  // Cache the style object for better performance
  const style = (el as HTMLElement).style;

  /**
   * Applies style changes to the element
   *
   * @param next - New style value
   * @param prev - Previous style value (for diffing)
   */
  return (next: Style, prev?: Style): void => {
    // Fast path: no style changes
    if (next === prev) {
      return;
    }

    const isCssString = isString(next);

    // Handle object-based styles
    if (next && !isCssString) {
      // Remove styles that are no longer present
      if (prev) {
        if (!isString(prev)) {
          // Fast path: both are objects, remove keys not in next
          for (const key in prev) {
            if (next[key] == null) {
              setStyle(style, key, '');
            }
          }
        } else {
          // Convert string prev to object and diff
          for (const prevStyle of prev.split(';')) {
            const colonIdx = prevStyle.indexOf(':');
            if (colonIdx > 0) {
              const key = prevStyle.slice(0, colonIdx).trim();
              if (next[key] == null) {
                setStyle(style, key, '');
              }
            }
          }
        }
      }

      // Apply new styles
      for (const key in next) {
        setStyle(style, key, next[key]);
      }
    } else {
      // Handle string-based styles
      if (isCssString) {
        if (prev !== next) {
          // Preserve CSS variables
          const cssVarText = (style as any)[CSS_VAR_TEXT];
          if (cssVarText) {
            (next as string) += `;${cssVarText}`;
          }
          style.cssText = next as string;
        }
      } else if (prev) {
        // Remove all styles
        el.removeAttribute('style');
      }
    }
  };
}

/**
 * Sets a single style property on an element
 * Handles vendor prefixing and special cases
 *
 * @param style - The CSSStyleDeclaration object
 * @param name - The style property name
 * @param val - The style property value
 * @public
 */
export function setStyle(style: CSSStyleDeclaration, name: string, val: string | string[]): void {
  // Handle array values (multiple values for same property)
  if (isArray(val)) {
    val.forEach(v => setStyle(style, name, v));
    return;
  }

  // Normalize null/undefined to empty string
  if (val == null) {
    val = '';
  }

  // Development mode validation
  if (__DEV__ && semicolonRE.test(val)) {
    warn(`Unexpected semicolon at the end of '${name}' style value: '${val}'`);
  }

  // Handle CSS custom properties (variables)
  if (name.startsWith('--')) {
    style.setProperty(name, val);
    return;
  }

  // Handle regular CSS properties with vendor prefixing
  const prefixed = autoPrefix(style, name);

  // Handle !important
  if (importantRE.test(val)) {
    style.setProperty(kebabCase(prefixed), val.replace(importantRE, ''), 'important');
  } else {
    style[prefixed as any] = val;
  }
}

/**
 * Automatically adds vendor prefixes to CSS properties when needed
 * Uses a cache for better performance
 *
 * @param style - The CSSStyleDeclaration object
 * @param rawName - The unprefixed property name
 * @returns The prefixed property name if needed
 * @internal
 */
function autoPrefix(style: CSSStyleDeclaration, rawName: string): string {
  // Check cache first
  const cached = prefixCache[rawName];
  if (cached) {
    return cached;
  }

  // Convert to camelCase
  let name = camelCase(rawName);

  // Check if the property exists without a prefix
  if (name !== 'filter' && name in style) {
    return (prefixCache[rawName] = name);
  }

  // Try with vendor prefixes
  name = capitalize(name);
  for (const prefix of VENDOR_PREFIXES) {
    const prefixed = prefix + name;
    if (prefixed in style) {
      return (prefixCache[rawName] = prefixed);
    }
  }

  // No prefix needed or available
  return rawName;
}
