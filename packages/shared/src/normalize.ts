/**
 * Normalization utilities for class names and styles
 * Shared between template (client) and server packages
 */

import { isArray, isNumber, isObject, isString } from './is';
import { kebabCase } from './string';

/**
 * Normalized style object type
 */
export type NormalizedStyle = Record<string, string | number>;

/**
 * Style value type that can be normalized
 */
export type StyleValue = string | NormalizedStyle | StyleValue[] | null | undefined;

/**
 * Class value type that can be normalized
 */
export type ClassValue = string | Record<string, boolean> | ClassValue[] | null | undefined;

// Style parsing related regular expressions
/** Semicolon separator regex, excludes semicolons within parentheses */
const STYLE_SEPARATOR_REGEX = /;(?![^(]*\))/g;
/** Property value separator regex */
const PROPERTY_VALUE_SEPARATOR_REGEX = /:([\s\S]+)/;
/** Style comment regex */
const STYLE_COMMENT_REGEX = /\/\*[\s\S]*?\*\//g;

/**
 * Parse CSS style string into object format
 *
 * @param cssText - CSS style string
 * @returns Normalized style object
 */
export function parseStyleString(cssText: string): NormalizedStyle {
  const styleObject: NormalizedStyle = {};

  cssText
    .replaceAll(STYLE_COMMENT_REGEX, '')
    .split(STYLE_SEPARATOR_REGEX)
    .forEach(styleItem => {
      if (styleItem) {
        const parts = styleItem.split(PROPERTY_VALUE_SEPARATOR_REGEX);
        if (parts.length > 1) {
          styleObject[parts[0].trim()] = parts[1].trim();
        }
      }
    });

  return styleObject;
}

/**
 * Normalize style value to a unified format
 *
 * @param styleValue - Original style value (object, string, or array)
 * @returns Normalized style object or string
 */
export function normalizeStyle(styleValue: unknown): NormalizedStyle | string | undefined {
  // Handle array format styles
  if (isArray(styleValue)) {
    const normalizedStyleObject: NormalizedStyle = {};

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
    return styleValue as NormalizedStyle | string;
  }

  return undefined;
}

/**
 * Convert style object to CSS string
 *
 * @param styleValue - Style object or string
 * @returns Formatted CSS string
 */
export function styleToString(styleValue: NormalizedStyle | string | undefined): string {
  if (!styleValue) {
    return '';
  }

  if (isString(styleValue)) {
    return styleValue;
  }

  let cssText = '';
  for (const propName in styleValue) {
    const propValue = styleValue[propName];

    if (isString(propValue) || isNumber(propValue)) {
      // Keep CSS variables as is, convert other properties to kebab-case
      const normalizedPropName = propName.startsWith('--') ? propName : kebabCase(propName);
      cssText += `${normalizedPropName}:${propValue};`;
    }
  }

  return cssText;
}

/**
 * Normalize class value to a unified string format
 *
 * @param classValue - Original class value (string, array, or object)
 * @returns Normalized class name string
 */
export function normalizeClassName(classValue: unknown): string {
  if (classValue == null) {
    return '';
  }

  if (isString(classValue)) {
    return classValue.trim();
  }

  // Handle arrays
  if (isArray(classValue)) {
    return classValue.map(normalizeClassName).filter(Boolean).join(' ');
  }

  // Handle objects (conditional classes)
  if (isObject(classValue)) {
    let count = 0;
    for (const key in classValue) {
      if (classValue[key]) count++;
    }

    if (count === 0) return '';

    const result: string[] = new Array(count);
    let index = 0;

    for (const key in classValue) {
      if (classValue[key]) {
        result[index++] = key;
      }
    }

    return result.join(' ');
  }

  return String(classValue).trim();
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
