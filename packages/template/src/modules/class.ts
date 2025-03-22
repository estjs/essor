import { isArray, isObject } from '@estjs/shared';

/**
 * Type definition for class values
 * @public
 */
export type ClassValue = string | Record<string, boolean> | ClassValue[] | null | undefined;

/**
 * Creates a class patching function for a specific element
 * Optimized to minimize DOM operations
 *
 * @param el - The element to patch classes on
 * @param isSVG - Whether the element is an SVG element
 * @returns A function that applies class changes
 * @public
 */
export function patchClass(el: Element, isSVG?: boolean) {
  // Cache previous class string for faster diffing
  let prevClassName: string | null = null;

  /**
   * Applies class changes to the element
   *
   * @param value - New class value
   */
  return (value: unknown): void => {
    const normalizedClass = normalizeClass(value);

    // Skip DOM update if classes haven't changed
    if (prevClassName === normalizedClass) {
      return;
    }

    // Update cached value
    prevClassName = normalizedClass;

    // Apply classes based on element type
    if (normalizedClass === '') {
      el.removeAttribute('class');
    } else if (isSVG) {
      el.setAttribute('class', normalizedClass);
    } else {
      el.className = normalizedClass;
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

  // Fast path: string values
  if (typeof value === 'string') {
    return value.trim();
  }

  let className = '';

  // Handle arrays
  if (isArray(value)) {
    // Optimize for small arrays
    if (value.length <= 4) {
      // Inline processing for better performance
      for (const element of value) {
        const normalized = normalizeClass(element);
        if (normalized) {
          className += (className ? ' ' : '') + normalized;
        }
      }
    } else {
      // Use join for larger arrays
      className = value.map(normalizeClass).filter(Boolean).join(' ');
    }
    return className;
  }

  // Handle objects (conditional classes)
  if (isObject(value)) {
    // Pre-allocate for better performance
    const parts: string[] = [];

    for (const key in value) {
      if (value[key]) {
        parts.push(key);
      }
    }

    return parts.join(' ');
  }

  // Convert other types to string
  return String(value).trim();
}
