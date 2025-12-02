import { isFalsy, isPrimitive } from '@estjs/shared';
import { isComponent } from './component';
import type { AnyNode } from './types';

/**
 * Create a reactive proxy that excludes specified properties
 *
 * @param target - The original reactive object
 * @param keys - List of property names to exclude
 * @returns A reactive proxy with specified properties excluded
 */
export function propsOmit<T extends object, K extends keyof T>(target: T, keys: K[]): Omit<T, K> {
  const excludeSet = new Set(keys);

  return new Proxy(target, {
    // Intercept property reads
    get(obj, prop) {
      // Return undefined if it's an excluded property
      if (excludeSet.has(prop as K)) {
        return undefined;
      }
      // Otherwise return the original value (maintaining reactivity)
      return Reflect.get(obj, prop);
    },

    // Intercept property enumeration (for...in, Object.keys, etc.)
    ownKeys(obj) {
      return Reflect.ownKeys(obj).filter(key => !excludeSet.has(key as K));
    },

    // Intercept property descriptor retrieval
    getOwnPropertyDescriptor(obj, prop) {
      if (excludeSet.has(prop as K)) {
        return undefined;
      }
      return Reflect.getOwnPropertyDescriptor(obj, prop);
    },

    // Intercept the 'in' operator
    has(obj, prop) {
      if (excludeSet.has(prop as K)) {
        return false;
      }
      return Reflect.has(obj, prop);
    },
  });
}

/**
 * Remove node from its parent
 *
 * @param node Node to remove
 *
 * @example
 * ```typescript
 * removeNode(elementToRemove);
 * ```
 */
export function removeNode(node: AnyNode): void {
  if (!node) return;

  try {
    if (isComponent(node)) {
      node.destroy();
    } else {
      const element = node as Element;
      if (element.parentElement) {
        element.remove();
      }
    }
  } catch (error) {
    console.error('Failed to remove node:', error);
  }
}

/**
 * Insert child node
 * Handle insertion of component nodes and DOM nodes
 *
 * @param parent Parent node
 * @param child Child node
 * @param before Reference node for insertion
 */
export function insertNode(parent: Node, child: AnyNode, before: AnyNode | null = null): void {
  if (!parent || !child) return;

  try {
    const beforeNode = isComponent(before) ? before.firstChild : (before as Node);

    if (isComponent(child)) {
      child.mount(parent, beforeNode);
      return;
    }

    if (beforeNode) {
      parent.insertBefore(child as Node, beforeNode);
    } else {
      parent.appendChild(child as Node);
    }
  } catch (error) {
    console.error('Failed to insert node:', error);
  }
}

/**
 * Replace child node
 * Handle replacement of component nodes and DOM nodes
 *
 * @param parent Parent node
 * @param newNode New node
 * @param oldNode Old node to be replaced
 */
export function replaceNode(parent: Node, newNode: AnyNode, oldNode: AnyNode): void {
  if (!parent || !newNode || !oldNode || newNode === oldNode) return;

  try {
    insertNode(parent, newNode, oldNode as Node);
    removeNode(oldNode);
  } catch (error) {
    console.error('Failed to replace node:', error);
  }
}

/**
 * Get the first DOM node from a node or component
 */
export function getFirstDOMNode(node: AnyNode): Node | null {
  if (!node) {
    return null;
  }

  if (isComponent(node)) {
    return node.firstChild;
  }

  return node;
}

/**
 * Normalize node for reconciliation
 */
export function normalizeNode(node: unknown): Node {
  // already a Node
  if (node instanceof Node) {
    return node;
  }
  // Handle primitives with memoization
  if (isPrimitive(node)) {
    const textContent = isFalsy(node) ? '' : String(node);

    // Create and cache new text node
    const textNode = document.createTextNode(textContent);
    return textNode.cloneNode(false) as Text;
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

export function isHtmLTextElement(val: unknown): val is Text {
  return val instanceof Text;
}
/**
 * Checks if a value is a HTML node
 * @param {unknown} val - The value to check
 * @returns {boolean} - Returns true if the value is a HTML node, false otherwise
 */
export function isHTMLNode(val: unknown): val is HTMLElement {
  return val instanceof HTMLElement;
}
/**
 * Shallow compare two objects
 * @param {any} a - The first object to compare
 * @param {any} b - The second object to compare
 * @returns {boolean} - Returns true if the objects are equal, false otherwise
 */
export function shallowCompare(a: any, b: any): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (a[key] !== b[key]) return false;
  }

  return true;
}
