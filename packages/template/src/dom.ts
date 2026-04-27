import { error, hasOwn, isFalsy, isHTMLElement, isObject, isPrimitive } from '@estjs/shared';
import { isComponent } from './component';
import { KEY_PROP } from './constants';
import type { AnyNode } from './types';

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

  if (isComponent(node)) {
    node.destroy();
  } else {
    const element = node as ChildNode;
    if (element.parentNode) {
      element.remove();
    }
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
export function insertNode(parent: Node, child: AnyNode, before?: AnyNode): void {
  if (!parent || !child) return;

  const beforeNode = isComponent(before) ? before.firstChild : (before as Node);

  if (isComponent(child)) {
    child.mount(parent, beforeNode);
    return;
  }

  if (beforeNode) {
    parent.insertBefore(child as Node, beforeNode);
  } else {
    if (__DEV__) {
      if (!child) {
        error('insertNode: child is not a Node', child);
      }
    }
    parent.appendChild(child as Node);
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

  const beforeNode: AnyNode | undefined = isComponent(oldNode)
    ? oldNode.beforeNode
    : (oldNode as Node).nextSibling!;
  removeNode(oldNode);
  insertNode(parent, newNode, beforeNode);
}

/**
 * Check if two nodes are the same (inline for performance)
 * This combines key check and type check
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
 * Extract the optional stable key associated with a runtime node.
 */
function getNodeKey(node: AnyNode): unknown {
  if (!node) {
    return undefined;
  }

  if (isComponent(node)) {
    return hasOwn(node.props, KEY_PROP) ? node.props[KEY_PROP] : undefined;
  }

  if (node instanceof Element) {
    return node.getAttribute(KEY_PROP);
  }

  if (isObject(node) && hasOwn(node, KEY_PROP)) {
    return Reflect.get(node as object, KEY_PROP);
  }

  return undefined;
}

/**
 * Normalize node for reconciliation
 */
export function normalizeNode(node: unknown): Node {
  // already a Node
  if (isHTMLElement(node)) {
    return node;
  }

  if (isPrimitive(node)) {
    return document.createTextNode(isFalsy(node) ? '' : String(node));
  }

  return node as Node;
}
