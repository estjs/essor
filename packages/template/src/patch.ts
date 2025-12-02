import { warn } from '@estjs/shared';
import { isComponent } from './component';
import { getNodeKey, isSameNodeType, setNodeKey } from './key';
import type { AnyNode } from './types';

/**
 * Gets the first DOM node from a node or component
 * Inline helper for performance in hot paths
 */
function getFirstDOMNode(node: AnyNode): Node | null {
  if (!node) {
    return null;
  }

  if (isComponent(node)) {
    return node.firstChild;
  }

  return node;
}

/**
 * Inserts a child node into the parent at the specified position
 *
 * @param parent - The parent node
 * @param child - The child node or component to insert
 * @param before - The reference node to insert before (optional)
 */
export function insertNode(parent: Node, child: AnyNode, before?: AnyNode | null): void {
  const beforeNode = before ? (isComponent(before) ? before.firstChild : (before as Node)) : null;

  if (isComponent(child)) {
    child.mount(parent, beforeNode);
    return;
  }

  if (!child) {
    if (__DEV__) {
      warn('child is null');
    }
    return;
  }

  if (beforeNode) {
    parent.insertBefore(child as Node, beforeNode);
  } else {
    parent.appendChild(child as Node);
  }
}

/**
 * Removes a child node or component
 *
 * @param child - The child node or component to remove
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
 * Replaces a child node with a new node
 *
 * @param parent - The parent node
 * @param newNode - The new node or component
 * @param oldNode - The old node or component to replace
 */
export function replaceChild(parent: Node, newNode: AnyNode, oldNode: AnyNode): void {
  if (newNode === oldNode) {
    return;
  }

  insertNode(parent, newNode, oldNode as Node);
  removeChild(oldNode);
}

/**
 * Check if two nodes are the same (inline for performance)
 * This combines key check and type check
 */
