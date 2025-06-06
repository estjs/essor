import { isArray, isObject } from '@estjs/shared';

/**
 * Type definition for class values
 * @public
 */
export type ClassValue = string | Record<string, boolean> | ClassValue[] | null | undefined;

/**
 * Patches the class attribute of an element
 * Optimized to minimize DOM operations
 *
 * @param el - The element to patch classes on
 * @param prev - Previous class value for diffing
 * @param next - New class value to apply
 * @param isSVG - Whether the element is an SVG element
 * @public
 */
export function patchClass(el: Element, isSVG?: boolean) {
  return (prev: unknown, next: unknown) => {
    const normalizedNext = normalizeClass(next);
    const normalizedPrev = normalizeClass(prev);
    // Skip DOM update if classes haven't changed
    if (normalizedPrev === normalizedNext) {
      return;
    }

    // Apply classes based on element type
    if (!normalizedNext) {
      el.removeAttribute('class');
    } else if (isSVG) {
      el.setAttribute('class', normalizedNext);
    } else {
      el.className = normalizedNext;
    }
  };
}

/**
 * Normalizes different class value formats into a single string
 * Optimized for common cases
 *
 * @param value - The class value to normalize
 * @returns A normalized class string
 * @public
 */
export function normalizeClass(value: unknown): string {
  // Fast path: empty values
  if (value == null) {
    return '';
  }

  // Fast path: string values (most common case)
  if (typeof value === 'string') {
    return value.trim();
  }

  // Handle arrays
  if (isArray(value)) {
    return value.map(normalizeClass).filter(Boolean).join(' ');
  }

  // Handle objects (conditional classes)
  if (isObject(value)) {
    const result: string[] = [];

    for (const key in value) {
      if (value[key]) {
        result.push(key);
      }
    }

    return result.join(' ');
  }

  // Convert other types to string
  return String(value).trim();
}
