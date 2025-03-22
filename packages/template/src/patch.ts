import { isFalsy } from '@estjs/shared';
import { isComponent } from './renderer';
import { ComponentNode } from './componentNode';
import { isFragment } from './components';
import type { FragmentNode, NodeOrComponent } from './types';

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
  childrenMap: Map<string, NodeOrComponent>,
  nextChildren: NodeOrComponent[],
  before?: Node,
): Map<string, NodeOrComponent> {
  // Fast path optimization
  if (childrenMap.size === 0 && nextChildren.length > 0) {
    const fragment = document.createDocumentFragment();
    const result = new Map<string, NodeOrComponent>();

    nextChildren.forEach((child, i) => {
      const key = getKey(child, i);
      insertChild(fragment, child);
      result.set(key, child);
    });

    insertChild(parent, fragment, before);
    return result;
  }

  const result = new Map<string, NodeOrComponent>();
  const children = Array.from(childrenMap.values());

  // If there are no new children, clear all existing children
  if (children.length && nextChildren.length === 0) {
    clearChildren(parent, children, before);
    return result;
  }

  const replaces: [Comment, NodeOrComponent][] = [];
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

  // Replace placeholders with actual firstChild
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
function clearChildren(parent: Node, children: NodeOrComponent[], before?: Node) {
  if (parent.childNodes.length === children.length + (before ? 1 : 0)) {
    (parent as Element).textContent = '';
    if (before) {
      insertChild(parent, before);
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
export function patch(parent: Node, node: NodeOrComponent, next: NodeOrComponent): NodeOrComponent {
  if (node === next) {
    return node;
  }

  if (isFragment(next)) {
    const fragment = next as unknown as FragmentNode;
    Array.from(fragment.childNodes).forEach(child => {
      insertChild(parent, child as NodeOrComponent, node);
    });
    removeChild(node);
    return next;
  }

  if (isComponent(node) && isComponent(next) && node.component === next.component) {
    return next.update(node);
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
 * Maps an array of firstChild to a Map, using their keys as identifiers.
 *
 * @param children - The array of firstChild to map
 * @returns A Map of firstChild, keyed by their unique identifiers
 */
export function mapKeys(children: NodeOrComponent[]): Map<string, NodeOrComponent> {
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
export function getKey(node: NodeOrComponent, index: number): string {
  if (isComponent(node)) {
    const jsxKey = (node as any).key;
    if (jsxKey !== undefined && jsxKey !== null) {
      return String(jsxKey);
    }
  }
  return `_$${index}$`;
}

/**
 * Inserts a child node or JSX.Element into the parent node at the specified position.
 * @param parent The parent node
 * @param child The child node or JSX.Element
 * @param before The node before which the new child should be inserted
 */
export function insertChild(
  parent: Node,
  child: NodeOrComponent,
  before: NodeOrComponent | null = null,
): void {
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
}

/**
 * Removes a child node or JSX.Element from the parent node.
 * @param child The child node or JSX.Element
 */
export function removeChild(child: NodeOrComponent): void {
  if (isComponent(child)) {
    child.unmount();
  } else {
    const element = child as Element;
    if (element.parentElement) {
      element.remove();
    }
  }
}

/**
 * Replaces a child node or JSX.Element in the parent node.
 * @param parent The parent node
 * @param node The new node or JSX.Element
 * @param child The old node or JSX.Element
 */
export function replaceChild(parent: Node, node: NodeOrComponent, child: NodeOrComponent): void {
  insertChild(parent, node, child);
  removeChild(child);
}

/**
 * Coerces any data into a Node or JSX.Element type.
 * @param data The data to coerce
 * @returns Node or JSX.Element
 */
export function coerceNode(data: unknown): NodeOrComponent {
  if (data instanceof Node || data instanceof ComponentNode) {
    return data;
  }
  const text = isFalsy(data) ? '' : String(data);
  return document.createTextNode(text);
}