function isSameNode(a: AnyNode, b: AnyNode): boolean {
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
 * Transfer key from old node to new node if new node doesn't have one
 */
function transferKey(oldNode: AnyNode, newNode: AnyNode): void {
  if (isComponent(oldNode) || isComponent(newNode)) {
    return;
  }

  const oldKey = getNodeKey(oldNode);
  const newKey = getNodeKey(newNode);

  if (oldKey && !newKey) {
    setNodeKey(newNode, oldKey);
  }
}

/**
 * Patches a single node, updating it if possible or replacing it
 *
 * @param parent - The parent node
 * @param oldNode - The old node
 * @param newNode - The new node
 * @returns The patched node (reused old node or new node)
 */
export function patch(parent: Node, oldNode: AnyNode, newNode: AnyNode): AnyNode {
  if (oldNode === newNode) {
    return oldNode;
  }

  // Handle text nodes
  if (oldNode instanceof Text && newNode instanceof Text) {
    if (oldNode.textContent !== newNode.textContent) {
      oldNode.textContent = newNode.textContent;
    }
    transferKey(oldNode, newNode);
    return oldNode;
  }

  // Handle component instances
  if (isComponent(oldNode) && isComponent(newNode)) {
    if (oldNode.component === newNode.component) {
      return newNode.update(oldNode);
    }
  }

  // Different types, replace
  replaceChild(parent, newNode, oldNode);
  return newNode;
}

/**
 * Main entry point for patching children (Map-based API)
 * Converts between Map-based and Array-based APIs
 *
 * @param parent - The parent DOM node
 * @param childrenMap - Map of current children keyed by their keys
 * @param nextChildren - Array of new children to patch
 * @param before - Optional anchor node
 * @returns Updated map of children
 */
export function patchNodes(
  parent: Node,
  childrenMap: Array<AnyNode>,
  nextChildren: AnyNode[],
  before?: Node,
): Map<string, AnyNode> {
  // Call the optimized array-based patching
  const resultArray = patchChildrenArray(parent, childrenMap, nextChildren, before);

  // Convert result back to Map using actual node keys
  const resultMap = new Map<string, AnyNode>();
  for (const child of resultArray) {
    const key = getKey(child, resultArray.indexOf(child));
    resultMap.set(key, child);
  }

  return resultMap;
}

/**
 * Array-based patching (used by binding.ts for compatibility)
 * Alias for patchChildrenArray
 */
export function patchChildren(
  parent: Node,
  oldChildren: AnyNode[] | Map<string, AnyNode>,
  newChildren: AnyNode[],
  anchor?: Node,
): Map<string, AnyNode> | AnyNode[] {
  // Support both Map and Array inputs for compatibility
  if (oldChildren instanceof Map) {
    return patchNodes(parent, oldChildren, newChildren, anchor);
  }
  return patchChildrenArray(parent, oldChildren, newChildren, anchor);
}

/**
 * Optimized children patching algorithm with multiple fast paths
 * Based on Vue 3's approach with additional optimizations
 *
 * @param parent - The parent DOM node
 * @param oldChildren - Array of current children
 * @param newChildren - Array of new children
 * @param anchor - Optional anchor node for insertions
 * @returns Patched array of children
 */
function patchChildrenArray(
  parent: Node,
  oldChildren: AnyNode[],
  newChildren: AnyNode[],
  anchor?: Node | null,
): AnyNode[] {
  const oldLength = oldChildren.length;
  const newLength = newChildren.length;

  // Fast path: No children (empty state)
  if (oldLength === 0 && newLength === 0) {
    return [];
  }

  // Fast path: Only mounting new children (no old children)
  if (oldLength === 0) {
    if (newLength > 0) {
      const fragment = document.createDocumentFragment();
      for (let i = 0; i < newLength; i++) {
        insertNode(fragment, newChildren[i]);
      }
      insertNode(parent, fragment, anchor);
    }
    return newChildren;
  }

  // Fast path: No new children (unmount all)
  if (newLength === 0) {
    for (let i = 0; i < oldLength; i++) {
      removeChild(oldChildren[i]);
    }
    return [];
  }

  // Fast path: Single child update (most common case)
  if (oldLength === 1 && newLength === 1) {
    const oldNode = oldChildren[0];
    const newNode = newChildren[0];
    if (isSameNode(oldNode, newNode)) {
      patch(parent, oldNode, newNode);
      newChildren[0] = oldNode;
    } else {
      replaceChild(parent, newNode, oldNode);
    }
    return newChildren;
  }

  // Fast path: 2 children (very common in practice)
  if (oldLength === 2 && newLength === 2) {
    const o0 = oldChildren[0];
    const o1 = oldChildren[1];
    const n0 = newChildren[0];
    const n1 = newChildren[1];

    // Case 1: Both match in order
    if (isSameNode(o0, n0) && isSameNode(o1, n1)) {
      patch(parent, o0, n0);
      patch(parent, o1, n1);
      newChildren[0] = o0;
      newChildren[1] = o1;
      return newChildren;
    }

    // Case 2: Swapped
    if (isSameNode(o0, n1) && isSameNode(o1, n0)) {
      patch(parent, o0, n1);
      patch(parent, o1, n0);
      // Move o1 before o0
      const dom1 = getFirstDOMNode(o1);
      const dom0 = getFirstDOMNode(o0);
      if (dom1 && dom0 && dom1.parentNode === parent) {
        parent.insertBefore(dom1, dom0);
      }
      newChildren[0] = o1;
      newChildren[1] = o0;
      return newChildren;
    }

    // Fallback to general algorithm
  }

  // Fast path: 3-4 children (common in lists)
  if (oldLength >= 3 && oldLength <= 4 && newLength >= 3 && newLength <= 4) {
    return patchSmallList(parent, oldChildren, newChildren, anchor);
  }

  return patchKeyedChildren(parent, oldChildren, newChildren, anchor);
}

/**
 * Optimized patching for small lists (3-4 items)
 * Uses simpler O(n²) algorithm which is faster for small n
 */
function patchSmallList(
  parent: Node,
  oldChildren: AnyNode[],
  newChildren: AnyNode[],
  anchor?: Node | null,
): AnyNode[] {
  const oldLength = oldChildren.length;
  const newLength = newChildren.length;

  // Use object for faster lookup than Map for small sizes
  const oldKeyMap: Record<string, number> = Object.create(null);

  // Build old key map
  for (let i = 0; i < oldLength; i++) {
    const key = getNodeKey(oldChildren[i]);
    if (key !== undefined) {
      oldKeyMap[key] = i;
    }
  }

  const used = new Array(oldLength).fill(false);
  const result: AnyNode[] = new Array(newLength);

  // Match and patch
  for (let i = 0; i < newLength; i++) {
    const newNode = newChildren[i];
    const key = getNodeKey(newNode);
    let matched = false;

    if (key !== undefined && key in oldKeyMap) {
      const oldIdx = oldKeyMap[key];
      const oldNode = oldChildren[oldIdx];
      if (isSameNode(oldNode, newNode) && !used[oldIdx]) {
        patch(parent, oldNode, newNode);
        result[i] = oldNode;
        used[oldIdx] = true;
        matched = true;
      }
    }

    if (!matched) {
      // Try type match for unkeyed nodes
      for (let j = 0; j < oldLength; j++) {
        if (!used[j] && isSameNodeType(oldChildren[j], newNode)) {
          patch(parent, oldChildren[j], newNode);
          result[i] = oldChildren[j];
          used[j] = true;
          matched = true;
          break;
        }
      }
    }

    if (!matched) {
      result[i] = newNode;
    }
  }

  // Remove unused old nodes
  for (let i = 0; i < oldLength; i++) {
    if (!used[i]) {
      removeChild(oldChildren[i]);
    }
  }

  // Reorder and mount new nodes
  for (let i = newLength - 1; i >= 0; i--) {
    const node = result[i];
    const nextNode = i + 1 < newLength ? getFirstDOMNode(result[i + 1]) : anchor;

    if (node === newChildren[i]) {
      // New node, mount it
      insertNode(parent, node, nextNode);
    } else {
      // Existing node, move if needed
      const domNode = getFirstDOMNode(node);
      if (domNode && domNode.nextSibling !== (nextNode || null) && domNode.parentNode === parent) {
        insertNode(parent, domNode, nextNode);
      }
    }
  }

  return result;
}

/**
 * General-purpose keyed children patching using optimized diff algorithm
 * Implements Vue 3's algorithm with LIS optimization
 */
function patchKeyedChildren(
  parent: Node,
  oldChildren: AnyNode[],
  newChildren: AnyNode[],
  anchor?: Node | null,
): AnyNode[] {
  let oldStartIdx = 0;
  let newStartIdx = 0;
  let oldEndIdx = oldChildren.length - 1;
  let newEndIdx = newChildren.length - 1;

  let oldStartNode = oldChildren[0];
  let oldEndNode = oldChildren[oldEndIdx];
  let newStartNode = newChildren[0];
  let newEndNode = newChildren[newEndIdx];

  // 1. Sync from start - inlined comparison
  while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
    if (!oldStartNode) {
      oldStartNode = oldChildren[++oldStartIdx];
    } else if (!oldEndNode) {
      oldEndNode = oldChildren[--oldEndIdx];
    } else if (isSameNode(oldStartNode, newStartNode)) {
      patch(parent, oldStartNode, newStartNode);
      newChildren[newStartIdx] = oldStartNode;
      oldStartNode = oldChildren[++oldStartIdx];
      newStartNode = newChildren[++newStartIdx];
    } else {
      break;
    }
  }

  // 2. Sync from end - inlined comparison
  while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
    if (!oldStartNode) {
      oldStartNode = oldChildren[++oldStartIdx];
    } else if (!oldEndNode) {
      oldEndNode = oldChildren[--oldEndIdx];
    } else if (isSameNode(oldEndNode, newEndNode)) {
      patch(parent, oldEndNode, newEndNode);
      newChildren[newEndIdx] = oldEndNode;
      oldEndNode = oldChildren[--oldEndIdx];
      newEndNode = newChildren[--newEndIdx];
    } else {
      break;
    }
  }

  // 3. Common sequence + mount
  if (oldStartIdx > oldEndIdx) {
    if (newStartIdx <= newEndIdx) {
      const anchorNode =
        newEndIdx + 1 < newChildren.length ? getFirstDOMNode(newChildren[newEndIdx + 1]) : anchor;

      for (let i = newStartIdx; i <= newEndIdx; i++) {
        insertNode(parent, newChildren[i], anchorNode);
      }
    }
  }
  // 4. Common sequence + unmount
  else if (newStartIdx > newEndIdx) {
    for (let i = oldStartIdx; i <= oldEndIdx; i++) {
      if (oldChildren[i]) {
        removeChild(oldChildren[i]);
      }
    }
  }
  // 5. Unknown sequence - use optimized LIS
  else {
    patchUnknownSequence(
      parent,
      oldChildren,
      newChildren,
      oldStartIdx,
      oldEndIdx,
      newStartIdx,
      newEndIdx,
      anchor,
    );
  }

  return newChildren;
}

