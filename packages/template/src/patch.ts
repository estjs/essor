import { isNil } from '@estjs/shared';
import { isComponent } from './component';
import { isHydrating } from './server/shared';
import type { AnyNode } from './types';

let KEY_COUNTER = 0;
// WeakMap mapping from nodes to internal keys
const NODE_KEYS = new WeakMap<AnyNode, string>();

/**
 * Patches children of a parent node with new children.
 * This function is responsible for efficiently updating the DOM to reflect changes in the virtual DOM.
 *
 * @param {Node} parent - The parent node whose children are being updated
 * @param {Map<string, AnyNode>} childrenMap - A map of current children, keyed by their unique identifiers
 * @param {AnyNode[]} nextChildren - An array of new children to be patched in
 * @param {Node | undefined} before - The node before which new children should be inserted (if any)
 * @returns {Map<string, AnyNode>} A new map of children after patching
 */
export function patchChildren(
  parent: Node,
  childrenMap: Map<string, AnyNode>,
  nextChildren: AnyNode[],
  before?: Node,
): Map<string, AnyNode> {
  // Fast path: empty to non-empty optimization, using DocumentFragment for batch DOM operations
  if (childrenMap.size === 0 && nextChildren.length > 0) {
    // Create DocumentFragment for batch DOM operations
    const fragment = document.createDocumentFragment();
    const result = new Map<string, AnyNode>();

    // Add all child nodes to the DocumentFragment
    nextChildren.forEach((child, i) => {
      const key = getKey(child, i);
      insertNode(fragment, child);
      result.set(key, child);
    });

    // Insert all nodes into the DOM at once, reducing repaints and reflows
    insertNode(parent, fragment, before);
    return result;
  }

  const result = new Map<string, AnyNode>();
  const children = Array.from(childrenMap.values());

  // If there are no new children, clear all existing children
  if (children.length && nextChildren.length === 0) {
    clearChildren(parent, children, before);
    return result;
  }

  // Create DocumentFragment to handle new nodes in batch
  const addedNodesFragment = document.createDocumentFragment();
  let hasAddedNodes = false;

  const replaces: [Comment, AnyNode][] = [];
  const nextChildrenMap = mapKeys(nextChildren);
  let childIndex = 0;

  // Collect nodes to be removed for batch processing
  const nodesToRemove: AnyNode[] = [];

  // Iterate through new children to update or insert
  for (let [i, child] of nextChildren.entries()) {
    const key = getKey(child, i);
    const origChild = childrenMap.get(key);
    let currChild = children[childIndex];
    let currKey = currChild ? getKey(currChild, childIndex) : '';

    // Remove current nodes that are not in the new children set
    while (currChild && !nextChildrenMap.has(currKey)) {
      nodesToRemove.push(currChild);
      childrenMap.delete(currKey);
      childIndex++;
      currChild = children[childIndex];
      currKey = currChild ? getKey(currChild, childIndex) : '';
    }

    // If the child node already exists with the same key, update it
    if (origChild) {
      child = patch(parent, origChild, child);
      // Ensure we preserve node identity in the result
      result.set(key, child);

      // Skip the current child if it matches the original child
      if (currChild === origChild) {
        childIndex++;
      } else if (currChild) {
        // Otherwise create a placeholder and queue replacement
        const placeholder = document.createComment('');
        insertNode(parent, placeholder, currChild as Node);
        replaces.push([placeholder, child]);
      }
    } else {
      // Add new node to DocumentFragment for batch insertion later
      insertNode(addedNodesFragment, child);
      hasAddedNodes = true;
      result.set(key, child);
    }
  }

  // Batch insert new nodes
  if (hasAddedNodes) {
    insertNode(parent, addedNodesFragment, before);
  }

  // Replace placeholder nodes
  for (const [placeholder, child] of replaces) {
    replaceChild(parent, child, placeholder);
  }

  // Batch remove unused nodes
  for (const node of nodesToRemove) {
    removeChild(node);
  }

  // Check and remove remaining unused nodes
  childrenMap.forEach((child, key) => {
    if (!result.has(key) && child.isConnected) {
      removeChild(child);
    }
  });

  return result;
}

/**
 * Clears all children from a parent node.
 *
 * @param {Node} parent - The parent node to clear children from
 * @param {AnyNode[]} children - The array of children to be cleared
 * @param {Node | undefined} before - The node before which clearing should stop (if any)
 */
