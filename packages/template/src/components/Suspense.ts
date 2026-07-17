import { isArray, isBrowser, isFunction, isPromise, warn } from '@estjs/shared';
import { isComputed, isSignal } from '@estjs/signals';
import { provide } from '../provide';
import { createScope, disposeScope, getActiveScope, onCleanup, runWithScope } from '../scope';
import { onUpdate } from '../lifecycle';
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

  if (isArray(current)) {
    return current.map((item) => resolveNodeValue(item));
  }

  return current;
}

export interface SuspenseProps {
  /**
   * The content to render. Any renderable value (elements, components,
   * thunks, signals, arrays — see {@link AnyNode}); a Promise defers
   * rendering until it resolves.
   */
  children?: AnyNode | Promise<AnyNode>;
  /** Fallback content to display while children is loading (Promise pending). */
  fallback?: AnyNode;
  /** Optional key for reconciliation. */
  key?: string;
}

export const SuspenseContext = Symbol('SuspenseContext');

export interface SuspenseContextType {
  register: (promise: Promise<any>) => () => void;
  increment: () => () => void;
  decrement: () => void;
}

function isAbortError(error: unknown): boolean {
  return (
    !!error && typeof error === 'object' && (error as { name?: unknown }).name === 'AbortError'
  );
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
  // SSR: render the fallback, deterministic, never touch DOM. The fallback
  // may be any AnyNode; the SSR serializer handles non-Node leaves, so the
  // cast only widens the local return type.
  if (!isBrowser()) {
    return (props.fallback ?? '') as Node;
  }

  const owner = getActiveScope();
  const start = document.createComment('suspense');
  const end = document.createComment('/suspense');
  const frag = document.createDocumentFragment();
  frag.append(start, end);

  let mounted = true;
  let pending = 0;
  let mounting = false;
  let boundaryVersion = 0;
  let currentChildren: SuspenseProps['children'] | null = null;

  // Content: a child scope + its nodes live between `start` and `end` in the
  // fragment. When fallback is shown, the nodes move to `parked`.
  let contentScope: ReturnType<typeof createScope> | null = null;
  let parked: DocumentFragment | null = null;

  // Fallback: transient, destroyed when content is restored.
  let fallbackScope: ReturnType<typeof createScope> | null = null;

  let resolved: AnyNode | AnyNode[] | null = null;
  let hasResolved = false;

  type PendingRelease = (() => void) & { active: boolean };
  let manualReleases: PendingRelease[] = [];

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

  const disposeContent = (): void => {
    if (contentScope) {
      disposeScope(contentScope);
      contentScope = null;
    }
    if (parked) {
      while (parked.firstChild) parked.firstChild.remove();
      parked = null;
    }
  };

  const mountContent = (children: AnyNode | AnyNode[]): void => {
    const scope = createScope(owner);
    mounting = true;
    contentScope = scope;
    try {
      runWithScope(scope, () => {
        insert(end.parentNode ?? frag, () => resolveNodeValue(children) as AnyNode, end);
      });
    } catch (error) {
      if (contentScope === scope) contentScope = null;
      disposeScope(scope);
      pending = 0;
      manualReleases = [];
      boundaryVersion++;
      throw error;
    } finally {
      mounting = false;
    }
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

    const hasSyncChildren = currentChildren != null && !isPromise(currentChildren);
    if (contentScope == null && !hasResolved && !hasSyncChildren) return;

    disposeFallback();
    restoreContent();

    // First time: mount the resolved value (Promise path)
    // On the Promise path contentScope was never created — we must mount now.
    // On the sync-resource path (register during mount), contentScope exists but
    // its nodes were parked; restoring covers it (the `contentScope != null`
    // check above would be true, so we don't enter here).
    if (!contentScope) {
      if (hasResolved) {
        mountContent(resolved);
      } else if (hasSyncChildren) {
        mountContent(currentChildren as AnyNode);
      }
    }
  };

  // ── Context (created before children handling so register() is available) ─

  const addPending = (version = boundaryVersion): PendingRelease => {
    pending++;
    showFallback();

    const release = (() => {
      if (!release.active) return;
      release.active = false;
      if (!mounted || version !== boundaryVersion) return;
      if (--pending === 0) showContent();
    }) as PendingRelease;
    release.active = true;
    return release;
  };

  const settle = (release: PendingRelease) => {
    if (!mounted) return;
    release();
  };

  const dequeueManualRelease = (): PendingRelease | undefined => {
    while (manualReleases.length > 0) {
      const release = manualReleases.shift()!;
      if (release.active) return release;
    }
    return undefined;
  };

  const ctx: SuspenseContextType = {
    register: (promise: Promise<any>) => {
      const release = addPending();
      promise.then(
        () => settle(release),
        (error) => {
          if (__DEV__ && !isAbortError(error)) warn('[Suspense] Resource failed:', error);
          settle(release);
        },
      );
      return release;
    },
    increment: () => {
      const release = addPending();
      manualReleases.push(release);
      return release;
    },
    decrement: () => {
      const release = dequeueManualRelease();
      if (release) settle(release);
    },
  };

  provide(SuspenseContext, ctx);

  const renderChildren = (children: SuspenseProps['children']): void => {
    const version = ++boundaryVersion;

    currentChildren = children ?? null;
    pending = 0;
    resolved = null;
    hasResolved = false;
    manualReleases = [];

    disposeContent();
    disposeFallback();

    if (isPromise(children)) {
      children
        .then((value) => {
          if (!mounted || version !== boundaryVersion) return;
          resolved = value as AnyNode | AnyNode[];
          hasResolved = true;
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
  };

  // ── Initial render / prop updates ────────────────────────────────────────

  renderChildren(props.children);
  onUpdate(() => renderChildren(props.children));

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
