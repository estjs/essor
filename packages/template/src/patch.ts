import { isHTMLElement } from '@estjs/shared';
import { isComponent } from './component';
import { getNodeKey, setNodeKey } from './key';
import {
  getFirstDOMNode,
  insertNode,
  isHtmLTextElement,
  isSameNode,
  removeNode,
  replaceNode,
} from './utils';
import type { AnyNode } from './types';

/**
 * Transfer key from old node to new node if new node doesn't have one.
 * Skips component nodes as they manage their own keys.
 *
 * @param oldNode - Source node to transfer key from
 * @param newNode - Target node to receive key
 */
export function transferKey(oldNode: AnyNode, newNode: AnyNode): void {
  // Components manage their own keys, skip them
  if (isComponent(oldNode) || isComponent(newNode)) {
    return;
  }

  const oldKey = getNodeKey(oldNode);
  if (oldKey && !getNodeKey(newNode)) {
    setNodeKey(newNode, oldKey);
  }
}

/**
 * Patches a single node, updating it if possible or replacing it.
 * Optimized for common cases with early returns and minimal allocations.
 *
 * @param parent - The parent node
 * @param oldNode - The old node
 * @param newNode - The new node
 * @returns The patched node (reused old node or new node)
 */
export function patch(parent: Node, oldNode: AnyNode, newNode: AnyNode): AnyNode {
  // Fast path: same reference
  if (newNode === oldNode) {
    return oldNode;
  }

  // Cache type checks to avoid repeated function calls
  const oldIsElement = isHTMLElement(oldNode);
  const newIsElement = isHTMLElement(newNode);

  // Both are HTML elements - optimize attribute patching
  if (newIsElement && oldIsElement) {
    // Fast path: structurally equal nodes
    if (newNode.isEqualNode(oldNode)) {
      return oldNode;
    }

    // Patch attributes if tags are same
    if (oldNode.tagName === newNode.tagName) {
      // Iterate directly without creating intermediate arrays
      const oldAttrs = oldNode.attributes;
      const newAttrs = newNode.attributes;

      // Remove old attributes not in new (iterate backwards to handle live collection)
      for (let i = oldAttrs.length - 1; i >= 0; i--) {
        const attrName = oldAttrs[i].name;
        if (!newNode.hasAttribute(attrName)) {
          oldNode.removeAttribute(attrName);
        }
      }

      // Set new/changed attributes
      for (let i = 0, len = newAttrs.length; i < len; i++) {
        const attr = newAttrs[i];
        if (oldNode.getAttribute(attr.name) !== attr.value) {
          oldNode.setAttribute(attr.name, attr.value);
        }
      }

      transferKey(oldNode, newNode);
      return oldNode;
    }
  }

  // Handle text nodes
  if (isHtmLTextElement(oldNode) && isHtmLTextElement(newNode)) {
    if (oldNode.textContent !== newNode.textContent) {
      oldNode.textContent = newNode.textContent;
    }
    transferKey(oldNode, newNode);
    return oldNode;
  }

  // Handle component instances - cache isComponent results
  const oldIsComponent = isComponent(oldNode);
  const newIsComponent = isComponent(newNode);

  if (oldIsComponent && newIsComponent) {
    if (oldNode.component === newNode.component) {
      return newNode.update(oldNode);
    }
  }

  // Different types, replace
  replaceNode(parent, newNode, oldNode);
  return newNode;
}

/**
 * Unified children patching with Map-based diffing and LIS optimization.
 *
 * @param parent - The parent DOM node
 * @param oldChildren - Array of current children
 * @param newChildren - Array of new children
 * @param anchor - Optional anchor node for insertions
 * @returns Patched array of children
 */
