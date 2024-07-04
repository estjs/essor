import { insertChild, removeChild, replaceChild } from './utils';
import { isJsxElement } from './template';

type AnyNode = Node | JSX.Element;

export function patchChildren(
  parent: Node,
  childrenMap: Map<string, AnyNode>,
  nextChildren: AnyNode[],
  before: Node | null,
): Map<string, AnyNode> {
  const result = new Map<string, AnyNode>();
  // use arrays instead of iterators to improve access speeds
  const children = Array.from(childrenMap.values());
  const childrenLength = children.length;

  if (childrenMap.size > 0 && nextChildren.length === 0) {
    if (parent.childNodes.length === childrenLength + (before ? 1 : 0)) {
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
    return result;
  }

  const replaces: [Comment, AnyNode][] = [];
  const nextChildrenMap = mapKeys(nextChildren);

  // Use childIndex to keep track of the currently processed child node to avoid unnecessary repeated visits.
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
      } else if (currChild) {
        const placeholder = document.createComment('');
        insertChild(parent, placeholder, currChild);
        replaces.push([placeholder, child]);
      } else {
        insertChild(parent, child, before);
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

function patch(parent: Node, node: AnyNode, next: AnyNode): AnyNode {
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

export function getKey(node, index): string {
  const id = node instanceof Element ? node.id : undefined;
  const result = id === '' ? undefined : id;
  return result ?? `_$${index}$`;
}
