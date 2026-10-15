/**
 * Compile-time style serialization for static `style` attributes.
 */
import { normalizeStyle } from '@estjs/shared';

/**
 * camelCase -> kebab-case. A leading capital gets a leading dash, so vendor
 * prefixes serialize correctly (`WebkitTransition` -> `-webkit-transition`).
 * Custom properties (`--x`) and already-kebab keys pass through unchanged.
 */
function toCSSProperty(key: string): string {
  return key.startsWith('--') ? key : key.replaceAll(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/**
 * Serialize a style object/array/string into compact CSS text.
 * { color: 'red', fontSize: '16px' } -> "color:red;font-size:16px"
 */
export function styleToString(style: unknown): string | undefined {
  const normalized = normalizeStyle(style);
  if (!normalized) return undefined;
  if (typeof normalized === 'string') return normalized;

  const parts: string[] = [];
  for (const key in normalized) {
    const value = normalized[key];
    if (typeof value === 'string' || typeof value === 'number') {
      parts.push(`${toCSSProperty(key)}:${value}`);
    }
  }
  return parts.join(';');
}
