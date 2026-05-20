import { insertNode, removeNode } from './dom';

/**
 * Resolves insert anchor.
 *
 * @param parent - The parent node.
 * @param candidate - The candidate anchor node.
 * @returns The resolved anchor node or null.
 */
function resolveInsertAnchor(parent: Node, candidate?: Node | null): Node | null {
  return candidate && candidate.parentNode === parent ? candidate : null;
}

/**
 * Reconcile two arrays of real DOM nodes with minimal DOM operations.
 * This is the list reconciler for fine-grained rendering.
 *
 * @param parent - The parent node.
 * @param oldNodes - The array of current nodes.
 * @param newNodes - The array of new nodes.
 * @param anchor - Optional reference node for insertion.
 * @returns The new array of nodes.
 */
export function reconcileArrays(
  parent: Node,
  oldNodes: Node[],
  newNodes: Node[],
  anchor?: Node,
): Node[] {
  const fallbackAnchor = resolveInsertAnchor(parent, anchor);
  const oldLength = oldNodes.length;
  const newLength = newNodes.length;

  if (oldLength === 0 && newLength === 0) return newNodes;

  if (oldLength === 0) {
    for (let i = 0; i < newLength; i++) {
      insertNode(parent, newNodes[i], fallbackAnchor);
    }
    return newNodes;
  }

  if (newLength === 0) {
    for (let i = 0; i < oldLength; i++) {
      removeNode(oldNodes[i]);
    }
    return [];
  }

  let start = 0;
  let oldEnd = oldLength - 1;
  let newEnd = newLength - 1;

  while (start <= oldEnd && start <= newEnd) {
    if (oldNodes[start] === newNodes[start]) {
      start++;
    } else {
      break;
    }
  }

  while (oldEnd >= start && newEnd >= start) {
    if (oldNodes[oldEnd] === newNodes[newEnd]) {
      oldEnd--;
      newEnd--;
    } else {
      break;
    }
  }

  if (start > oldEnd) {
    if (start <= newEnd) {
      const nextPos = newEnd + 1;
      const nextNode = resolveInsertAnchor(
        parent,
        nextPos < newLength ? newNodes[nextPos] : fallbackAnchor,
      );
      for (let i = start; i <= newEnd; i++) {
        insertNode(parent, newNodes[i], nextNode);
      }
    }
  } else if (start > newEnd) {
    for (let i = start; i <= oldEnd; i++) {
      removeNode(oldNodes[i]);
    }
  } else {
    reconcileUnknownSequence(parent, oldNodes, newNodes, start, oldEnd, newEnd, fallbackAnchor);
  }

  return newNodes;
}

/**
 * Reconciles unknown sequence of nodes.
 *
 * @param parent - The parent node.
 * @param oldNodes - Current nodes.
 * @param newNodes - New nodes.
 * @param start - Start index of the sequence.
 * @param oldEnd - End index of the old sequence.
 * @param newEnd - End index of the new sequence.
 * @param anchor - Optional reference node for insertion.
 * @returns {void}
 */
function reconcileUnknownSequence(
  parent: Node,
  oldNodes: Node[],
  newNodes: Node[],
  start: number,
  oldEnd: number,
  newEnd: number,
  anchor?: Node | null,
): void {
  const newLength = newEnd - start + 1;

  // For very short sequences, linear search beats Map allocation overhead
  const findNewIndex =
    newLength <= 4
      ? (node: Node) => {
          for (let i = start; i <= newEnd; i++) {
            if (newNodes[i] === node) return i;
          }
          return undefined;
        }
      : (() => {
          const map = new Map<Node, number>();
          for (let i = start; i <= newEnd; i++) map.set(newNodes[i], i);
          return (node: Node) => map.get(node);
        })();

  const newIndexToOldIndexMap = new Int32Array(newLength);

  let patched = 0;
  let moved = false;
  let maxNewIndexSoFar = 0;

  for (let i = start; i <= oldEnd; i++) {
    const oldNode = oldNodes[i];

    if (patched >= newLength) {
      removeNode(oldNode);
      continue;
    }

    const newIndex = findNewIndex(oldNode);

    if (newIndex === undefined) {
      removeNode(oldNode);
    } else {
      newIndexToOldIndexMap[newIndex - start] = i + 1;

      if (newIndex >= maxNewIndexSoFar) {
        maxNewIndexSoFar = newIndex;
      } else {
        moved = true;
      }
      patched++;
    }
  }

  const increasingNewIndexSequence = moved ? getSequence(newIndexToOldIndexMap) : [];
  let j = increasingNewIndexSequence.length - 1;

  for (let i = newLength - 1; i >= 0; i--) {
    const nextIndex = start + i;
    const nextNode = newNodes[nextIndex];
    const anchorNode = resolveInsertAnchor(
      parent,
      nextIndex + 1 < newNodes.length ? newNodes[nextIndex + 1] : anchor,
    );

    if (newIndexToOldIndexMap[i] === 0) {
      insertNode(parent, nextNode, anchorNode);
    } else if (moved) {
      if (j < 0 || i !== increasingNewIndexSequence[j]) {
        insertNode(parent, nextNode, anchorNode);
      } else {
        j--;
      }
    }
  }
}

/**
 * Compute the Longest Increasing Subsequence using patience sorting.
 * O(n log n) time, O(n) space.
 *
 * @param arr - The array of indices.
 * @returns The LIS indices.
 */
export function getSequence(arr: Int32Array): number[] {
  const p = new Int32Array(arr.length);
  const result = [0];
  const len = arr.length;
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
