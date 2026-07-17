import {
  includeBooleanAttr,
  isBooleanAttr,
  isFunction,
  isObject,
  isSpecialBooleanAttr,
  isSymbol,
  isUnsafeUrl,
  isUrlAttribute,
  startsWith,
  warn,
} from '@estjs/shared';
import {
  KEY_PROP,
  SPREAD_NAME,
  SVG_NAMESPACE,
  XLINK_NAMESPACE,
  XMLNS_NAMESPACE,
} from '../constants';
import { patchClass } from './class';
import { patchStyle } from './style';
import { addEvent } from './event';

/**
 * Attribute values are normalized at runtime according to their target, so
 * compiled JSX and spread attributes may pass any JavaScript value.
 */
export type AttrValue = unknown;

const BOOLEAN_PROPERTY_ALIASES: Record<string, string> = {
  allowfullscreen: 'allowFullscreen',
  formnovalidate: 'formNoValidate',
  ismap: 'isMap',
  nomodule: 'noModule',
  novalidate: 'noValidate',
  readonly: 'readOnly',
};

function syncBooleanProperty(el: Element, key: string, value: boolean): void {
  if (el.namespaceURI === SVG_NAMESPACE) return;
  const prop = BOOLEAN_PROPERTY_ALIASES[key.toLowerCase()] ?? key;
  if (!(prop in el) || typeof el[prop] !== 'boolean') return;
  try {
    el[prop] = value;
  } catch {
    /* read-only DOM property */
  }
}

/**
 * Per-element registry of listeners installed by spread objects, keyed by
 * event name, so a changed/removed handler in a later spread value can be
 * detached (diffed by function identity).
 */
const spreadListeners = new WeakMap<
  Element,
  Map<string, { handler: EventListener; cleanup: () => void }>
>();

const SPREAD_EVENT_RE = /^on[A-Z]/;

/**
 * Route ONE spread key to the correct patch layer:
 * - `class` / `style` → patchClass / patchStyle (objects/arrays normalize
 *   instead of stringifying to "[object Object]");
 * - `onXxx` functions → real event listeners (diffed against the previous
 *   spread value; removed when dropped);
 * - `ref` / `bind:*` → unsupported inside spreads (dev warn);
 * - everything else → patchAttr.
 */
function patchSpreadKey(el: Element, key: string, prev: unknown, next: unknown): void {
  if (key === 'class' || key === 'className') {
    patchClass(el, prev, next, el.namespaceURI === SVG_NAMESPACE);
    return;
  }
  if (key === 'style') {
    patchStyle(el as HTMLElement, prev, next);
    return;
  }
  // Take the event branch whenever either side is a function: a non-function
  // `next` (string, null, ...) must still detach the previously installed
  // listener instead of falling through to patchAttr and leaking it.
  if (SPREAD_EVENT_RE.test(key) && (isFunction(next) || isFunction(prev))) {
    const eventName = key.slice(2).toLowerCase();
    let listeners = spreadListeners.get(el);
    const existing = listeners?.get(eventName);
    if (existing && existing.handler === next) return;
    if (existing) {
      existing.cleanup();
      listeners!.delete(eventName);
    }
    if (isFunction(next)) {
      const handler = next as EventListener;
      const cleanup = addEvent(el, eventName, handler);
      if (!listeners) {
        listeners = new Map();
        spreadListeners.set(el, listeners);
      }
      listeners.set(eventName, { handler, cleanup });
    }
    return;
  }
  if (key === 'ref' || startsWith(key, 'bind:')) {
    // Not supported inside spreads in any build — must not fall through to
    // patchAttr, which would serialize the value into a DOM attribute.
    if (__DEV__) {
      warn(`"${key}" is not supported inside a spread; apply it as a direct JSX attribute.`);
    }
    return;
  }
  patchAttr(el, key, prev, next);
}

/**
 * Applies a minimal attribute update to an element.
 *
 * This is the most general-purpose attribute updater in the template runtime.
 * It is responsible for:
 * - skipping internal reserved fields;
 * - expanding spread attribute objects;
 * - handling boolean attributes and SVG / xlink / xmlns namespaces;
 * - applying basic dangerous-URL protection;
 * - refusing raw HTML sinks such as `innerHTML` / `srcdoc`;
 * - staying silent during hydration to avoid overwriting SSR DOM.
 *
 * @param el - The element to patch.
 * @param key - The attribute key.
 * @param prev - Previous attribute value.
 * @param next - Next attribute value.
 */
