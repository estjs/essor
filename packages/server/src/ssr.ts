import { escapeHTML, isArray, isNil, isObject, isString } from '@estjs/shared';

// ---------------------------------------------------------------------------
// SSR attribute helpers
// Used by babel-plugin server-mode generated code.
// ---------------------------------------------------------------------------

/**
 * Render a single attribute as an HTML attribute string.
 *
 * @param name - The name of the attribute.
 * @param value - The value of the attribute.
 * @returns {string} The rendered attribute string (e.g., ` name="value"`).
 */
export function ssrAttr(name: string, value: unknown): string {
  if (isNil(value) || value === false) return '';
  if (value === true) return ` ${name}`;
  return ` ${name}="${escapeHTML(String(value))}"`;
}

/**
 * Render a `class` attribute as an HTML attribute string.
 *
 * @param value - The class value (string, object, or array).
 * @returns {string} The rendered class attribute string.
 */
export function ssrClass(value: unknown): string {
  const normalized = normalizeClassSSR(value);
  if (!normalized) return '';
  return ` class="${escapeHTML(normalized)}"`;
}

/**
 * Render a `style` attribute as an HTML attribute string.
 *
 * @param value - The style value (string or object).
 * @returns {string} The rendered style attribute string.
 */
export function ssrStyle(value: unknown): string {
  if (isNil(value)) return '';
  if (isString(value)) return value ? ` style="${escapeHTML(value)}"` : '';
  if (isObject(value)) {
    const obj = value as Record<string, unknown>;
    const parts: string[] = [];
    for (const key in obj) {
      const v = obj[key];
      if (v != null && v !== false) {
        const prop = key.startsWith('--') ? key : camelToKebab(key);
        parts.push(`${prop}:${escapeHTML(String(v))}`);
      }
    }
    if (!parts.length) return '';
    return ` style="${parts.join(';')}"`;
  }
  return '';
}

/**
 * Render a spread of props as HTML attribute strings.
 * Skips event handlers and special keys.
 *
 * @param props - The props object to spread.
 * @returns {string} The rendered attribute strings.
 */
export function ssrSpread(props: Record<string, unknown>): string {
  if (!props || !isObject(props)) return '';
  let out = '';
  for (const key in props) {
    if (key === 'children' || key === 'ref' || key.startsWith('on')) continue;
    if (key === 'class' || key === 'className') {
      out += ssrClass(props[key]);
    } else if (key === 'style') {
      out += ssrStyle(props[key]);
    } else {
      out += ssrAttr(key, props[key]);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalizes SSR class input into a string.
 */
function normalizeClassSSR(value: unknown): string {
  if (isNil(value) || value === false) return '';
  if (isString(value)) return value;
  if (isArray(value)) {
    return (value as unknown[]).map(normalizeClassSSR).filter(Boolean).join(' ');
  }
  if (isObject(value)) {
    const obj = value as Record<string, unknown>;
    return Object.keys(obj)
      .filter((k) => Boolean(obj[k]))
      .join(' ');
  }
  return String(value);
}

/**
 * Converts a camelCase CSS property into kebab-case.
 */
function camelToKebab(str: string): string {
  return str.replaceAll(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}
