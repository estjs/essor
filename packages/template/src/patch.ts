import { insertChild, removeChild, replaceChild } from './utils';
import { isJsxElement } from './jsx-renderer';

type AnyNode = Node | JSX.Element;

export function patchChildren(
  parent: Node,
  childrenMap: Map<string, AnyNode>,
  nextChildren: AnyNode[],
  before: Node | null,
): Map<string, AnyNode> {
  const result = new Map<string, AnyNode>();
  const children = Array.from(childrenMap.values());

  if (childrenMap.size > 0 && nextChildren.length === 0) {
    clearChildren(parent, children, before);
    return result;
  }

  const replaces: [Comment, AnyNode][] = [];
  const nextChildrenMap = mapKeys(nextChildren);
  let childIndex = 0;

  for (let [i, child] of nextChildren.entries()) {
    let currChild = children[childIndex];
    let currKey = getKey(currChild, i);

    while (currChild && !nextChildrenMap.has(currKey)) {
      removeChild(currChild);
      childrenMap.delete(currKey);
      currChild = children[++childIndex];
      currKey = getKey(currChild, i);
    }

    const key = getKey(child, i);
    const origChild = childrenMap.get(key);

    if (origChild) {
      child = patch(parent, origChild, child);
    }

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

  replaces.forEach(([placeholder, child]) => replaceChild(parent, child, placeholder));

  childrenMap.forEach((child, key) => {
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
export function clearChildren(parent: Node, children: AnyNode[], before: Node | null) {
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
 * Compare two nodes and update the first node to be the same as the second node.
 * @param parent The parent node of the first node.
 * @param node The first node.
 * @param next The second node.
 * @returns The updated first node.
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

export function mapKeys(children: AnyNode[]): Map<string, AnyNode> {
  const result = new Map();
  for (const [i, child] of children.entries()) {
    const key = getKey(child, i);
    result.set(key, child);
  }
  return result;
}
export function getKey(node: AnyNode, index: number): string {
  if (isJsxElement(node)) {
    // use jsx key
    const jsxKey = (node as any).key;
    if (jsxKey !== undefined && jsxKey !== null) {
      return String(jsxKey);
    }
  }

  // use index
  return `_$${index}$`;
}