function clearChildren(parent: Node, children: AnyNode[], before?: Node) {
  if (parent.childNodes.length === children.length + (before ? 1 : 0)) {
    (parent as Element).textContent = '';
    if (before) {
      insertNode(parent, before);
    }
  } else {
    const range = document.createRange();
    const child = children[0];

    const start = isComponent(child) ? child.firstChild : child;
    range.setStartBefore(start! as any);
    if (before) {
      range.setEndBefore(before);
    } else {
      range.setEndAfter(parent);
    }
    range.deleteContents();
  }
  children.forEach(node => {
    if (isComponent(node)) {
      node.destroy();
    }
  });
}

/**
 * Patches a single node, replacing it with a new node if necessary.
 *
 * @param {Node} parent - The parent node
 * @param {AnyNode} node - The current node
 * @param {AnyNode} next - The new node to patch with
 * @returns {AnyNode} The patched node
 */
export function patch(parent: Node, node: AnyNode, next: AnyNode): AnyNode {
  if (node === next) {
    return node;
  }

  // When component types and component functions are the same, update instead of replace
  if (isComponent(node) && isComponent(next) && node.component === next.component) {
    // Pass internal key to maintain stability
    if (NODE_KEYS.has(node) && !NODE_KEYS.has(next)) {
      NODE_KEYS.set(next, NODE_KEYS.get(node)!);
    }
    return next.update(node);
  }

  if (node instanceof Text && next instanceof Text) {
    // Only update textContent if content has actually changed
    if (node.textContent !== next.textContent) {
      node.textContent = next.textContent;
    }
    // Pass internal key to maintain stability
    if (NODE_KEYS.has(node) && !NODE_KEYS.has(next)) {
      NODE_KEYS.set(next, NODE_KEYS.get(node)!);
    }
    return node;
  }

  replaceChild(parent, next, node);
  return next;
}

/**
 * Maps an array of firstChild to a Map, using their keys as identifiers.
 *
 * @param {AnyNode[]} children - The array of firstChild to map
 * @returns {Map<string, AnyNode>} A Map of firstChild, keyed by their unique identifiers
 */
export function mapKeys(children: AnyNode[]): Map<string, AnyNode> {
  const result = new Map();
  for (const [i, child] of children.entries()) {
    const key = getKey(child, i);
    result.set(key, child);
  }
  return result;
}

/**
 * Get unique key for a node
 * Optimization: prefer user-provided key, fall back to internally generated key, lastly use index-based key
 *
 * @param {AnyNode} node - The node to get key for
 * @param {number} index - The index of the node in the parent's children array
 * @returns {string} The unique key for the node
 */
export function getKey(node: AnyNode, index?: number): string {
  // Handle empty node case, add stable prefix
  if (!node) {
    return `_${index}`;
  }

  // Prioritize user-provided key (most common case)
  if (isComponent(node) && !isNil(node.key)) {
    return `${String(node.key)}`;
  }

  // Check cache
  if (NODE_KEYS.has(node)) {
    return NODE_KEYS.get(node)!;
  }

  const internalKey = `${++KEY_COUNTER}`;
  NODE_KEYS.set(node, internalKey);
  return internalKey;
}

/**
 * Inserts a child node or JSX.Element into the parent node at the specified position.
 * @param {Node} parent The parent node
 * @param {AnyNode} child The child node or JSX.Element
 * @param {AnyNode | null} before The node before which the new child should be inserted
 */
export function insertNode(parent: Node, child: AnyNode, before?: AnyNode | null): void {
  const beforeNode = before ? (isComponent(before) ? before.firstChild : (before as Node)) : null;

  if (isComponent(child)) {
    child.mount(parent, beforeNode);
    return;
  }

  if (isHydrating()) {
    return;
  }

  if (beforeNode) {
    parent.insertBefore(child as Node, beforeNode);
  } else {
    parent.appendChild(child as Node);
  }
}

/**
 * Removes a child node or JSX.Element from the parent node.
 * @param {AnyNode} child The child node or JSX.Element
 */
export function removeChild(child: AnyNode): void {
  if (isComponent(child)) {
    child.destroy();
  } else {
    const element = child as Element;
    if (element.parentElement) {
      element.remove();
    }
  }
}

/**
 * Replaces a child node or JSX.Element in the parent node.
 * @param {Node} parent The parent node
 * @param {AnyNode} node The new node or JSX.Element
 * @param {AnyNode} child The old node or JSX.Element
 */
export function replaceChild(parent: Node, node: AnyNode, child: AnyNode): void {
  // Preserve old node's internal key for stability in subsequent operations
  if (NODE_KEYS.has(child) && !NODE_KEYS.has(node)) {
    NODE_KEYS.set(node, NODE_KEYS.get(child)!);
  }

  insertNode(parent, node, child as Node);
  removeChild(child);
}
