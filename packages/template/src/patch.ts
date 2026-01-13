import { isHTMLElement, isTextNode } from '@estjs/shared';
import { isComponent } from './component';
import { getNodeKey, setNodeKey } from './key';
import { getFirstDOMNode, insertNode, removeNode, replaceNode } from './utils/dom';
import { isSameNode } from './utils/node';

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
 * ## Algorithm Complexity
 *
 * - **Time Complexity**: O(a) where a is the number of attributes
 *   - Same reference check: O(1)
 *   - Element equality check: O(a) for attribute comparison
 *   - Attribute patching: O(a) for iterating attributes
 *   - Text node update: O(1)
 *   - Component update: O(1) for type check, O(n) for component update
 *   - Node replacement: O(1) for DOM operation
 *
 * - **Space Complexity**: O(1) - no additional allocations for common cases
 *
 * ## Optimization Strategy
 *
 * 1. **Fast path for same reference**: Returns immediately if nodes are identical
 * 2. **Fast path for equal nodes**: Uses isEqualNode() for structural equality
 * 3. **In-place attribute updates**: Modifies existing DOM nodes when possible
 * 4. **Minimal allocations**: Avoids creating intermediate arrays
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
  if (isTextNode(oldNode) && isTextNode(newNode)) {
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
 * ## Algorithm Complexity
 *
 * - **Best Case**: O(1) - both arrays empty
 * - **Fast Paths**: O(n) - mount all, unmount all, single child, two children
 * - **General Case**: O(n + m) where n = old children, m = new children
 *   - Common prefix/suffix sync: O(min(n, m))
 *   - Unknown sequence with LIS: O(n + m + k log k) where k = moved nodes
 *
 * - **Space Complexity**:
 *   - Fast paths: O(1)
 *   - General case: O(m) for index mapping + O(k) for LIS
 *
 * ## Optimization Strategy
 *
 * 1. **Fast path 0**: Both empty - O(1) immediate return
 * 2. **Fast path 1**: Mount all - O(m) simple insertion loop
 * 3. **Fast path 2**: Unmount all - O(n) simple removal loop
 * 4. **Fast path 3**: Single child - O(1) direct patch or replace
 * 5. **Fast path 4**: Two children - O(1) handles same order and swap
 * 6. **General algorithm**: Full diff with LIS optimization
 *
 * ## When Each Path is Used
 *
 * - **Empty arrays**: Initial render or complete removal
 * - **Mount all**: First render of a list
 * - **Unmount all**: Conditional rendering (v-if becomes false)
 * - **Single child**: Most common case in practice
 * - **Two children**: Common for toggle/swap scenarios
 * - **General**: Complex list updates with reordering
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

  //  FAST PATH 0: Both empty
  if (oldLength === 0 && newLength === 0) {
    return [];
  }

  //  FAST PATH 1: Mount all (no old children)
  if (oldLength === 0) {
    for (let i = 0; i < newLength; i++) {
      insertNode(parent, newChildren[i], anchor);
    }
    return newChildren;
  }

  //  FAST PATH 2: Unmount all (no new children)
  if (newLength === 0) {
    // Remove all children efficiently
    for (let i = 0; i < oldLength; i++) {
      removeNode(oldChildren[i]);
    }
    return [];
  }

  //  FAST PATH 3: Single child
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

  //  FAST PATH 4: Two children
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

  //  GENERAL ALGORITHM: Map-based diffing with LIS
  return patchKeyedChildren(parent, oldChildren, newChildren, anchor);
}