export function patchChildren(
  parent: Node,
  oldChildren: AnyNode[],
  newChildren: AnyNode[],
  anchor?: Node,
): AnyNode[] {
  const oldLength = oldChildren.length;
  const newLength = newChildren.length;

  // ===== FAST PATH 0: Both empty =====
  if (oldLength === 0 && newLength === 0) {
    return [];
  }

  // ===== FAST PATH 1: Mount all (no old children) =====
  if (oldLength === 0) {
    for (let i = 0; i < newLength; i++) {
      insertNode(parent, newChildren[i], anchor);
    }
    return newChildren;
  }

  // ===== FAST PATH 2: Unmount all (no new children) =====
  if (newLength === 0) {
    // Remove all children efficiently
    for (let i = 0; i < oldLength; i++) {
      removeNode(oldChildren[i]);
    }
    return [];
  }

  // ===== FAST PATH 3: Single child =====
  if (oldLength === 1 && newLength === 1) {
    const oldNode = oldChildren[0];
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
    const o0 = oldChildren[0];
    const o1 = oldChildren[1];
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
  return patchKeyedChildren(parent, oldChildren, newChildren, anchor);
}

/**
 * General-purpose keyed children patching using optimized diff algorithm.
 *
 * @param parent - Parent DOM node
 * @param oldChildren - Old children array
 * @param newChildren - New children array
 * @param anchor - Optional anchor node
 * @returns Patched new children array
 */
function patchKeyedChildren(
  parent: Node,
  oldChildren: AnyNode[],
  newChildren: AnyNode[],
  anchor?: Node,
): AnyNode[] {
  let oldStartIdx = 0;
  let newStartIdx = 0;
  let oldEndIdx = oldChildren.length - 1;
  let newEndIdx = newChildren.length - 1;

  let oldStartNode = oldChildren[0];
  let oldEndNode = oldChildren[oldEndIdx];
  let newStartNode = newChildren[0];
  let newEndNode = newChildren[newEndIdx];

  // 1. Sync from start - skip common prefix
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

  // 2. Sync from end - skip common suffix
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

  // 3. Common sequence + mount new nodes
  if (oldStartIdx > oldEndIdx) {
    if (newStartIdx <= newEndIdx) {
      // Cache anchor calculation
      const anchorNode =
        newEndIdx + 1 < newChildren.length ? getFirstDOMNode(newChildren[newEndIdx + 1]) : anchor;

      for (let i = newStartIdx; i <= newEndIdx; i++) {
        insertNode(parent, newChildren[i], anchorNode);
      }
    }
  }
  // 4. Common sequence + unmount old nodes
  else if (newStartIdx > newEndIdx) {
    for (let i = oldStartIdx; i <= oldEndIdx; i++) {
      const node = oldChildren[i];
      if (node) {
        removeNode(node);
      }
    }
  }
  // 5. Unknown sequence - use optimized LIS algorithm
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
 * Patch unknown sequence with optimized LIS (Longest Increasing Subsequence).
 * Uses Object literal instead of Map for faster string key lookup.
 *
 * @param parent - Parent DOM node
 * @param oldChildren - Old children array
 * @param newChildren - New children array
 * @param oldStartIdx - Start index in old children
 * @param oldEndIdx - End index in old children
 * @param newStartIdx - Start index in new children
 * @param newEndIdx - End index in new children
 * @param anchor - Optional anchor node
 */
function patchUnknownSequence(
  parent: Node,
  oldChildren: AnyNode[],
  newChildren: AnyNode[],
  oldStartIdx: number,
  oldEndIdx: number,
  newStartIdx: number,
  newEndIdx: number,
  anchor?: Node,
): void {
  // Cache length calculation
  const newLength = newEndIdx - newStartIdx + 1;
  const newChildrenLen = newChildren.length;

  // Use Object literal for faster string key lookup
  let keyToNewIndexMap: Record<string, number> | undefined;

  // Build key to index map for new children
  for (let i = newStartIdx; i <= newEndIdx; i++) {
    const key = getNodeKey(newChildren[i]);
    if (key !== undefined) {
      if (!keyToNewIndexMap) {
        keyToNewIndexMap = Object.create(null);
      }
      keyToNewIndexMap![key] = i;
    }
  }

  // Use Int32Array for better memory layout and performance
  const newIndexToOldIndexMap = new Int32Array(newLength);
  let moved = false;
  let maxNewIndexSoFar = 0;
  let patched = 0;

  // Map old children to new positions
  for (let i = oldStartIdx; i <= oldEndIdx; i++) {
    const oldNode = oldChildren[i];
    if (!oldNode) continue;

    // All new nodes have been patched, remove remaining old nodes
    if (patched >= newLength) {
      removeNode(oldNode);
      continue;
    }

    let newIndex: number | undefined;
    const oldKey = getNodeKey(oldNode);

    // Fast path: keyed lookup using object property access
    if (oldKey !== undefined && keyToNewIndexMap && oldKey in keyToNewIndexMap) {
      newIndex = keyToNewIndexMap[oldKey];
    } else {
      // Fallback: type-based matching for unkeyed nodes
      for (let j = newStartIdx; j <= newEndIdx; j++) {
        if (
          newIndexToOldIndexMap[j - newStartIdx] === 0 &&
          oldKey === undefined &&
          getNodeKey(newChildren[j]) === undefined &&
          isSameNode(oldNode, newChildren[j])
        ) {
          newIndex = j;
          break;
        }
      }
    }

    if (newIndex === undefined) {
      // No match found, remove old node
      removeNode(oldNode);
    } else {
      // Record mapping (add 1 to distinguish from 0 which means unmapped)
      newIndexToOldIndexMap[newIndex - newStartIdx] = i + 1;

      // Track if nodes have moved (for LIS optimization)
      if (newIndex >= maxNewIndexSoFar) {
        maxNewIndexSoFar = newIndex;
      } else {
        moved = true;
      }

      // Patch the matched nodes
      patch(parent, oldNode, newChildren[newIndex]);
      newChildren[newIndex] = oldNode;
      patched++;
    }
  }

  // Calculate LIS only if nodes have moved
  const increasingNewIndexSequence = moved ? getSequence(newIndexToOldIndexMap) : [];
  let j = increasingNewIndexSequence.length - 1;

  // Loop backwards to ensure correct anchor calculation
  for (let i = newLength - 1; i >= 0; i--) {
    const nextIndex = newStartIdx + i;
    const nextNode = newChildren[nextIndex];
    const nextAnchor =
      nextIndex + 1 < newChildrenLen ? getFirstDOMNode(newChildren[nextIndex + 1]) : anchor;

    if (newIndexToOldIndexMap[i] === 0) {
      // New node - insert it
      insertNode(parent, nextNode, nextAnchor);
    } else if (moved) {
      // Existing node - move if not in LIS
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
 * Compute the Longest Increasing Subsequence (LIS).
 * Uses patience sorting with binary search for O(n log n) time complexity.
 *
 * @param arr - Array of indices (0 means no mapping)
 * @returns Array of indices representing the LIS
 */
export function getSequence(arr: Int32Array | number[]): number[] {
  const len = arr.length;
  if (len === 0) return [];

  // Fast path: single element
  if (len === 1) return arr[0] !== 0 ? [0] : [];

  const result: number[] = [];
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

      // Append to result if greater than last element
      if (result.length === 0 || arr[j] < arrI) {
        p[i] = j;
        result.push(i);
        continue;
      }

      // Binary search for the correct position
      u = 0;
      v = result.length - 1;

      while (u < v) {
        c = (u + v) >> 1;
        if (arr[result[c]] < arrI) {
          u = c + 1;
        } else {
          v = c;
        }
      }

      // Update result if smaller value found
      if (arrI < arr[result[u]]) {
        if (u > 0) {
          p[i] = result[u - 1];
        }
        result[u] = i;
      }
    }
  }

  // Reconstruct the sequence
  u = result.length;
  v = result[u - 1];

  while (u-- > 0) {
    result[u] = v;
    v = p[v];
  }

  return result;
}
