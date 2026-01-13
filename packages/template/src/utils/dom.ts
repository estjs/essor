/**
 * DOM manipulation utilities
 */

import { error, isPrimitive } from '@estjs/shared';
import { isComponent } from '../component';
import type { AnyNode } from '../types';

/**
 * Remove node from its parent
 *
 * @param node - Node to remove
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
  } catch (_error) {
    error('Failed to remove node:', _error);
  }
}

/**
 * Insert child node into parent
 * Handles both component nodes and DOM nodes
 *
 * @param parent - Parent node
 * @param child - Child node to insert
 * @param before - Reference node for insertion position
 */
export function insertNode(parent: Node, child: AnyNode, before?: AnyNode): void {
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
      if (__DEV__) {
        if (!child) {
          error('insertNode: child is not a Node', child);
        }
      }
      parent.appendChild(child as Node);
    }
  } catch (_error) {
    error('Failed to insert node:', _error);
  }
}

/**
 * Replace child node with a new node
 * Handles both component nodes and DOM nodes
 *
 * @param parent - Parent node
 * @param newNode - New node to insert
 * @param oldNode - Old node to be replaced
 */
export function replaceNode(parent: Node, newNode: AnyNode, oldNode: AnyNode): void {
  if (!parent || !newNode || !oldNode || newNode === oldNode) return;

  try {
    const beforeNode: AnyNode | undefined = isComponent(oldNode)
      ? oldNode.beforeNode
      : (oldNode as Node).nextSibling!;
    removeNode(oldNode);
    insertNode(parent, newNode, beforeNode);
  } catch (_error) {
    error('Failed to replace node:', _error);
  }
}

/**
 * Get the first DOM node from a node or component
 *
 * @param node - Node or component
 * @returns The first DOM node or undefined
 */
export function getFirstDOMNode(node: AnyNode): Node | undefined {
  if (!node) {
    return;
  }

  if (isComponent(node)) {
    return node.firstChild;
  }

  if (isPrimitive(node)) {
    return undefined;
  }

  return node as Node;
}
