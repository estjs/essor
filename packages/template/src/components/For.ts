import { type Signal, isSignal, memoEffect, untrack } from '@estjs/signals';
import {
  type Scope,
  createScope,
  disposeScope,
  getActiveScope,
  onCleanup,
  setActiveScope,
} from '../scope';
import { isComponent } from '../component';
import { FOR_COMPONENT } from '../constants';
import type { AnyNode } from '../types';

export interface ForProps<T> {
  each: T[] | Signal<T[]> | (() => T[]);
  children: (item: T, index: number) => AnyNode;
  keyFn?: (item: T) => unknown;
  fallback?: () => AnyNode;
}

interface ItemEntry {
  key: unknown;
  node: Node;
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
  let fallbackNode: Node | null = null;

  const keyFn = props.keyFn;
  const renderFn = props.children;

  const getList = (): T[] => {
    const input = props.each;
    if (isSignal(input)) return (input as Signal<T[]>).value ?? [];
    if (typeof input === 'function') return (input as () => T[])() ?? [];
    return (input as T[]) ?? [];
  };

  const getKey = (item: T): unknown => (keyFn ? keyFn(item) : item);

  /**
   * Render item with detached scope.
   */
  const renderItem = (item: T, index: number, parent: Node, before: Node | null): ItemEntry => {
    const prevScope = getActiveScope();

    const scope = createScope(prevScope);

    setActiveScope(scope);

    let node: AnyNode;
    try {
      const result = renderFn(item, index);
      if (isComponent(result)) {
        result.mount(parent, before as Node); // Cast null to Node is okay for beforeNode? mount expects Node|undefined
        node = result.firstChild ?? document.createComment('empty');
      } else {
        node = result as Node;
        // Insert node manually if not handled by Component.mount
        if (!node.parentNode) {
          if (before) {
            parent.insertBefore(node, before);
          } else {
            parent.appendChild(node);
          }
        }
      }
    } finally {
      setActiveScope(prevScope);
    }

    return { key: getKey(item), node: node! as Node, scope };
  };

  const disposeItem = (entry: ItemEntry) => {
    disposeScope(entry.scope);
    if (entry.node.parentNode) {
      entry.node.parentNode.removeChild(entry.node);
    }
  };

  memoEffect(
    ({ prev }) => {
      const newItems = getList();

      if (prev === newItems) return { prev: newItems };

      const parent = marker.parentNode;

      // Initial mount (parent is null because fragment is not attached yet)
      if (!parent) {
        if (newItems.length === 0) {
          if (props.fallback) {
            const fb = props.fallback();
            if (isComponent(fb)) {
              fb.mount(fragment, marker);
              fallbackNode = fb.firstChild ?? document.createComment('empty');
            } else {
              fallbackNode = fb as Node;
              fragment.insertBefore(fallbackNode, marker);
            }
          }
          return { prev: newItems };
        }

        entries = new Array(newItems.length);

        for (const [i, newItem] of newItems.entries()) {
          entries[i] = renderItem(newItem, i, fragment, marker);
        }
        return { prev: newItems };
      }

      untrack(() => reconcile(parent, newItems));
      return { prev: newItems };
    },
    {
      prev: [] as T[],
    },
  );

  function reconcile(parent: Node, newItems: T[]): void {
    const oldLen = entries.length;
    const newLen = newItems.length;

    // ===== FAST PATH 1: Clear all =====
    if (newLen === 0) {
      for (let i = 0; i < oldLen; i++) {
        disposeItem(entries[i]);
      }
      entries = [];

      if (props.fallback && !fallbackNode) {
        const fb = props.fallback();
        if (isComponent(fb)) {
          fb.mount(parent, marker);
          fallbackNode = fb.firstChild ?? document.createComment('empty');
        } else {
          fallbackNode = fb as Node;
          parent.insertBefore(fallbackNode, marker);
        }
      }
      return;
    }

    // ===== FAST PATH 2: Create all (from empty/fallback) =====
    if (oldLen === 0 || fallbackNode) {
      if (fallbackNode) {
        if (fallbackNode.parentNode) fallbackNode.parentNode.removeChild(fallbackNode);
        fallbackNode = null;
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
    const oldKeyMap = new Map<unknown, ItemEntry[]>();
    for (let i = 0; i < oldLen; i++) {
      const entry = entries[i];
      const list = oldKeyMap.get(entry.key);
      if (list) {
        list.push(entry);
      } else {
        oldKeyMap.set(entry.key, [entry]);
      }
    }

    const newEntries: ItemEntry[] = new Array(newLen);
    const toRemove: ItemEntry[] = [];

    // Batch new nodes in fragment
    const batchFragment = document.createDocumentFragment();

    for (let i = 0; i < newLen; i++) {
      const item = newItems[i];
      const key = getKey(item);
      const oldList = oldKeyMap.get(key);

      if (oldList && oldList.length > 0) {
        newEntries[i] = oldList.shift()!;
      } else {
        newEntries[i] = renderItem(item, i, batchFragment, null);
      }
    }

    for (const list of oldKeyMap.values()) {
      for (const entry of list) {
        toRemove.push(entry);
      }
    }

    for (const entry of toRemove) {
      disposeItem(entry);
    }

    // Efficient Reorder
    // If we have new nodes in batchFragment, they are not yet in DOM.
    // Existing nodes are in DOM.
    // We iterate 0..newLen.
    // If node is in batchFragment, we must insert it.
    // If node is in DOM, we check order.

    for (let i = 0; i < newLen; i++) {
      const node = newEntries[i].node;
      parent.insertBefore(node, marker);
    }

    entries = newEntries;
  }

  onCleanup(() => {
    for (const entry of entries) {
      disposeItem(entry);
    }
    if (fallbackNode && fallbackNode.parentNode) {
      fallbackNode.parentNode.removeChild(fallbackNode);
    }
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
