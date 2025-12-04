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
 * General-purpose keyed children patching
 * Optimized with Map for O(1) lookups (from For component)
 * And LIS for minimal moves (from Vue 3)
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

  // ===== STEP 1: Sync from start =====
  while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
    const oldNode = oldChildren[oldStartIdx];
    const newNode = newChildren[newStartIdx];

    if (!oldNode) {
      oldStartIdx++;
      continue;
    }

    if (isSameNode(oldNode, newNode)) {
      patch(parent, oldNode, newNode);
      newChildren[newStartIdx] = oldNode;
      oldStartIdx++;
      newStartIdx++;
    } else {
      break;
    }
  }

  // ===== STEP 2: Sync from end =====
  while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
    const oldNode = oldChildren[oldEndIdx];
    const newNode = newChildren[newEndIdx];

    if (!oldNode) {
      oldEndIdx--;
      continue;
    }

    if (isSameNode(oldNode, newNode)) {
      patch(parent, oldNode, newNode);
      newChildren[newEndIdx] = oldNode;
      oldEndIdx--;
      newEndIdx--;
    } else {
      break;
    }
  }

  // ===== STEP 3: Mount remaining new nodes =====
  if (oldStartIdx > oldEndIdx) {
    if (newStartIdx <= newEndIdx) {
      const anchorNode =
        newEndIdx + 1 < newChildren.length ? getFirstDOMNode(newChildren[newEndIdx + 1]) : anchor;

      for (let i = newStartIdx; i <= newEndIdx; i++) {
        insertNode(parent, newChildren[i], anchorNode);
      }
    }
    return newChildren;
  }

  // ===== STEP 4: Unmount remaining old nodes =====
  if (newStartIdx > newEndIdx) {
    for (let i = oldStartIdx; i <= oldEndIdx; i++) {
      if (oldChildren[i]) {
        removeNode(oldChildren[i]);
      }
    }
    return newChildren;
  }

  // ===== STEP 5: Handle unknown sequence with Map + LIS =====
  const newLength = newEndIdx - newStartIdx + 1;

  // Build Map for O(1) lookups (technique from For component)
  const oldNodeMap = new Map<any, number>();
  for (let i = oldStartIdx; i <= oldEndIdx; i++) {
    const node = oldChildren[i];
    if (node) {
      const key = getNodeKey(node);
      // Map by key if available, otherwise by node itself
      oldNodeMap.set(key !== undefined ? key : node, i);
    }
  }

  // Track which old nodes to keep/move
  const newIndexToOldIndexMap = new Int32Array(newLength);
  let moved = false;
  let maxNewIndexSoFar = 0;

  // Process new children
  for (let i = 0; i < newLength; i++) {
    const newNode = newChildren[newStartIdx + i];
    const key = getNodeKey(newNode);
    const lookupKey = key !== undefined ? key : newNode;
    const oldIndex = oldNodeMap.get(lookupKey);

    if (oldIndex !== undefined) {
      // Found matching old node
      const oldNode = oldChildren[oldIndex];
      patch(parent, oldNode, newNode);
      newChildren[newStartIdx + i] = oldNode;

      // Mark as used
      newIndexToOldIndexMap[i] = oldIndex + 1; // +1 to distinguish from 0
      oldNodeMap.delete(lookupKey);

      // Detect if moved
      if (oldIndex < maxNewIndexSoFar) {
        moved = true;
      } else {
        maxNewIndexSoFar = oldIndex;
      }
    }
    // else: new node, will be mounted later
  }

  // Remove unused old nodes
  for (const oldIndex of oldNodeMap.values()) {
    if (oldChildren[oldIndex]) {
      removeNode(oldChildren[oldIndex]);
    }
  }

  // ===== STEP 6: Move/Mount nodes using LIS =====
  const increasingNewIndexSequence = moved ? getSequence(newIndexToOldIndexMap) : [];
  let j = increasingNewIndexSequence.length - 1;

  // Loop backwards for correct anchor
  for (let i = newLength - 1; i >= 0; i--) {
    const nextIndex = newStartIdx + i;
    const nextNode = newChildren[nextIndex];
    const nextAnchor =
      nextIndex + 1 < newChildren.length ? getFirstDOMNode(newChildren[nextIndex + 1]) : anchor;

    if (newIndexToOldIndexMap[i] === 0) {
      // New node - mount it
      insertNode(parent, nextNode, nextAnchor);
    } else if (moved) {
      // Existing node - move if needed
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

  return newChildren;
}

/**
 * Compute Longest Increasing Subsequence (LIS)
 * Optimized implementation for determining minimal moves
 *
 * @param arr - Array where arr[i] is the old index + 1 (0 means new node)
 * @returns Indices forming the LIS
 */
function getSequence(arr: Int32Array | number[]): number[] {
  const n = arr.length;

  // Fast path for very small arrays
  if (n <= 1) return n === 1 && arr[0] !== 0 ? [0] : [];
  if (n === 2) {
    if (arr[0] === 0) return arr[1] !== 0 ? [1] : [];
    if (arr[1] === 0) return [0];
    return arr[0] < arr[1] ? [0, 1] : [1];
  }

  // Binary search based LIS for larger arrays
  const p = new Int32Array(n); // Predecessor indices
  const result: number[] = []; // Indices of LIS
  let len = 0;

  for (let i = 0; i < n; i++) {
    if (arr[i] === 0) continue; // Skip new nodes

    const arrI = arr[i];

    if (len === 0 || arrI > arr[result[len - 1]]) {
      // Extend sequence
      p[i] = len > 0 ? result[len - 1] : -1;
      result[len++] = i;
    } else {
      // Binary search for position
      let left = 0;
      let right = len - 1;

      while (left < right) {
        const mid = (left + right) >> 1;
        if (arr[result[mid]] < arrI) {
          left = mid + 1;
        } else {
          right = mid;
        }
      }

      // Replace
      if (arrI < arr[result[left]]) {
        if (left > 0) {
          p[i] = result[left - 1];
        }
        result[left] = i;
      }
    }
  }

  // Backtrack to build LIS
  let u = len;
  let v = result[len - 1];

  while (u-- > 0) {
    result[u] = v;
    v = p[v];
  }

  result.length = len;
  return result;
}
