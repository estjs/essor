import { type Signal, effect, isSignal } from '@estjs/signals';
import { isFunction } from '@estjs/shared';
import {
  type Scope,
  createScope,
  disposeScope,
  getActiveScope,
  onCleanup,
  runWithScope,
} from '../scope';
import { FOR_COMPONENT } from '../constants';
import { isComponent } from '../component';
import { insertNode, normalizeNode, removeNode } from '../dom';
import { getSequence } from '../reconcile';
import type { AnyNode } from '../types';
import type { Component } from '../component';

export interface ForProps<T> {
  each: T[] | Signal<T[]> | (() => T[]);
  children: (item: T, index: number) => AnyNode;
  key?: (item: T, index: number) => unknown;
  fallback?: () => AnyNode;
}

interface ItemEntry {
  key: unknown;
  item: unknown;
  nodes: Node[];
  scope: Scope; // Track scope for cleanup
}

/**
 * Optimized For Component
 * - Uses createDetachedScope to avoid parent.children Set overhead (SolidJS style)
 * - Uses DocumentFragment batching for mass creation
 * - Inlines scope switching for performance
 */
export function For<T>(props: ForProps<T>): Node {
  const fragment = document.createDocumentFragment();
  const marker = document.createComment('');
  fragment.appendChild(marker);

  let entries: ItemEntry[] = [];
  let fallbackNodes: Node[] = [];

  const keyFn = props.key;
  // The JSX babel pipeline wraps a single arrow child in a 1-element array —
  // `<For>{(item) => …}</For>` becomes `children: [(item) => …]` at runtime.
  // Unwrap it here so the rest of the component only deals with a function.
  const raw = props.children as unknown;
  const renderFn: ForProps<T>['children'] =
    Array.isArray(raw) && raw.length === 1 && isFunction(raw[0])
      ? (raw[0] as ForProps<T>['children'])
      : (props.children as ForProps<T>['children']);
  if (!isFunction(renderFn)) {
    throw new TypeError('<For> requires `children` to be a function (item, index) => Node');
  }

  const getList = (): T[] => {
    const input = props.each;
    if (isSignal(input)) return (input as Signal<T[]>).value ?? [];
    if (isFunction(input)) return (input as () => T[])() ?? [];
    return (input as T[]) ?? [];
  };

  const getKey = (item: T, index: number): unknown => (keyFn ? keyFn(item, index) : item);

  // Resolve whatever `children(item, index)` returned into actual DOM nodes
  // and insert them at `before`. Accepts arrays (recursed), Components
  // (mounted via insertNode), primitives (text via normalizeNode), and
  // `null`/`false` (skipped — lets children short-circuit a row).
  const mountValue = (value: AnyNode, parent: Node, before: Node | null): Node[] => {
    if (value == null || value === false) return [];

    if (Array.isArray(value)) {
      const nodes: Node[] = [];
      for (const child of value) nodes.push(...mountValue(child as AnyNode, parent, before));
      return nodes;
    }

    if (isComponent(value)) {
      insertNode(parent, value, before ?? undefined);
      // Safe to return the live array: Component only ever reassigns
      // `renderedNodes` (mount/destroy), never mutates it in place, and For
      // treats `entry.nodes` as read-only.
      return (value as Component).renderedNodes;
    }

    const node = normalizeNode(value);
    insertNode(parent, node, before ?? undefined);
    return [node];
  };

  const mountFallback = (parent: Node, before: Node | null) => {
    if (!props.fallback) return;
    const nodes = mountValue(props.fallback(), parent, before);
    fallbackNodes = nodes;
  };

  const clearFallback = () => {
    for (const node of fallbackNodes) {
      // Use removeNode() instead of raw removeChild so Component instances
      // in the fallback have their destroy() called, preventing scope/effect leaks.
      removeNode(node as AnyNode);
    }
    fallbackNodes = [];
  };

  // Capture the scope that is active when <For> is first evaluated. The list
  // effect below re-runs through the scheduler, where the template-level
  // `activeScope` is no longer set (it's a module-global restored only inside
  // runWithScope). Without re-establishing it, `renderItem` → getActiveScope()
  // returns null on updates, so rows added later become detached scopes and
  // `inject()` inside them fails. Mirrors the parentScope capture in insert().
  const ownerScope = getActiveScope();

  /**
   * Render item with a child scope under the captured owner scope.
   */
  const renderItem = (
    item: T,
    index: number,
    parent: Node,
    before: Node | null,
    key = getKey(item, index),
  ): ItemEntry => {
    // Prefer the live active scope (correct on initial synchronous mount), but
    // fall back to the captured owner scope on reactive re-runs when the
    // template scope context has not been re-established.
    const parentScope = getActiveScope() ?? ownerScope;
    const scope = createScope(parentScope);
    let mountedNodes: Node[] = [];
    try {
      runWithScope(scope, () => {
        mountedNodes = mountValue(renderFn(item, index), parent, before);
      });
    } catch (error) {
      // Dispose the scope immediately to prevent leaks when renderFn throws
      disposeScope(scope);
      throw error;
    }

    return { key, item, nodes: mountedNodes, scope };
  };

  const disposeItem = (entry: ItemEntry) => {
    disposeScope(entry.scope);
    for (const node of entry.nodes) {
      if (node.parentNode) {
        node.parentNode.removeChild(node);
      }
    }
  };

  const effectRunner = effect(() => {
    const newItems = getList();

    const parent = marker.parentNode;

    // Initial mount (parent is null because fragment is not attached yet)
    if (!parent) {
      if (newItems.length === 0) {
        mountFallback(fragment, marker);
      } else {
        entries = new Array(newItems.length);
        let idx = 0;
        for (const newItem of newItems) {
          entries[idx] = renderItem(newItem, idx, fragment, marker);
          idx++;
        }
      }
      // Skip reconcile on initial mount — entries are already created
      return;
    }

    // Before the fragment is attached, `marker.parentNode` is the fragment
    // itself; afterwards it is the real host (e.g. the container the user
    // mounted into). All reconciliation must target the live parent, or
    // `insertBefore(node, marker)` throws NotFoundError because `marker`
    // already moved out of the fragment on the first flush.
    reconcile(parent, newItems);
  });

  /**
   * Reconciles the rendered entries against the latest item list.
   *
   * @param parent - The parent node.
   * @param newItems - The new items list.
   * @returns {void}
   */
  function reconcile(parent: Node, newItems: T[]): void {
    const oldLen = entries.length;
    const newLen = newItems.length;

    // ===== FAST PATH 1: Clear all =====
    if (newLen === 0) {
      for (let i = 0; i < oldLen; i++) {
        disposeItem(entries[i]);
      }
      entries = [];

      if (props.fallback && fallbackNodes.length === 0) {
        mountFallback(parent, marker);
      }
      return;
    }

    // ===== FAST PATH 2: Create all (from empty/fallback) =====
    if (oldLen === 0 || fallbackNodes.length > 0) {
      if (fallbackNodes.length > 0) {
        clearFallback();
      }

      entries = new Array(newLen);

      // Batch creation in fragment
      const batchFragment = document.createDocumentFragment();

      for (let i = 0; i < newLen; i++) {
        // Render to batchFragment, append to end (before=null)
        entries[i] = renderItem(newItems[i], i, batchFragment, null);
      }

      parent.insertBefore(batchFragment, marker);
      return;
    }

    // ===== Keyed reconciliation =====
    //
    // Each `oldKeyMap` value preserves the entry together with its original
    // index. The index is the fuel for the LIS-based move minimisation
    // further down: by mapping each new position to an old position we can
    // find the longest slice that is already in order and leave it alone.
    const oldKeyMap = new Map<unknown, Array<[ItemEntry, number]>>();
    for (let i = 0; i < oldLen; i++) {
      const entry = entries[i];
      const list = oldKeyMap.get(entry.key);
      const pair: [ItemEntry, number] = [entry, i];
      if (list) list.push(pair);
      else oldKeyMap.set(entry.key, [pair]);
    }

    const newEntries: ItemEntry[] = new Array(newLen);
    const toRemove: ItemEntry[] = [];

    // Batch new nodes in a fragment so multiple creations turn into a
    // single native DOM insertion. Created lazily — only when a fresh
    // item is actually rendered so we avoid the allocation when every
    // entry is reused.
    let batchFragment: DocumentFragment | null = null;

    // `newIndexToOldIndex[i] === 0`  → newEntries[i] is freshly created.
    // `newIndexToOldIndex[i] === k + 1` → reused from `entries[k]`.
    const newIndexToOldIndex = new Int32Array(newLen);
    let moved = false;
    let maxOldSeen = 0;

    // Pre-compute keys for all new items to avoid redundant getKey calls
    const newKeys = new Array<unknown>(newLen);
    for (let i = 0; i < newLen; i++) {
      newKeys[i] = getKey(newItems[i], i);
    }

    for (let i = 0; i < newLen; i++) {
      const item = newItems[i];
      const key = newKeys[i];
      const oldList = oldKeyMap.get(key);

      if (oldList && oldList.length > 0) {
        const [reused, oldIndex] = oldList.shift()!;
        if (Object.is(reused.item, item)) {
          reused.item = item;
          newEntries[i] = reused;
          newIndexToOldIndex[i] = oldIndex + 1;
          if (oldIndex < maxOldSeen) moved = true;
          else maxOldSeen = oldIndex;
        } else {
          if (!batchFragment) batchFragment = document.createDocumentFragment();
          disposeItem(reused);
          newEntries[i] = renderItem(item, i, batchFragment, null, key);
        }
      } else {
        if (!batchFragment) batchFragment = document.createDocumentFragment();
        newEntries[i] = renderItem(item, i, batchFragment, null, key);
        // newIndexToOldIndex[i] remains 0 (fresh entry).
      }
    }

    for (const list of oldKeyMap.values()) {
      for (const [entry] of list) toRemove.push(entry);
    }
    for (const entry of toRemove) disposeItem(entry);

    // ===== Position correction with LIS =====
    // We walk the new array right-to-left using `marker` as the initial
    // anchor, which lets us use `insertBefore(node, nextNode)` uniformly.
    const lis = moved ? getSequence(newIndexToOldIndex) : [];
    let lisCursor = lis.length - 1;
    let nextNode: Node = marker;

    for (let i = newLen - 1; i >= 0; i--) {
      const entry = newEntries[i];
      const nodes = entry.nodes;
      const isFresh = newIndexToOldIndex[i] === 0;
      const inLis = !isFresh && moved && lisCursor >= 0 && i === lis[lisCursor];

      if (inLis) {
        // Stable skeleton — leave every node untouched, but still update
        // `nextNode` so the next iteration has the correct anchor.
        lisCursor--;
        for (let j = nodes.length - 1; j >= 0; j--) nextNode = nodes[j];
        continue;
      }

      // Fresh entry OR reused entry that is out of place → (re)insert each
      // node. The nextSibling guard keeps us from redundant writes for
      // multi-node rows whose internal order is already correct.
      for (let j = nodes.length - 1; j >= 0; j--) {
        const node = nodes[j];
        if (node.nextSibling !== nextNode) {
          parent.insertBefore(node, nextNode);
        }
        nextNode = node;
      }
    }

    entries = newEntries;
  }

  onCleanup(() => {
    effectRunner.stop();
    for (const entry of entries) {
      disposeItem(entry);
    }
    entries = [];
    clearFallback();
    if (marker.parentNode) {
      marker.parentNode.removeChild(marker);
    }
  });

  return fragment;
}

For[FOR_COMPONENT] = true;

export function isFor(node: unknown): boolean {
  return !!node && !!(node as Record<symbol, boolean>)[FOR_COMPONENT];
}
