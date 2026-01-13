import { isComputed, isSignal } from '@estjs/signals';
import { normalizeClassName, normalizeStyle, styleToString } from '@estjs/shared';

/**
 * Normalize component properties
 *
 * Special handling for class and style attributes, converting them to normalized format
 *
 * @param props - Original component properties
 * @returns Normalized component properties
 */
export function normalizeProps(props: Record<string, any> | null): Record<string, any> | null {
  if (!props) {
    return null;
  }

  const { class: className, style } = props;

  // Normalize class attribute
  if (className && typeof className !== 'string') {
    props.class = normalizeClassName(className);
  }

  // Normalize style attribute
  if (style) {
    props.style = normalizeStyle(style);
  }

  return props;
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
 * @param hydrationId - Hydration ID (for client-side reuse)
 * @returns Formatted HTML attribute string
 */
export function setSSGAttr(attrName: string, attrValue: any, hydrationId: string): string {
  // Handle reactive values (signals or computed values)
  if (isSignal(attrValue) || isComputed(attrValue)) {
    return setSSGAttr(attrName, attrValue.value, hydrationId);
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

    if (typeof normalizedStyle === 'string') {
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
  if (attrName.startsWith('on')) {
    return '';
  }

  // Special handling for boolean attributes
  if (attrValue === true) {
    return ` ${attrName}`;
  }

  // Standard attribute handling
  return ` ${attrName}="${attrValue}"`;
}
