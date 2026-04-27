import { camelCase, capitalize, isArray, isObject, isString } from '@estjs/shared';

/**
 * Internal symbol used to mark raw CSS variable text in style objects.
 * @internal
 */
export const CSS_VAR_TEXT: unique symbol = Symbol('CSS_VAR_TEXT');

// Precompile the `!important` detector to avoid recreating it on every write.
const importantRE = /\s*!important$/;

// Candidate vendor prefixes and their lookup cache.
const prefixes = ['Webkit', 'Moz', 'ms'];
const prefixCache: Record<string, string> = {};

/**
 * Supported value types for the style patch layer.
 */
export type Style = string | Record<string, string | string[]> | null | undefined;

/**
 * Applies a minimal style update to an element.
 *
 * Supports both string-based and object-based styles, while staying silent
 * during hydration so the server-rendered DOM can be reused.
 *
 * @param el - The element to patch.
 * @param prev - Previous style value.
 * @param next - Next style value.
 * @returns {void}
 */
export function patchStyle(el: HTMLElement, prev: unknown, next?: unknown) {
  const style = el.style;

  if (next && isString(next)) {
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

  // When the previous value is an object, remove keys that disappeared in the next value.
  if (prev && !isString(prev)) {
    const prevObj = prev as Record<string, unknown>;
    for (const key in prevObj) {
      if (!next || (next as Record<string, unknown>)[key] == null) {
        setStyle(style, key, '');
      }
    }
  } else if (prev && isString(prev)) {
    // When the previous value is a string, approximate its keys and remove missing ones.
    const prevStyles = prev.split(';');
    for (const stylePart of prevStyles) {
      const colonIndex = stylePart.indexOf(':');
      if (colonIndex > 0) {
        const key = stylePart.slice(0, colonIndex).trim();
        if (next && isObject(next) && (next as Record<string, unknown>)[key] == null) {
          setStyle(style, key, '');
        }
      }
    }
  }

  // Apply the next style values last.
  if (next && !isString(next)) {
    const nextObj = next as Record<string, unknown>;
    for (const key in nextObj) {
      const value = nextObj[key];
      if (
        (!prev || isString(prev) || (prev as Record<string, unknown>)[key] !== value) &&
        value != null
      ) {
        setStyle(style, key, value as string | string[]);
      }
    }
  }
}

/**
 * Sets a single style property.
 *
 * Centralizes array-value expansion, CSS variable writes, vendor-prefix
 * resolution, and `!important` handling in one place.
 *
 * @param style - Target style object.
 * @param name - Style property name.
 * @param val - Style value.
 * @private
 */
export function setStyle(style: CSSStyleDeclaration, name: string, val: string | string[]): void {
  // Array values represent multiple candidates for the same property.
  if (isArray(val)) {
    for (const element of val) {
      setStyle(style, name, element);
    }
    return;
  }

  if (val == null || val === '') {
    val = '';
  }

  // CSS variables must be written through `setProperty()`.
  if (name.startsWith('--')) {
    style.setProperty(name, val);
    return;
  }

  // Regular properties try vendor prefix resolution first.
  const prefixed = autoPrefix(style, name);

  // `!important` cannot use direct property assignment and must go through `setProperty()`.
  if (isString(val) && importantRE.test(val)) {
    style.setProperty(camelCase(prefixed), val.replace(importantRE, ''), 'important');
  } else {
    style[prefixed] = val;
  }
}

/**
 * Resolves the correct vendor-prefixed style property name.
 *
 * Results are cached in `prefixCache` to avoid repeated hot-path detection.
 *
 * @param style - Target style object.
 * @param rawName - Original property name.
 * @returns The property name that can be written to `style` directly.
 * @private
 */
function autoPrefix(style: CSSStyleDeclaration, rawName: string): string {
  // Check the cache first.
  const cached = prefixCache[rawName];
  if (cached) {
    return cached;
  }

  // Try the standard camelCase property first.
  let name = camelCase(rawName);
  if (name !== 'filter' && name in style) {
    return (prefixCache[rawName] = name);
  }

  // If the standard property does not exist, try vendor-prefixed variants.
  name = capitalize(name);
  for (const prefix of prefixes) {
    const prefixed = prefix + name;
    if (prefixed in style) {
      return (prefixCache[rawName] = prefixed);
    }
  }

  return rawName;
}
