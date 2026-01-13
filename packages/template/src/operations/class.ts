import { isArray, isObject } from '@estjs/shared';
import { isHydrating } from '../shared';

/**
 * Type definition for class values
 * @public
 */
export type ClassValue = string | Record<string, boolean> | ClassValue[] | null | undefined;

/**
 * Patches the class attribute of an element
 * Supports silent hydration (skips DOM updates during hydration phase)
 *
 * @param el - The element to patch classes on
 * @param prev - Previous class value for diffing
 * @param next - New class value to apply
 * @param isSVG - Whether the element is an SVG element
 * @public
 */
export function patchClass(
  el: Element,
  prev: unknown,
  next: unknown,
  isSVG: boolean = false,
): void {
  if (prev === next) {
    return;
  }
  if (isHydrating()) {
    return;
  }
  const normalizedNext = normalizeClass(next);
  const normalizedPrev = normalizeClass(prev);
  // Skip DOM update if classes haven't changed
  if (normalizedNext && normalizedPrev === normalizedNext) {
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
}

/**
 * Normalizes different class value formats into a single string
 *
 * @param value - The class value to normalize
 * @returns A normalized class string
 * @public
 */
export function normalizeClass(value: unknown): string {
  if (value == null) {
    return '';
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  // Handle arrays
  if (isArray(value)) {
    return value.map(normalizeClass).filter(Boolean).join(' ');
  }

  // Handle objects (conditional classes)
  if (isObject(value)) {
    // Pre-count true values for efficient array allocation
    let count = 0;
    for (const key in value) {
      if (value[key]) count++;
    }

    if (count === 0) return '';

    const result: string[] = new Array(count);
    let index = 0;

    for (const key in value) {
      if (value[key]) {
        result[index++] = key;
      }
    }

    return result.join(' ');
  }

  // Convert other types to string
  return String(value).trim();
}
