import {
  escapeHTML,
  isArray,
  isNil,
  isObject,
  isSSRSafeAttrName,
  isString,
  kebabCase,
  normalizeStyle,
  startsWith,
} from '@estjs/shared';

// ---------------------------------------------------------------------------
// SSR attribute helpers
// Used by babel-plugin server-mode generated code.
//
// Each returns a plain, already-escaped attribute fragment string (e.g.
// ` name="v"`). The Babel compiler places these at attribute slot positions in
// render(...), which concatenates slot strings verbatim — so the value here is
// final and must not be escaped again
// ---------------------------------------------------------------------------

/**
 * Render a single attribute as an escaped attribute fragment (e.g. ` name="v"`).
 *
 * @param name - The name of the attribute.
 * @param value - The value of the attribute.
 * @returns {string} The rendered attribute fragment.
 */
export function ssrAttr(name: string, value: unknown): string {
  if (isNil(value) || value === false) return '';
  // Guard against attribute-name injection (e.g. a spread key like
  // `x onmouseover=alert(1)` or `foo><script>`). The name is emitted verbatim
  // into the tag, so an unsafe name is an XSS sink — drop it entirely.
  if (!isSSRSafeAttrName(name)) return '';
  if (value === true) return ` ${name}`;
  return ` ${name}="${escapeHTML(String(value))}"`;
}

/**
 * Render a `class` attribute as an escaped attribute fragment.
 *
 * @param value - The class value (string, object, or array).
 * @returns {string} The rendered class attribute fragment.
 */
export function ssrClass(value: unknown): string {
  const normalized = normalizeClassSSR(value);
  if (!normalized) return '';
  return ` class="${escapeHTML(normalized)}"`;
}

/**
 * Render a `style` attribute as an escaped attribute fragment.
 *
 * @param value - The style value (string or object).
 * @returns {string} The rendered style attribute fragment.
 */
export function ssrStyle(value: unknown): string {
  if (isNil(value)) return '';
  const normalized = normalizeStyle(value);
  if (!normalized) return '';
  if (isString(normalized)) return normalized ? ` style="${escapeHTML(normalized)}"` : '';
  if (isObject(normalized)) {
    const parts: string[] = [];
    for (const key in normalized) {
      const v = normalized[key];
      if (v != null) {
        // Use the shared kebabCase so SSR output matches the client/styleToString
        // path (avoids hydration text mismatches). Escape both the property name
        // and value so neither can break out of the quoted attribute.
        const prop = startsWith(key, '--') ? key : kebabCase(key);
        parts.push(`${escapeHTML(prop)}:${escapeHTML(String(v))}`);
      }
    }
    if (!parts.length) return '';
    return ` style="${parts.join(';')}"`;
  }
  return '';
}

/**
 * Render a spread of props as an escaped attribute fragment.
 * Skips event handlers and special keys.
 *
 * @param props - The props object to spread.
 * @returns {string} The rendered attribute fragment.
 */
