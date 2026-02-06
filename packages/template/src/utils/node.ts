/**
 * Node normalization and comparison utilities
 */

import {
  isArray,
  isFalsy,
  isHTMLElement,
  isNull,
  isObject,
  isPrimitive,
  isTextNode,
} from '@estjs/shared';
import { isComponent } from '../component';
import { getNodeKey } from '../key';
import type { AnyNode } from '../types';

/**
 * Normalize node for reconciliation
 * Converts primitives to text nodes
 *
 * @param node - Node to normalize
 * @returns Normalized DOM node
 */
export function normalizeNode(node: unknown): Node {
  // Already a Node
  if (isHTMLElement(node)) {
    return node;
  }

  // Handle primitives - convert to text nodes
  if (isPrimitive(node)) {
    const textContent = isFalsy(node) ? '' : String(node);
    return document.createTextNode(textContent);
  }

  return node as Node;
}

/**
 * Check if two nodes are the same (for reconciliation)
 * Combines key check and type check
 *
 * @param a - First node
 * @param b - Second node
 * @returns true if nodes are considered the same
 */
export function isSameNode(a: AnyNode, b: AnyNode): boolean {
  // Check key equality first (fast path)
  const keyA = getNodeKey(a);
  const keyB = getNodeKey(b);

  if (keyA !== keyB) {
    return false;
  }

  // Inline type check to avoid function call
  const aIsComponent = isComponent(a);
  const bIsComponent = isComponent(b);

  if (aIsComponent && bIsComponent) {
    return a.component === b.component;
  }

  if (aIsComponent !== bIsComponent) {
    return false;
  }

  if (isPrimitive(a) || isPrimitive(b)) {
    return a === b;
  }

  const aNode = a as Node;
  const bNode = b as Node;

  if (aNode.nodeType !== bNode.nodeType) {
    return false;
  }

  if (aNode.nodeType === Node.ELEMENT_NODE) {
    return (aNode as Element).tagName === (bNode as Element).tagName;
  }

  return true;
}

/**
 * Check if a value is a Text node
 * Re-exported from shared for convenience
 */
export function isHtmlTextElement(val: unknown): val is Text {
  return isTextNode(val);
}

/**
 * Shallow compare two objects or arrays
 * Performs strict equality check on top-level properties
 *
 * @param a - First value to compare
 * @param b - Second value to compare
 * @returns true if values are shallowly equal
 */
export function shallowCompare(a: unknown, b: unknown): boolean {
  // Fast path: strict equality
  if (a === b) return true;

  // Null/undefined check
  if (isNull(a) || isNull(b)) return false;

  // Type guard: both must be objects
  if (!isObject(a) || !isObject(b)) return false;

  // Array type consistency check
  if (isArray(a) !== isArray(b)) return false;

  // Type guard for record-like objects
  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;

  // Fast path: check key count first
  const aKeys = Object.keys(aRecord);
  const bKeys = Object.keys(bRecord);
  if (aKeys.length !== bKeys.length) return false;

  // Single pass: check all keys and values
  for (const key of aKeys) {
    if (!(key in bRecord) || aRecord[key] !== bRecord[key]) {
      return false;
    }
  }

  return true;
}
