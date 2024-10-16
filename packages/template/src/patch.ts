import { insertChild, removeChild, replaceChild } from './utils';
import { isJsxElement } from './jsx-renderer';

// Type alias for nodes that can be either DOM Node or JSX Element
type AnyNode = Node | JSX.Element;

/**
 * Patches children of a parent node with new children.
 * This function is responsible for efficiently updating the DOM to reflect changes in the virtual DOM.
 *
 * @param parent - The parent node whose children are being updated
 * @param childrenMap - A map of current children, keyed by their unique identifiers
 * @param nextChildren - An array of new children to be patched in
 * @param before - The node before which new children should be inserted (if any)
 * @returns A new map of children after patching
 */
export function patchChildren(
  parent: Node,
  childrenMap: Map<string, AnyNode>,
  nextChildren: AnyNode[],
  before: Node | null,
): Map<string, AnyNode> {
  const result = new Map<string, AnyNode>();
  const children = Array.from(childrenMap.values());

  // If there are no new children, clear all existing children
  if (children.length && nextChildren.length === 0) {
    clearChildren(parent, children, before);
    return result;
  }

  const replaces: [Comment, AnyNode][] = [];
  const nextChildrenMap = mapKeys(nextChildren);
  let childIndex = 0;

  // Iterate through new children and patch or insert as necessary
  for (let [i, child] of nextChildren.entries()) {
    let currChild = children[childIndex];
    let currKey = getKey(currChild, i);

    // Remove any current children that are not in the new children set
    while (currChild && !nextChildrenMap.has(currKey)) {
      removeChild(currChild);
      childrenMap.delete(currKey);
      currChild = children[++childIndex];
      currKey = getKey(currChild, i);
    }

    const key = getKey(child, i);
    const origChild = childrenMap.get(key);

    // If the child already exists, patch it
    if (origChild) {
      child = patch(parent, origChild, child);
    }

    // Handle insertion or replacement of children
    if (currChild) {
      if (currChild === origChild) {
        childIndex++;
      } else {
        const placeholder = document.createComment('');
        insertChild(parent, placeholder, currChild);
        replaces.push([placeholder, child]);
      }
    } else {
      insertChild(parent, child, before);
    }

    result.set(key, child);
  }

  // Replace placeholders with actual nodes
  replaces.forEach(([placeholder, child]) => {
    replaceChild(parent, child, placeholder);
  });

  // Remove any remaining children that weren't in the new set
  childrenMap.forEach((child, key) => {
    if (child.isConnected && !result.has(key)) {
      removeChild(child);
    }
  });

  return result;
}

/**
 * Clears all children from a parent node.
 *
 * @param parent - The parent node to clear children from
 * @param children - The array of children to be cleared
 * @param before - The node before which clearing should stop (if any)
 */
function clearChildren(parent: Node, children: AnyNode[], before: Node | null) {
  if (parent.childNodes.length === children.length + (before ? 1 : 0)) {
    (parent as Element).innerHTML = '';
    if (before) {
      insertChild(parent, before);
    }
  } else {
    const range = document.createRange();
    const child = children[0];
    const start = isJsxElement(child) ? child.firstChild : child;
    range.setStartBefore(start!);
    if (before) {
      range.setEndBefore(before);
    } else {
      range.setEndAfter(parent);
    }
    range.deleteContents();
  }
  children.forEach(node => {
    if (isJsxElement(node)) {
      node.unmount();
    }
  });
}

/**
 * Patches a single node, replacing it with a new node if necessary.
 *
 * @param parent - The parent node
 * @param node - The current node
 * @param next - The new node to patch with
 * @returns The patched node
 */
export function patch(parent: Node, node: AnyNode, next: AnyNode): AnyNode {
  if (node === next) {
    return node;
  }
  if (isJsxElement(node) && isJsxElement(next) && node.template === next.template) {
    next.inheritNode(node);
    return next;
  }
  if (node instanceof Text && next instanceof Text) {
    if (node.textContent !== next.textContent) {
      node.textContent = next.textContent;
    }
    return node;
  }
  replaceChild(parent, next, node);
  return next;
}

/**
 * Maps an array of nodes to a Map, using their keys as identifiers.
 *
 * @param children - The array of nodes to map
 * @returns A Map of nodes, keyed by their unique identifiers
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
 * Gets the key for a node, either from its 'key' property (if it's a JSX element)
 * or generates a key based on its index.
 *
 * @param node - The node to get the key for
 * @param index - The index of the node in its parent's children array
 * @returns A string key for the node
 */
export function getKey(node: AnyNode, index: number): string {
  if (isJsxElement(node)) {
    const jsxKey = (node as any).key;
    if (jsxKey !== undefined && jsxKey !== null) {
      return String(jsxKey);
    }
  }
  return `_$${index}$`;
}
