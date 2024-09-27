import { insertChild, removeChild, replaceChild } from './utils';
import { isJsxElement } from './jsx-renderer';
import type { AnyNode } from '../types';

/**
 * Patch the children of the parent node.
 * @param parent The parent node.
 * @param currentChildren The current children map.
 * @param nextChildren The next children array.
 * @param before The node before which the children should be inserted.
 * @returns The new children map after patching.
 */

export function patchChildren(
  parent: Node,
  currentChildren: Map<string, AnyNode>,
  nextChildren: AnyNode[],
  before: Node | null,
): Map<string, AnyNode> {
  const result = new Map<string, AnyNode>();
  const children = Array.from(currentChildren.values());

  // clear parent when nextChildren is empty and childrenMap has elements
  if (currentChildren.size > 0 && nextChildren.length === 0) {
    clearChildren(parent, children, before);
    return result;
  }

  const replaces: [Comment, AnyNode][] = [];
  const nextChildrenMap = mapKeys(nextChildren);
  let childIndex = 0;

  for (let [i, child] of nextChildren.entries()) {
    let currChild = children[childIndex];
    let currKey = getKey(currChild, i);

    // if current child is not in next children, remove it
    while (currChild && !nextChildrenMap.has(currKey)) {
      removeChild(currChild);
      currentChildren.delete(currKey);
      currChild = children[++childIndex];
      currKey = getKey(currChild, i);
    }

    const key = getKey(child, i);
    const origChild = currentChildren.get(key);

    // if find equal key node,diff node
    if (origChild) {
      child = diffNode(parent, origChild, child);
    }

    if (currChild) {
      // equal node ,move on to the next one.
      if (currChild === origChild) {
        childIndex++;
      } else {
        // if not equal node, create comment and insert to parent
        const placeholder = document.createComment('');
        insertChild(parent, placeholder, currChild);
        // add replace
        replaces.push([placeholder, child]);
      }
    } else {
      // it not original node, insert to parent
      insertChild(parent, child, before);
    }

    result.set(key, child);
  }

  // replace comment to child
  replaces.forEach(([placeholder, child]) => replaceChild(parent, child, placeholder));

  // find need remove node
  currentChildren.forEach((child, key) => {
    if (child.isConnected && !result.has(key)) {
      removeChild(child);
    }
  });

  return result;
}

/**
 * Clear the children of the parent node.
 * @param parent The parent node.
 * @param children The children to be cleared.
 * @param before The node before which the children should be cleared.
 */
function clearChildren(parent: Node, children: AnyNode[], before: Node | null) {
  // if parent has same number of children, just clear
  if (parent.childNodes.length === children.length + (before ? 1 : 0)) {
    (parent as Element).innerHTML = '';
    // if parent has more children, insert before
    if (before) {
      insertChild(parent, before);
    }
  } else {
    // set in range,and all delete in range
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
  // clear jsx children
  children.forEach(node => {
    if (isJsxElement(node)) {
      node.unmount();
    }
  });
}

/**
 * Compare two nodes and update the first node to be the same as the second node.
 * @param parent The parent node of the first node.
 * @param node The first node.
 * @param next The second node.
 * @returns The updated first node.
 */
function diffNode(parent: Node, node: AnyNode, next: AnyNode): AnyNode {
  // equal node
  if (node === next) {
    return node;
  }
  // jsx element
  if (isJsxElement(node) && isJsxElement(next) && node.template === next.template) {
    next.inheritNode(node);
    return next;
  }
  // text node
  if (node instanceof Text && next instanceof Text) {
    if (node.textContent !== next.textContent) {
      node.textContent = next.textContent;
    }
    return node;
  }
  // insert node,and remove node
  replaceChild(parent, next, node);
  return next;
}

export function mapKeys(children: AnyNode[]): Map<string, AnyNode> {
  return new Map(children.map((child, i) => [getKey(child, i), child]));
}

export function getKey(node: AnyNode, index: number): string {
  if (isJsxElement(node)) {
    const jsxKey = (node as any).key;
    if (jsxKey != null) {
      return String(jsxKey);
    }
  }
  return `_$${index}$`;
}
