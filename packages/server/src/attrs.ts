import { isComputed, isSignal } from '@estjs/signals';
import { isArray, isNumber, isObject, isString, kebabCase } from '@estjs/shared';

/**
 * Normalized style object type
 * Represents the processed style object format
 */
export type NormalizedStyle = Record<string, string | number>;

/**
 * Normalize style value
 *
 * Convert style values in various formats (object, string, array) to a unified format
 *
 * @param styleValue Original style value
 * @returns Normalized style object or string
 */
export function normalizeStyle(styleValue: unknown): NormalizedStyle | string | undefined {
  // Handle array format styles
  if (isArray(styleValue)) {
    const normalizedStyleObject: NormalizedStyle = {};

    // Iterate through each style item in the array and merge
    for (const styleItem of styleValue) {
      const normalizedItem = isString(styleItem)
        ? parseStyleString(styleItem)
        : (normalizeStyle(styleItem) as NormalizedStyle);

      if (normalizedItem) {
        for (const key in normalizedItem) {
          normalizedStyleObject[key] = normalizedItem[key];
        }
      }
    }

    return normalizedStyleObject;
  }
  // Handle string or object format styles
  if (isString(styleValue) || isObject(styleValue)) {
    return styleValue as any;
  }

  // Return undefined for other types
  return undefined;
}

// Style parsing related regular expressions
/** Semicolon separator regex, excludes semicolons within parentheses */
const styleSeparatorRegex = /;(?![^(]*\))/g;
/** Property value separator regex */
const propertyValueSeparatorRegex = /:([\s\S]+)/;
/** Style comment regex */
const styleCommentRegex = /\/\*[\s\S]*?\*\//g;

/**
 * Parse CSS style string into object format
 *
 * Parsing process:
 * 1. Remove CSS comments
 * 2. Split by semicolons into style items
 * 3. Parse each style item into key-value pairs
 *
 * @param cssText CSS style string
 * @returns Normalized style object
 */
export function parseStyleString(cssText: string): NormalizedStyle {
  const styleObject: NormalizedStyle = {};

  // Remove comments, split by semicolons, and process each item
  cssText
    .replaceAll(styleCommentRegex, '')
    .split(styleSeparatorRegex)
    .forEach(styleItem => {
      if (styleItem) {
        const parts = styleItem.split(propertyValueSeparatorRegex);
        // Only process valid property-value pairs
        if (parts.length > 1) {
          styleObject[parts[0].trim()] = parts[1].trim();
        }
      }
    });

  return styleObject;
}

/**
 * Convert style object to CSS string
 *
 * Handle different types of style values, and apply CSS variable and kebab-case transformations
 *
 * @param styleValue Style object or string
 * @returns Formatted CSS string
 */
export function styleObjectToString(styleValue: NormalizedStyle | string | undefined): string {
  // Check for empty values
  if (!styleValue) {
    return '';
  }

  // Return string values directly
  if (isString(styleValue)) {
    return styleValue;
  }

  // Convert object to string
  let cssText = '';
  for (const propName in styleValue) {
    const propValue = styleValue[propName];

    // Only process valid string or number values
    if (isString(propValue) || isNumber(propValue)) {
      // Keep CSS variables as is, convert other properties to kebab-case
      const normalizedPropName = propName.startsWith('--') ? propName : kebabCase(propName);
      cssText += `${normalizedPropName}:${propValue};`;
    }
  }

  return cssText;
}

/**
 * Normalize class name
 *
 * Process different formats of class name input (string, array, object) and output a unified string
 *
 * @param classValue Original class name value
 * @returns Normalized class name string
 */
export function normalizeClassName(classValue: unknown): string {
  let resultClassName = '';

  // Handle string class names
  if (isString(classValue)) {
    resultClassName = classValue;
  }
  // Handle array class names
  else if (isArray(classValue)) {
    for (const item of classValue) {
      const normalizedItem = normalizeClassName(item);
      if (normalizedItem) {
        resultClassName += `${normalizedItem} `;
      }
    }
  }
  // Handle object class names (conditional classes)
  else if (isObject(classValue)) {
    for (const className in classValue) {
      // Only add class name when value is truthy
      if (classValue[className]) {
        resultClassName += `${className} `;
      }
    }
  }

  return resultClassName.trim();
}

/**
 * Normalize component properties
 *
 * Special handling for class and style attributes, converting them to normalized format
 *
 * @param props Original component properties
 * @returns Normalized component properties
 */
export function normalizeProps(props: Record<string, any> | null): Record<string, any> | null {
  if (!props) {
    return null;
  }

  const { class: className, style } = props;

  // Normalize class attribute
  if (className && !isString(className)) {
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
 * @param attrName Attribute name
 * @param attrValue Attribute value
 * @param hydrationId Hydration ID (for client-side reuse)
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

    // Use string styles directly
    if (isString(normalizedStyle)) {
      return ` style="${normalizedStyle}"`;
    }

    // Convert object styles to string
    return ` style="${styleObjectToString(normalizedStyle)}"`;
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
