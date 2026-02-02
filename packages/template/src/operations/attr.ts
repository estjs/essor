import {
  includeBooleanAttr,
  isBooleanAttr,
  isObject,
  isSpecialBooleanAttr,
  isSymbol,
  warn,
} from '@estjs/shared';
import {
  KEY_PROP,
  SPREAD_NAME,
  SVG_NAMESPACE,
  XLINK_NAMESPACE,
  XMLNS_NAMESPACE,
} from '../constants';
import { setNodeKey } from '../key';
import { isHydrating } from '../hydration/shared';

export type AttrValue = string | boolean | number | null | undefined | Record<string, unknown>;

export function patchAttr(el: Element, key: string, prev: AttrValue, next: AttrValue) {
  if (key === KEY_PROP) {
    if (next == null) {
      setNodeKey(el, undefined);
    } else {
      setNodeKey(el, String(next));
    }
    return;
  }
  if (key === SPREAD_NAME) {
    if (__DEV__) {
      if (!isObject(next)) {
        warn('spread attribute must be an object');
      }
    }
    Object.keys(next as Record<string, unknown>).forEach(k => {
      patchAttr(el, k, prev?.[k], next?.[k]);
    });
    return;
  }

  if (isHydrating()) {
    return;
  }
  const elementIsSVG = el?.namespaceURI === SVG_NAMESPACE;
  const isXlink = elementIsSVG && key.startsWith('xlink:');
  const isXmlns = elementIsSVG && key.startsWith('xmlns:');

  const isBoolean = isSpecialBooleanAttr(key) || isBooleanAttr(key);

  // Early return if values are the same
  if (prev === next) {
    return;
  }

  // Compute lowerKey only when needed (after early exits)
  const lowerKey = key.toLowerCase();

  // Cache event handler check (faster than regex for common case)
  if (lowerKey.length > 2 && lowerKey.charCodeAt(0) === 111 && lowerKey.charCodeAt(1) === 110) {
    // 'on'
    return;
  }

  if (lowerKey === 'innerhtml') {
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

  if (isXlink) {
    el.setAttributeNS(XLINK_NAMESPACE, key, String(next));
    return;
  }

  if (isXmlns) {
    el.setAttributeNS(XMLNS_NAMESPACE, key, String(next));
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

  const isUrlAttr = lowerKey === 'href' || lowerKey === 'src' || lowerKey === 'xlink:href';
  if (isUrlAttr && typeof attrValue === 'string') {
    const v = attrValue.trim().toLowerCase();
    if (v.startsWith('javascript:') || v.startsWith('data:')) {
      return;
    }
  }

  if (elementIsSVG) {
    el.setAttribute(key, String(attrValue));
  } else {
    if (key in el) {
      try {
        (el as any)[key] = attrValue;
      } catch {
        el.setAttribute(key, String(attrValue));
      }
    } else {
      el.setAttribute(key, String(attrValue));
    }
  }
}
