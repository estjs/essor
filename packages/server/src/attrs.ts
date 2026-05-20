import { isComputed, isSignal } from '@estjs/signals';
import {
  escapeHTML,
  isString,
  normalizeClassName,
  normalizeStyle,
  startsWith,
  styleToString,
} from '@estjs/shared';

/**
 * Normalize component properties
 *
 * Special handling for class and style attributes, converting them to normalized format.
 * Returns a new object when normalization is needed, preserving the original.
 *
 * @param props - Original component properties
 * @returns Normalized component properties
 */
export function normalizeProps(props: Record<string, any> | null): Record<string, any> | null {
  if (!props) {
    return null;
  }

  const { class: className, style } = props;
  const needsClassNorm = className && !isString(className);
  const needsStyleNorm = !!style;

  if (!needsClassNorm && !needsStyleNorm) {
    return props;
  }

  // Shallow copy to avoid mutating the caller's props
  const result = { ...props };

  if (needsClassNorm) {
    result.class = normalizeClassName(className);
  }

  if (needsStyleNorm) {
    result.style = normalizeStyle(style);
  }

  return result;
}

/**
 * Generate server-side rendering attribute string
 *
 * Generate HTML-compatible attribute string based on attribute type, handling special cases:
 * - Automatic unwrapping of reactive values
 * - Normalization of special attributes (style/class)
 * - Ignoring event attributes
 * - Special handling for boolean attributes
 *
 * @param attrName - Attribute name
 * @param attrValue - Attribute value
 * @returns Formatted HTML attribute string
 */
export function ssrAttrDynamic(attrName: string, attrValue: any): string {
  // Handle reactive values (signals or computed values)
  if (isSignal(attrValue) || isComputed(attrValue)) {
    return ssrAttrDynamic(attrName, attrValue.value);
  }

  // Ignore null, undefined, and false value attributes
  if (!attrValue && attrValue !== 0) {
    return '';
  }

  // Special attribute handling: style
  if (attrName === 'style') {
    const normalizedStyle = normalizeStyle(attrValue);
    if (!normalizedStyle) {
      return '';
    }

    if (isString(normalizedStyle)) {
      return ` style="${normalizedStyle}"`;
    }

    return ` style="${styleToString(normalizedStyle)}"`;
  }

  // Special attribute handling: class
  if (attrName === 'class') {
    const normalizedClassName = normalizeClassName(attrValue);
    return normalizedClassName ? ` class="${normalizedClassName}"` : '';
  }

  // Ignore event handler attributes (client-side behavior)
  if (startsWith(attrName, 'on')) {
    return '';
  }

  // Special handling for boolean attributes
  if (attrValue === true) {
    return ` ${attrName}`;
  }

  // Standard attribute handling — escape to prevent attribute injection (XSS)
  return ` ${attrName}="${escapeHTML(String(attrValue))}"`;
}