/**
 * Patch unknown sequence with optimized LIS (Longest Increasing Subsequence)
 * Uses Object instead of Map for better performance on string keys
 */
function patchUnknownSequence(
  parent: Node,
  oldChildren: AnyNode[],
  newChildren: AnyNode[],
  oldStartIdx: number,
  oldEndIdx: number,
  newStartIdx: number,
  newEndIdx: number,
  anchor?: Node | null,
): void {
  const newLength = newEndIdx - newStartIdx + 1;

  // Use Object literal instead of Map for faster lookup
  const keyToNewIndexMap: Record<string, number> = Object.create(null);

  for (let i = newStartIdx; i <= newEndIdx; i++) {
    const key = getNodeKey(newChildren[i]);
    if (key !== undefined) {
      keyToNewIndexMap[key] = i;
    }
  }

  // Use Int32Array for better performance
  const newIndexToOldIndexMap = new Int32Array(newLength);
  let moved = false;
  let maxNewIndexSoFar = 0;
  let patched = 0;

  for (let i = oldStartIdx; i <= oldEndIdx; i++) {
    const oldNode = oldChildren[i];
    if (!oldNode) continue;

    if (patched >= newLength) {
      removeChild(oldNode);
      continue;
    }

    let newIndex: number | undefined;
    const oldKey = getNodeKey(oldNode);

    // Object property access is faster than Map.get
    if (oldKey !== undefined && oldKey in keyToNewIndexMap) {
      newIndex = keyToNewIndexMap[oldKey];
    } else {
      // Fallback: type-based matching
      for (let j = newStartIdx; j <= newEndIdx; j++) {
        const newKey = getNodeKey(newChildren[j]);
        if (
          newIndexToOldIndexMap[j - newStartIdx] === 0 &&
          oldKey === undefined &&
          newKey === undefined &&
          isSameNodeType(oldNode, newChildren[j])
        ) {
          newIndex = j;
          break;
        }
      }
    }

    if (newIndex === undefined) {
      removeChild(oldNode);
    } else {
      newIndexToOldIndexMap[newIndex - newStartIdx] = i + 1;

      if (newIndex >= maxNewIndexSoFar) {
        maxNewIndexSoFar = newIndex;
      } else {
        moved = true;
      }

      patch(parent, oldNode, newChildren[newIndex]);
      newChildren[newIndex] = oldNode;
      patched++;
    }
  }

  // Move and mount nodes
  const increasingNewIndexSequence = moved ? getSequence(newIndexToOldIndexMap) : [];
  let j = increasingNewIndexSequence.length - 1;

  // Loop backwards to ensure correct anchor
  for (let i = newLength - 1; i >= 0; i--) {
    const nextIndex = newStartIdx + i;
    const nextNode = newChildren[nextIndex];
    const nextAnchor =
      nextIndex + 1 < newChildren.length ? getFirstDOMNode(newChildren[nextIndex + 1]) : anchor;

    if (newIndexToOldIndexMap[i] === 0) {
      insertNode(parent, nextNode, nextAnchor);
    } else if (moved) {
      if (j < 0 || i !== increasingNewIndexSequence[j]) {
        const domNode = getFirstDOMNode(nextNode);
        if (domNode && domNode.parentNode === parent) {
          insertNode(parent, domNode, nextAnchor);
        }
      } else {
        j--;
      }
    }
  }
}