export function patchAttr(el: Element, key: string, prev: AttrValue, next: AttrValue) {
  if (key === KEY_PROP) {
    if (next == null) {
      el.removeAttribute(key);
    } else {
      el.setAttribute(key, String(next));
    }
    return;
  }
  if (key === SPREAD_NAME) {
    const prevObj = isObject(prev) ? (prev as Record<string, unknown>) : null;
    const nextObj = isObject(next) ? (next as Record<string, unknown>) : null;

    if (__DEV__) {
      if (next != null && !nextObj) {
        warn('spread attribute must be an object');
      }
    }

    if (prevObj) {
      for (const attrKey in prevObj) {
        if (attrKey === SPREAD_NAME) {
          if (__DEV__) {
            warn('nested spread attributes are ignored');
          }
          continue;
        }
        if (!nextObj || !(attrKey in nextObj)) {
          patchSpreadKey(el, attrKey, prevObj[attrKey], null);
        }
      }
    }

    if (nextObj) {
      for (const attrKey in nextObj) {
        if (attrKey === SPREAD_NAME) {
          if (__DEV__) {
            warn('nested spread attributes are ignored');
          }
          continue;
        }
        patchSpreadKey(el, attrKey, prevObj?.[attrKey], nextObj[attrKey]);
      }
    }
    return;
  }

  const normalizedKey = key.toLowerCase();
  const elementIsSVG = el?.namespaceURI === SVG_NAMESPACE;
  const isUrlAttr = isUrlAttribute(normalizedKey);
  const isXlink = elementIsSVG && startsWith(normalizedKey, 'xlink:');
  const isXmlns = elementIsSVG && startsWith(key, 'xmlns:');
  const attributeKey = elementIsSVG && isUrlAttr ? normalizedKey : key;

  const isBoolean = isSpecialBooleanAttr(key) || isBooleanAttr(key);
  let normalizedUrlValue: string | undefined;

  if (isUrlAttr && next != null) {
    normalizedUrlValue = String(next);
    if (isUnsafeUrl(normalizedUrlValue)) {
      if (isXlink) {
        el.removeAttributeNS(XLINK_NAMESPACE, normalizedKey.slice(6));
      } else {
        el.removeAttribute(attributeKey);
      }
      return;
    }
  }

  // Early return if values are the same
  if (prev === next) {
    return;
  }

  // Event attributes are handled by the dedicated event layer, so skip them here.
  if (key.length > 2 && key.charCodeAt(0) === 111 && key.charCodeAt(1) === 110) {
    return;
  }

  if (normalizedKey === 'innerhtml' || normalizedKey === 'srcdoc') {
    if (__DEV__) {
      warn(`${key} updates are ignored by patchAttr`);
    }
    return;
  }

  if (next == null) {
    if (isXlink) {
      el.removeAttributeNS(XLINK_NAMESPACE, normalizedKey.slice(6));
    } else if (isXmlns) {
      const localName = key.slice(6);
      el.removeAttributeNS(XMLNS_NAMESPACE, localName);
    } else {
      el.removeAttribute(attributeKey);
    }
    if (isBoolean || normalizedKey === 'indeterminate') {
      syncBooleanProperty(el, key, false);
    }
    return;
  }

  if (isBoolean) {
    const included = includeBooleanAttr(next);
    if (included) {
      el.setAttribute(key, '');
    } else {
      el.removeAttribute(key);
    }
    syncBooleanProperty(el, key, included);
    return;
  }

  const attrValue = normalizedUrlValue ?? (isSymbol(next) ? String(next) : next);

  if (isXlink) {
    el.setAttributeNS(XLINK_NAMESPACE, normalizedKey, String(attrValue));
    return;
  }

  if (isXmlns) {
    el.setAttributeNS(XMLNS_NAMESPACE, key, String(attrValue));
    return;
  }

  if (elementIsSVG) {
    el.setAttribute(attributeKey, String(attrValue));
  } else {
    if (key in el) {
      try {
        el[key] = attrValue;
      } catch {
        el.setAttribute(key, String(attrValue));
      }
    } else {
      el.setAttribute(key, String(attrValue));
    }
  }
}
