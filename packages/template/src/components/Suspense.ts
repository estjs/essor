import { isBrowser, isFunction, isPromise, warn } from '@estjs/shared';
import { isComputed, isSignal } from '@estjs/signals';
import { provide } from '../provide';
import { createScope, disposeScope, getActiveScope, onCleanup, runWithScope } from '../scope';
import { insert } from '../dom';
import { SUSPENSE_COMPONENT } from '../constants';
import type { AnyNode } from '../types';

/**
 * Deeply resolve a node-ish value for insertion: unwrap thunks and
 * signals/computed at every level, and recurse into arrays so nested
 * `() => signal` / signal entries become concrete nodes/values. `insert()`
 * then normalizes the result into DOM nodes.
 */
export function resolveNodeValue(value: unknown): unknown {
  let current = value;

  while (isFunction(current)) {
    current = (current as Function)();
  }

  if (isSignal(current) || isComputed(current)) {
    return resolveNodeValue((current as any).value);
  }

  if (Array.isArray(current)) {
    return current.map((item) => resolveNodeValue(item));
  }

  return current;
}

export interface SuspenseProps {
  /** The content to render. Can be a Promise for async loading. */
  children?: Node | Node[] | Promise<Node | Node[]>;
  /** Fallback content to display while children is loading (Promise pending). */
  fallback?: Node;
  /** Optional key for reconciliation. */
  key?: string;
}

export const SuspenseContext = Symbol('SuspenseContext');

export interface SuspenseContextType {
  register: (promise: Promise<any>) => void;
  increment: () => void;
  decrement: () => void;
}

/**
 * Suspense — handles async content with a fallback UI.
 *
 * Rendering model: content is built offscreen into the Suspense fragment
 * first. If async resources register during
 * that mount, the content nodes are parked in an offscreen fragment while
 * fallback is shown. When all resources settle, content is moved back in one
 * step. No "insert → remove → re-insert" dance — content is moved at most once.
 *
 * Wrapper-free: the boundary is a `<!--suspense-->…<!--/suspense-->` comment
 * pair, not a `display:contents` div.
 *
 * @example
 * ```tsx
 * <Suspense fallback={<div>Loading...</div>}>{asyncContent}</Suspense>
 * ```
 */
export function Suspense(props: SuspenseProps): Node {
  // SSR: render the fallback, deterministic, never touch DOM.
  if (!isBrowser()) {
    return props.fallback ?? ('' as unknown as Node);
  }

  const owner = getActiveScope();
  const start = document.createComment('suspense');
  const end = document.createComment('/suspense');
  const frag = document.createDocumentFragment();
  frag.append(start, end);

  let mounted = true;
  let pending = 0;
  let mounting = false;

  // Content: a child scope + its nodes live between `start` and `end` in the
  // fragment. When fallback is shown, the nodes move to `parked`.
  let contentScope: ReturnType<typeof createScope> | null = null;
  let parked: DocumentFragment | null = null;

  // Fallback: transient, destroyed when content is restored.
  let fallbackScope: ReturnType<typeof createScope> | null = null;

  let resolved: AnyNode | AnyNode[] | null = null;

  // ── DOM helpers ──────────────────────────────────────────────────────────

  /** Move every node between `start` and `end` into an offscreen fragment. */
  const parkContent = (): void => {
    const off = document.createDocumentFragment();
    while (end.previousSibling && end.previousSibling !== start) {
      off.prepend(end.previousSibling);
    }
    parked = off;
  };

  /** Move parked nodes back before `end`, then clear the parked fragment. */
  const restoreContent = (): void => {
    if (!parked) return;
    // `end` may now live in the host (framework moved frag children). Always
    // target its current parent, falling back to the original fragment.
    const parent = end.parentNode ?? frag;
    while (parked.firstChild) {
      parent.insertBefore(parked.firstChild, end);
    }
    parked = null;
  };

  const mountFallback = (): void => {
    if (props.fallback == null || fallbackScope) return;
    fallbackScope = createScope(owner);
    runWithScope(fallbackScope, () => {
      // Lazy-parent: same pattern as For/Portal. Before flush `end.parentNode`
      // is the fragment; after flush it's the real host.
      insert(end.parentNode ?? frag, () => resolveNodeValue(props.fallback) as AnyNode, end);
    });
  };

  const disposeFallback = (): void => {
    if (!fallbackScope) return;
    disposeScope(fallbackScope);
    fallbackScope = null;
  };

  const mountContent = (children: AnyNode | AnyNode[]): void => {
    mounting = true;
    contentScope = createScope(owner);
    runWithScope(contentScope, () => {
      insert(end.parentNode ?? frag, () => resolveNodeValue(children) as AnyNode, end);
    });
    mounting = false;
    // A resource registered synchronously during mount — park content.
    if (pending && !parked) {
      parkContent();
      mountFallback();
    }
  };

  // ── State transitions ────────────────────────────────────────────────────

  const showFallback = (): void => {
    if (parked) return; // already showing fallback
    if (mounting) return; // mountContent will reconcile
    parkContent();
    mountFallback();
  };

  const showContent = (): void => {
    if (!parked) return;

    const hasSyncChildren = props.children != null && !isPromise(props.children);
    if (contentScope == null && resolved == null && !hasSyncChildren) return;

    disposeFallback();
    restoreContent();

    // First time: mount the resolved value (Promise path)
    // On the Promise path contentScope was never created — we must mount now.
    // On the sync-resource path (register during mount), contentScope exists but
    // its nodes were parked; restoring covers it (the `contentScope != null`
    // check above would be true, so we don't enter here).
    if (!contentScope) {
      if (resolved) {
        mountContent(resolved);
      } else if (hasSyncChildren) {
        mountContent(props.children as AnyNode);
      }
    }
  };

  // ── Context (created before children handling so register() is available) ─

  const settle = () => {
    if (!mounted) return;
    if (--pending === 0) showContent();
  };

  const ctx: SuspenseContextType = {
    register: (promise: Promise<any>) => {
      pending++;
      showFallback();
      promise.then(settle).catch((error) => {
        if (__DEV__) warn('[Suspense] Resource failed:', error);
        settle();
      });
    },
    increment: () => {
      pending++;
      showFallback();
    },
    decrement: () => {
      pending = Math.max(0, pending - 1);
      if (pending === 0) showContent();
    },
  };

  provide(SuspenseContext, ctx);

  // ── Initial render ───────────────────────────────────────────────────────

  const children = props.children;

  if (isPromise(children)) {
    children
      .then((value) => {
        resolved = value as AnyNode | AnyNode[];
      })
      .catch(() => {
        /* handled by register() */
      });
    ctx.register(children);
  } else if (children != null) {
    mountContent(children as AnyNode);
  } else if (props.fallback != null) {
    showFallback();
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────

  onCleanup(() => {
    mounted = false;
    pending = 0;
    resolved = null;
    if (contentScope) disposeScope(contentScope);
    if (fallbackScope) disposeScope(fallbackScope);
    contentScope = fallbackScope = null;
    parked = null;
    start.remove();
    end.remove();
  });

  return frag;
}

Suspense[SUSPENSE_COMPONENT] = true;

/**
 * Check if a node is a Suspense component.
 *
 * @param node - Node to check.
 * @returns {boolean} True if node is a Suspense.
 */
export function isSuspense(node: unknown): boolean {
  return !!node && !!node[SUSPENSE_COMPONENT];
}
