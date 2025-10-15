import { isFalsy, isPrimitive } from '@estjs/shared';

/**
 * Normalize node for reconciliation
 *
 * @param node Node to normalize
 * @returns Normalized node
 */
export function normalizeNode(node: unknown) {
  if (node instanceof Node) {
    return node;
  }
  if (isPrimitive(node)) {
    const textContent = isFalsy(node) ? '' : String(node);
    return document.createTextNode(textContent);
  }
  return node;
}
export function isHtmlInputElement(val: unknown): val is HTMLInputElement {
  return val instanceof HTMLInputElement;
}
export function isHtmlSelectElement(val: unknown): val is HTMLSelectElement {
  return val instanceof HTMLSelectElement;
}
export function isHtmlTextAreaElement(val: unknown): val is HTMLTextAreaElement {
  return val instanceof HTMLTextAreaElement;
}

export function isHtmlFormElement(val: unknown): val is HTMLFormElement {
  return val instanceof HTMLFormElement;
}