/**
 * Compute the Longest Increasing Subsequence (LIS)
 * Optimized with fast path for small arrays
 * For n < 10, simple algorithm is actually faster
 */
export function getSequence(arr: Int32Array | number[]): number[] {
  const len = arr.length;
  if (len === 0) return [];
  if (len === 1) return arr[0] !== 0 ? [0] : [];

  // Fast path for very small arrays (< 10)
  if (len < 10) {
    return getSequenceSimple(arr);
  }

  const result: number[] = [0];
  const p = new Int32Array(len);

  let i: number;
  let j: number;
  let u: number;
  let v: number;
  let c: number;

  for (i = 0; i < len; i++) {
    const arrI = arr[i];
    if (arrI !== 0) {
      j = result[result.length - 1];
      if (arr[j] < arrI) {
        p[i] = j;
        result.push(i);
        continue;
      }

      u = 0;
      v = result.length - 1;

      // Binary search
      while (u < v) {
        c = (u + v) >> 1;
        if (arr[result[c]] < arrI) {
          u = c + 1;
        } else {
          v = c;
        }
      }

      if (arrI < arr[result[u]]) {
        if (u > 0) {
          p[i] = result[u - 1];
        }
        result[u] = i;
      }
    }
  }

  u = result.length;
  v = result[u - 1];

  while (u-- > 0) {
    result[u] = v;
    v = p[v];
  }

  return result;
}