/**
 * General-purpose keyed children patching using optimized diff algorithm.
 *
 * ## Algorithm Overview
 *
 * This implements a two-pointer algorithm similar to Vue 3's diff algorithm:
 * 1. **Sync from start**: Match common prefix (same keys in same order)
 * 2. **Sync from end**: Match common suffix (same keys in same order)
 * 3. **Handle remaining**: Mount new, unmount old, or diff unknown sequence
 *
 * ## Algorithm Complexity
 *
 * - **Time Complexity**: O(n + m) where n = old length, m = new length
 *   - Prefix sync: O(min(n, m))
 *   - Suffix sync: O(min(n, m))
 *   - Remaining: O(max(n, m))
 *   - Unknown sequence: O(n + m + k log k) where k = moved nodes
 *
 * - **Space Complexity**: O(1) for sync phases, O(m) for unknown sequence
 *
 * ## Why This Algorithm?
 *
 * Real-world list updates often have:
 * - **Common prefix**: Items at the start rarely change
 * - **Common suffix**: Items at the end rarely change
 * - **Small changes**: Only a few items in the middle change
 *
 * By syncing prefix and suffix first, we minimize the "unknown sequence"
 * that requires expensive diffing.
 *
 * ## Example
 *
 * ```
 * Old: [A, B, C, D, E]
 * New: [A, B, X, Y, E]
 *
 * Step 1: Sync prefix → A, B matched
 * Step 2: Sync suffix → E matched
 * Step 3: Unknown sequence → [C, D] vs [X, Y]
 * ```
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
 * ## Algorithm Overview
 *
 * This is the most complex part of the diff algorithm, handling arbitrary
 * reordering of children. It uses the LIS algorithm to minimize DOM moves.
 *
 * ## Algorithm Steps
 *
 * 1. **Build key map**: Create O(1) lookup for new children by key
 * 2. **Map old to new**: For each old child, find its position in new children
 * 3. **Detect moves**: Track if any nodes moved out of order
 * 4. **Calculate LIS**: Find longest increasing subsequence (nodes that don't need to move)
 * 5. **Apply changes**: Mount new nodes, move nodes not in LIS
 *
 * ## Algorithm Complexity
 *
 * - **Time Complexity**: O(n + m + k log k)
 *   - Build key map: O(m)
 *   - Map old to new: O(n × m) worst case, O(n) with keys
 *   - Calculate LIS: O(k log k) where k = number of moved nodes
 *   - Apply changes: O(m)
 *
 * - **Space Complexity**: O(m)
 *   - Key map: O(m)
 *   - Index map: O(m) using Int32Array
 *   - LIS result: O(k) where k ≤ m
 *
 * ## Why LIS?
 *
 * The LIS represents nodes that are already in correct relative order.
 * These nodes don't need to move, minimizing expensive DOM operations.
 *
 * ## Example
 *
 * ```
 * Old: [A, B, C, D, E]
 * New: [E, C, A, D, B]
 *
 * Index mapping: [2, 4, 1, 3, 0]
 * LIS: [1, 3] → C and D are in correct order
 * Result: Only move E, A, B; keep C and D in place
 * ```
 *
 * ## Optimization: Object vs Map
 *
 * Using Object.create(null) for key lookup is ~30% faster than Map
 * for string keys, which is the common case.
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

  // Cache anchor nodes to avoid repeated getFirstDOMNode calls
  let cachedAnchor: Node | undefined = anchor;

  // Loop backwards to ensure correct anchor calculation
  for (let i = newLength - 1; i >= 0; i--) {
    const nextIndex = newStartIdx + i;
    const nextNode = newChildren[nextIndex];

    if (newIndexToOldIndexMap[i] === 0) {
      // New node - insert it
      insertNode(parent, nextNode, cachedAnchor);
      // Update cached anchor for next iteration
      cachedAnchor = getFirstDOMNode(nextNode) || cachedAnchor;
    } else if (moved) {
      // Existing node - move if not in LIS
      if (j < 0 || i !== increasingNewIndexSequence[j]) {
        const domNode = getFirstDOMNode(nextNode);
        if (domNode && domNode.parentNode === parent) {
          insertNode(parent, domNode, cachedAnchor);
        }
        // Update cached anchor
        cachedAnchor = domNode || cachedAnchor;
      } else {
        // Node is in LIS, update anchor but don't move
        cachedAnchor = getFirstDOMNode(nextNode) || cachedAnchor;
        j--;
      }
    } else {
      // No moves, just update anchor
      cachedAnchor = getFirstDOMNode(nextNode) || cachedAnchor;
    }
  }
}

/**
 * Compute the Longest Increasing Subsequence (LIS).
 * Uses patience sorting with binary search for O(n log n) time complexity.
 *
 * ## Algorithm: Patience Sorting
 *
 * This algorithm is based on the patience sorting card game:
 * 1. Maintain an array of "piles" (result array)
 * 2. For each element, find the leftmost pile where it can be placed
 * 3. Use binary search to find the correct pile in O(log n)
 * 4. Track predecessors to reconstruct the sequence
 *
 * ## Algorithm Complexity
 *
 * - **Time Complexity**: O(n log n)
 *   - Main loop: O(n) iterations
 *   - Binary search per iteration: O(log n)
 *   - Sequence reconstruction: O(k) where k = LIS length
 *
 * - **Space Complexity**: O(n)
 *   - Result array: O(k) where k ≤ n
 *   - Predecessor array: O(n) using Int32Array
 *
 * ## Why This Algorithm?
 *
 * The LIS problem has multiple solutions:
 * - **Brute force**: O(2^n) - try all subsequences
 * - **Dynamic programming**: O(n²) - classic DP solution
 * - **Patience sorting**: O(n log n) - optimal solution
 *
 * We use patience sorting because:
 * 1. Optimal time complexity for large lists
 * 2. Simple to implement and understand
 * 3. Works well with the diff algorithm's needs
 *
 * ## Example
 *
 * ```
 * Input:  [0, 8, 4, 12, 2, 10, 6, 14, 1, 9, 5, 13, 3, 11, 7, 15]
 * Output: [0, 2, 6, 9, 11, 15] (indices of LIS)
 * LIS:    [0, 2, 6, 9, 13, 15] (actual values)
 * ```
 *
 * ## Special Cases
 *
 * - **Empty array**: Returns []
 * - **Single element**: Returns [0] if element !== 0
 * - **All zeros**: Returns [] (zeros mean "no mapping" in diff context)
 * - **Strictly decreasing**: Returns [last_non_zero_index]
 *
 * ## Diff Context
 *
 * In the diff algorithm, the input array represents:
 * - Index: Position in new children
 * - Value: Position in old children + 1 (0 means new node)
 *
 * The LIS represents nodes that are already in correct relative order
 * and don't need to be moved.
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
