import { isArray, isFunction, isPromise, warn } from '@estjs/shared';
import { isComputed, isSignal } from '@estjs/signals';
import { insertNode, normalizeNode } from '../dom';
import { provide } from '../provide';
import { onDestroy } from '../lifecycle';
import { SUSPENSE_COMPONENT } from '../constants';
import type { AnyNode } from '../types';

/** Clear all children from an element */
function clearContainer(el: HTMLElement): void {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}
export function resolveNodeValue(value: unknown): unknown {
  let current = value;

  while (isFunction(current)) {
    current = (current as Function)();
  }

  if (isSignal(current) || isComputed(current)) {
    return resolveNodeValue((current as any).value);
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
 * Suspense component - handles async content with a fallback UI.
 *
 * @param props - Component props with children, fallback, and optional key.
 * @returns {AnyNode} Placeholder node or fallback content.
 *
 * @example
 * ```tsx
 * <Suspense fallback={<div>Loading...</div>}>
 *   {asyncContent}
 * </Suspense>
 * ```
 */
export function Suspense(props: SuspenseProps): Node {
  // Create a container to manage content swapping
  const container = document.createElement('div');
  container.style.display = 'contents'; // Invisible wrapper

  // Track if component is still mounted (for async cleanup)
  let isMounted = true;
  let pendingCount = 0;
  let isShowingFallback = false;

  let resolvedChildren: AnyNode | AnyNode[] | null = null;

  /**
   * Materializes child.
   */
  const materializeChild = (value: AnyNode): AnyNode => {
    const current = resolveNodeValue(value);

    if (isArray(current)) {
      const nodes: AnyNode[] = [];
      for (const item of current as AnyNode[]) {
        const materialized = materializeChild(item);
        if (isArray(materialized)) {
          nodes.push(...(materialized as AnyNode[]));
        } else {
          nodes.push(materialized);
        }
      }
      return nodes as AnyNode;
    }

    return normalizeNode(current);
  };

  /**
   * Inserts a materialized child or child list into the container.
   */
  const insertMaterializedChild = (value: AnyNode) => {
    const normalized = materializeChild(value);
    const nodes = isArray(normalized) ? normalized : [normalized];

    for (const node of nodes) {
      if (node != null) {
        insertNode(container, node);
      }
    }
  };

  /**
   * Renders fallback content.
   */
  const renderFallbackContent = () => {
    clearContainer(container);

    if (props.fallback != null) {
      insertMaterializedChild(props.fallback);
    }
  };

  /**
   * Switches the boundary into its fallback view.
   */
  const showFallback = () => {
    if (isShowingFallback) return;
    isShowingFallback = true;
    renderFallbackContent();
  };

  /**
   * Restores the resolved children when the boundary can leave fallback mode.
   */
  const showChildren = () => {
    if (!isShowingFallback) return;

    // Check if we have something to show
    const hasContent = resolvedChildren || (props.children != null && !isPromise(props.children));

    if (!hasContent) {
      return;
    }

    isShowingFallback = false;

    clearContainer(container);

    if (resolvedChildren) {
      renderChildren(resolvedChildren);
    } else if (props.children != null && !isPromise(props.children)) {
      renderChildren(props.children);
    }
  };

  /**
   * Render children into the container.
   *
   * @param children - The children to render.
   * @returns {void}
   */
  const renderChildren = (children: AnyNode | AnyNode[]): void => {
    // Guard: don't render children if we should be showing fallback
    if (isShowingFallback) return;

    clearContainer(container);

    if (children == null) return;

    const childArray = isArray(children) ? children : [children];
    for (const child of childArray) {
      if (child != null) {
        insertMaterializedChild(child);
      }
    }

    // Resource registration may flip to fallback while children are mounting.
    if (isShowingFallback) {
      renderFallbackContent();
    }
  };

  // Context for resources to register themselves
  const suspenseContext: SuspenseContextType = {
    register: (promise: Promise<any>) => {
      pendingCount++;
      showFallback();

      promise
        .then(() => {
          if (!isMounted) return;
          pendingCount--;
          if (pendingCount === 0) {
            showChildren();
          }
        })
        .catch((error) => {
          if (__DEV__) {
            warn('[Suspense] Resource failed:', error);
          }
          if (!isMounted) return;
          pendingCount--;
          // For now, if error happens, we still try to show children (or maybe error boundary later)
          if (pendingCount === 0) {
            showChildren();
          }
        });
    },
    increment: () => {
      pendingCount++;
      showFallback();
    },
    decrement: () => {
      pendingCount = Math.max(0, pendingCount - 1);
      if (pendingCount === 0) {
        showChildren();
      }
    },
  };

  provide(SuspenseContext, suspenseContext);

  const children = props.children;

  // Initial render logic
  if (isPromise(children)) {
    // Async children - show fallback immediately, then resolve
    children
      .then((resolved) => {
        resolvedChildren = resolved;
      })
      .catch(() => {
        // Ignore error, handled by register
      });
    suspenseContext.register(children);
  } else if (children != null) {
    // Sync children - render immediately
    // If any child is a resource read, it will call register() synchronously during this render
    renderChildren(children);
  } else {
    // No children - show fallback if available
    showFallback();
  }

  onDestroy(() => {
    isMounted = false;
    pendingCount = 0;
    resolvedChildren = null;
    clearContainer(container);
    container.remove();
  });

  return container;
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