/**
 * Simple O(n²) LIS for small arrays
 * Faster than binary search for n < 10
 */
function getSequenceSimple(arr: Int32Array | number[]): number[] {
  const len = arr.length;
  const dp: number[] = [];
  const parent: number[] = new Array(len).fill(-1);

  for (let i = 0; i < len; i++) {
    if (arr[i] === 0) continue;

    let maxLen = 0;
    let maxIdx = -1;

    for (let j = 0; j < i; j++) {
      if (arr[j] !== 0 && arr[j] < arr[i] && (dp[j] || 0) > maxLen) {
        maxLen = dp[j] || 0;
        maxIdx = j;
      }
    }

    dp[i] = maxLen + 1;
    parent[i] = maxIdx;
  }

  // Find max length
  let maxLen = 0;
  let maxIdx = -1;
  for (let i = 0; i < len; i++) {
    if ((dp[i] || 0) > maxLen) {
      maxLen = dp[i] || 0;
      maxIdx = i;
    }
  }

  // Backtrack
  const result: number[] = [];
  let curr = maxIdx;
  while (curr !== -1) {
    result.unshift(curr);
    curr = parent[curr];
  }

  return result;
}

/**
 * Maps an array of children to a Map, using their keys as identifiers
 * Legacy compatibility function
 *
 * @param children - The array of children to map
 * @returns A Map of children, keyed by their unique identifiers
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
 * Delegates to getNodeKey from key.ts and provides index-based fallback
 *
 * @param node - The node to get key for
 * @param index - The index of the node (used as fallback)
 * @returns The unique key for the node
 */
export function getKey(node: AnyNode, index: number = 0): string {
  const existingKey = getNodeKey(node);
  if (existingKey !== undefined) {
    return existingKey;
  }

  // Fallback to special index-based key format
  return `$$_auto_empty_${index}`;
}
