import { isJsxElement } from './factory';
import { insertChild, removeChild, replaceChild } from './utils';
import type { AnyNode } from '../types';

export function patchChildren(
  parent: Node,
  currentChildren: Map<string, AnyNode>,
  nextChildren: AnyNode[],
  before: Node | null,
): Map<string, AnyNode> {
  const result = new Map<string, AnyNode>();
  const children = Array.from(currentChildren.values());

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

    while (currChild && !nextChildrenMap.has(currKey)) {
      removeChild(currChild);
      currentChildren.delete(currKey);
      currChild = children[++childIndex];
      currKey = getKey(currChild, i);
    }

    const key = getKey(child, i);
    const origChild = currentChildren.get(key);

    if (origChild) {
      child = diffNode(parent, origChild, child);
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

  currentChildren.forEach((child, key) => {
    if ((child as any).isConnected && !result.has(key)) {
      removeChild(child);
    }
  });

  return result;
}

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

function diffNode(parent: Node, node: AnyNode, next: AnyNode): AnyNode {
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
