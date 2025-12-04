import { isComponent } from './component';
import { getNodeKey, setNodeKey } from './key';
import {
  getFirstDOMNode,
  insertNode,
  isHTMLNode,
  isSameNode,
  removeNode,
  replaceNode,
} from './utils';
import type { AnyNode } from './types';

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
  if (newNode === oldNode) {
    return oldNode;
  }
  if (isHTMLNode(newNode) && isHTMLNode(oldNode)) {
    if (newNode.isEqualNode(oldNode)) {
      return oldNode;
    }
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
  replaceNode(parent, newNode, oldNode);
  return newNode;
}

/**
 * Unified children patching with Map-based diffing and LIS optimization
 * Combines best practices from For component and Vue 3 algorithm
 *
 * @param parent - The parent DOM node
 * @param oldChildren - Array of current children
 * @param newChildren - Array of new children
 * @param anchor - Optional anchor node for insertions
 * @returns Patched array of children
 */
export function patchChildren(
  parent: Node,
  oldChildren: AnyNode[] | Map<string, AnyNode>,
  newChildren: AnyNode[],
  anchor?: Node,
): AnyNode[] {
  // Convert Map to Array if needed
  const oldArr = Array.isArray(oldChildren) ? oldChildren : Array.from(oldChildren.values());

  const oldLength = oldArr.length;
  const newLength = newChildren.length;

  // ===== FAST PATH 0: Both empty =====
  if (oldLength === 0 && newLength === 0) {
    return [];
  }

  // ===== FAST PATH 1: Mount all (no old children) =====
  if (oldLength === 0) {
    // Batch insert using DocumentFragment for better performance
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < newLength; i++) {
      insertNode(fragment, newChildren[i]);
    }
    insertNode(parent, fragment, anchor);
    return newChildren;
  }

  // ===== FAST PATH 2: Unmount all (no new children) =====
  if (newLength === 0) {
    for (let i = 0; i < oldLength; i++) {
      removeNode(oldArr[i]);
    }
    return [];
  }

  // ===== FAST PATH 3: Single child =====
  if (oldLength === 1 && newLength === 1) {
    const oldNode = oldArr[0];
    const newNode = newChildren[0];
    if (isSameNode(oldNode, newNode)) {
      patch(parent, oldNode, newNode);
      newChildren[0] = oldNode;
    } else {
      replaceNode(parent, newNode, oldNode);
    }
    return newChildren;
  }

  // ===== FAST PATH 4: Two children =====
  if (oldLength === 2 && newLength === 2) {
    const o0 = oldArr[0];
    const o1 = oldArr[1];
    const n0 = newChildren[0];
    const n1 = newChildren[1];

    // Same order
    if (isSameNode(o0, n0) && isSameNode(o1, n1)) {
      patch(parent, o0, n0);
      patch(parent, o1, n1);
      newChildren[0] = o0;
      newChildren[1] = o1;
      return newChildren;
    }

    // Swapped
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
  }

  // ===== GENERAL ALGORITHM: Map-based diffing with LIS =====
  return patchKeyedChildren(parent, oldArr, newChildren, anchor);
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
        removeNode(oldChildren[i]);
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
      removeNode(oldNode);
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
          isSameNode(oldNode, newChildren[j])
        ) {
          newIndex = j;
          break;
        }
      }
    }

    if (newIndex === undefined) {
      removeNode(oldNode);
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
