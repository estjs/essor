import {
  includeBooleanAttr,
  isBooleanAttr,
  isObject,
  isSpecialBooleanAttr,
  isString,
  isSymbol,
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

/**
 * Supported value types for the attribute patch layer.
 *
 * In addition to primitive values, spread objects are also accepted, so the
 * type keeps `Record<string, unknown>`.
 */
export type AttrValue = string | boolean | number | null | undefined | Record<string, unknown>;

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
          patchAttr(el, attrKey, prevObj[attrKey] as AttrValue, null);
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
        patchAttr(el, attrKey, prevObj?.[attrKey] as AttrValue, nextObj[attrKey] as AttrValue);
      }
    }
    return;
  }

  const elementIsSVG = el?.namespaceURI === SVG_NAMESPACE;
  const isXlink = elementIsSVG && startsWith(key, 'xlink:');
  const isXmlns = elementIsSVG && startsWith(key, 'xmlns:');

  const isBoolean = isSpecialBooleanAttr(key) || isBooleanAttr(key);

  // Early return if values are the same
  if (prev === next) {
    return;
  }

  // Event attributes are handled by the dedicated event layer, so skip them here.
  if (key.length > 2 && key.charCodeAt(0) === 111 && key.charCodeAt(1) === 110) {
    return;
  }

  // Lowercase only after early returns, since it is only needed for specific checks like href.
  const lowerKey = key.toLowerCase();

  if (lowerKey === 'innerhtml' || lowerKey === 'srcdoc') {
    if (__DEV__) {
      warn(`${key} updates are ignored by patchAttr`);
    }
    return;
  }

  if (next == null) {
    if (isXlink) {
      el.removeAttributeNS(XLINK_NAMESPACE, key.slice(6));
    } else if (isXmlns) {
      const localName = key.slice(6);
      el.removeAttributeNS(XMLNS_NAMESPACE, localName);
    } else {
      el.removeAttribute(key);
    }
    return;
  }

  if (isBoolean) {
    if (includeBooleanAttr(next)) {
      el.setAttribute(key, '');
    } else {
      el.removeAttribute(key);
    }
    return;
  }

  const attrValue = isSymbol(next) ? String(next) : next;

  // Basic safety guard: block dangerous protocols on common URL attributes.
  const isUrlAttr =
    lowerKey === 'href' ||
    lowerKey === 'src' ||
    lowerKey === 'xlink:href' ||
    lowerKey === 'action' ||
    lowerKey === 'formaction' ||
    lowerKey === 'poster';
  if (isUrlAttr && isString(attrValue)) {
    const v = attrValue.trim().toLowerCase();
    if (startsWith(v, 'javascript:') || startsWith(v, 'data:')) {
      return;
    }
  }

  if (isXlink) {
    el.setAttributeNS(XLINK_NAMESPACE, key, String(attrValue));
    return;
  }

  if (isXmlns) {
    el.setAttributeNS(XMLNS_NAMESPACE, key, String(attrValue));
    return;
  }

  if (elementIsSVG) {
    el.setAttribute(key, String(attrValue));
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
