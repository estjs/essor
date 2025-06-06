import { includeBooleanAttr, isBooleanAttr, isSpecialBooleanAttr, isSymbol } from '@estjs/shared';
import { SVG_NAMESPACE, XLINK_NAMESPACE, XMLNS_NAMESPACE } from '../constants';

/**
 * Type definition for attribute values
 * @public
 */
export type AttrValue = string | boolean | number | null | undefined;

export function patchAttr(el: Element, key: string, isSVG?: boolean) {
  // SVG checks
  const elementIsSVG = isSVG || el.namespaceURI === SVG_NAMESPACE;
  const isXlink = elementIsSVG && key.startsWith('xlink:');
  const isXmlns = elementIsSVG && key.startsWith('xmlns:');

  // Attribute type checks
  const isBoolean = isSpecialBooleanAttr(key) || isBooleanAttr(key);

  return (prev: unknown, next: unknown) => {
    // Skip update if value hasn't changed
    if (prev === next) {
      return;
    }

    // Handle attribute removal
    if (next == null) {
      if (isXlink) {
        el.removeAttributeNS(XLINK_NAMESPACE, key.slice(6));
      } else if (isXmlns) {
        const localName = key.split(':')[1];
        el.removeAttributeNS(XMLNS_NAMESPACE, localName);
      } else {
        el.removeAttribute(key);
      }
      return;
    }

    // Handle special namespaces
    if (isXlink) {
      el.setAttributeNS(XLINK_NAMESPACE, key, String(next));
      return;
    }

    if (isXmlns) {
      el.setAttributeNS(XMLNS_NAMESPACE, key, String(next));
      return;
    }

    // Handle boolean attributes
    if (isBoolean) {
      if (includeBooleanAttr(next)) {
        el.setAttribute(key, '');
      } else {
        el.removeAttribute(key);
      }
      return;
    }

    // Handle regular attributes - safely convert to string
    const attrValue = isSymbol(next) ? String(next) : next;

    // Apply attribute based on element type
    if (elementIsSVG) {
      el.setAttribute(key, String(attrValue));
    } else {
      // Try property first for better performance on HTML elements
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
  };
}