export function ssrSpread(props: Record<string, unknown>): string {
  if (!props || !isObject(props)) return '';
  let out = '';
  for (const key in props) {
    if (key === 'children' || key === 'ref' || startsWith(key, 'on')) continue;
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

// ---------------------------------------------------------------------------
// SSR bind helper
// Renders the initial value of a `bind:*` two-way binding into HTML so the
// pre-hydration markup matches what the client will eventually show. Mirrors
// the runtime `bindElement` modifier semantics in `packages/template/src/binding.ts`.
// ---------------------------------------------------------------------------

export interface SSRBindModifiers {
  trim?: boolean;
  number?: boolean;
  lazy?: boolean;
}

interface SSRBindElementContext {
  tag?: string;
  type?: unknown;
}

/**
 * Apply `bind:` modifiers to a model value the same way the client runtime does
 * for the *displayed* value. Blank/whitespace strings are preserved (parity with
 * `applyModifiers` in the client binding runtime).
 */
function applyBindModifiers(value: unknown, modifiers: SSRBindModifiers): unknown {
  if (!isString(value)) return value;
  const s = modifiers.trim ? value.trim() : value;
  if (modifiers.number) {
    const probe = modifiers.trim ? s : s.trim();
    if (probe !== '') {
      const n = Number(probe);
      if (!Number.isNaN(n)) return n;
    }
  }
  return s;
}

function normalizeTagName(tag: unknown): string {
  return isString(tag) ? tag.toLowerCase() : '';
}

function normalizeInputType(type: unknown): string {
  return isString(type) ? type.toLowerCase() : '';
}

function normalizeOwnValue(value: unknown, fallback: string): string {
  return value == null ? fallback : String(value);
}

function hasStringMatch(values: unknown[], value: string): boolean {
  for (const item of values) {
    if (String(item) === value) return true;
  }
  return false;
}

/**
 * Render a `bind:*` binding as an HTML attribute string.
 *
 * @param bindName  - The bind name (e.g. `value`, `checked`, `files`).
 * @param value     - The current model value.
 * @param modifiers - Optional `{ trim, number, lazy }` modifier object.
 * @param ownValue  - Optional static `value` attr on the same element.
 *                    For checkbox/radio inputs, used to match the model
 *                    against the element's own value.
 * @param element   - Optional element context for controls whose SSR shape
 *                    depends on tag/type.
 * @returns {string} The serialized attribute fragment, including the leading space.
 */
export function ssrBind(
  bindName: string,
  value: unknown,
  modifiers?: SSRBindModifiers,
  ownValue?: unknown,
  element: SSRBindElementContext = {},
): string {
  // <input type=file> is DOM→model only; nothing meaningful to render.
  if (bindName === 'files') return '';

  const tag = normalizeTagName(element.tag);
  const inputType = normalizeInputType(element.type);

  // Checkbox group: model is an array, attribute is `checked` iff own value is in it.
  if (bindName === 'checked' && isArray(value)) {
    const fallback = tag === 'input' && inputType !== 'radio' ? 'on' : '';
    const normalizedOwnValue = normalizeOwnValue(ownValue, fallback);
    if (ownValue == null && !fallback) return '';
    return hasStringMatch(value as unknown[], normalizedOwnValue) ? ' checked' : '';
  }

  if (bindName === 'checked' && tag === 'input' && inputType === 'radio') {
    return String(value) === normalizeOwnValue(ownValue, 'on') ? ' checked' : '';
  }

  // Boolean attribute (single checkbox / radio bound to value-equality).
  if (bindName === 'checked') {
    return value ? ' checked' : '';
  }

  if (bindName === 'value' && (tag === 'select' || tag === 'textarea')) return '';

  // Single select with array model is multi-select — handled via `<option selected>`
  // by the renderer, not directly as a `value` attribute. Best-effort: emit nothing.
  if (bindName === 'value' && isArray(value)) return '';

  const next = modifiers ? applyBindModifiers(value, modifiers) : value;
  return ssrAttr(bindName, next);
}

/**
 * Render an `<option selected>` attribute for a bound `<select>`.
 *
 * @returns {string} The attribute fragment.
 */
export function ssrSelected(value: unknown, ownValue?: unknown): string {
  if (ownValue == null) return '';
  const normalizedOwnValue = String(ownValue);
  if (isArray(value)) {
    return hasStringMatch(value as unknown[], normalizedOwnValue) ? ' selected' : '';
  }
  return String(value) === normalizedOwnValue ? ' selected' : '';
}

/**
 * Render escaped initial text for `<textarea bind:value>`.
 *
 * The text is HTML-escaped and returned as a plain string; render() emits it
 * verbatim (it is already escaped and must not be double-escaped).
 *
 * @returns {string} The pre-escaped text fragment.
 */
export function ssrTextValue(value: unknown, modifiers?: SSRBindModifiers): string {
  const next = modifiers ? applyBindModifiers(value, modifiers) : value;
  if (isNil(next) || next === false) return '';
  return escapeHTML(String(next));
}
