import { isString, normalizeClassName } from '@estjs/shared';

/**
 * Supported value types for the class patch layer.
 */
export type ClassValue = string | Record<string, boolean> | ClassValue[] | null | undefined;

/**
 * Applies a minimal class update to an element.
 *
 * Class values are normalized into a string first, then written through
 * `className` or `setAttribute('class')` depending on the element type.
 * Hydration stays silent and reuses the server-rendered result by default.
 *
 * @param el - The element to patch.
 * @param prev - Previous class value.
 * @param next - Next class value.
 * @param isSVG - Whether the element is an SVG element.
 * @returns {void}
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

  const normalizedNext = normalizeClass(next);
  if (!normalizedNext) {
    el.removeAttribute('class');
    return;
  }

  // Skip DOM write if normalized values are identical.
  // For string prev, it's already normalized; otherwise normalize.
  const normalizedPrev = isString(prev) ? prev : normalizeClass(prev);
  if (normalizedPrev === normalizedNext) {
    return;
  }

  // SVG nodes cannot rely on `className` consistently, so use the attribute path.
  if (isSVG) {
    el.setAttribute('class', normalizedNext);
  } else {
    el.className = normalizedNext;
  }
}

/**
 * Normalizes supported class inputs into a single string.
 */
export const normalizeClass = normalizeClassName;
