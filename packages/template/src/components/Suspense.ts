import { isArray, isPromise, isUndefined, warn } from '@estjs/shared';
import { provide } from '../provide';
import { isComponent } from '../component';
import { insertNode, normalizeNode } from '../utils';
import { COMPONENT_TYPE } from '../constants';
import { onDestroy } from '../lifecycle';
import { getActiveScope } from '../scope';
import type { AnyNode } from '../types';

export interface SuspenseProps {
  /** The content to render. Can be a Promise for async loading. */
  children?: AnyNode | AnyNode[] | Promise<AnyNode | AnyNode[]>;
  /** Fallback content to display while children is loading (Promise pending). */
  fallback?: AnyNode;
  /** Optional key for reconciliation. */
  key?: string;
}

/**
 * Suspense component - handles async content with a fallback UI
 *
 * @param props - Component props with children, fallback, and optional key
 * @returns Placeholder node or fallback content
 *
 * @example
 * ```tsx
 * <Suspense fallback={<div>Loading...</div>}>
 *   {asyncContent}
 * </Suspense>
 * ```
 */
export const SuspenseContext = Symbol('SuspenseContext');

export interface SuspenseContextType {
  register: (promise: Promise<any>) => void;
  increment: () => void;
  decrement: () => void;
}

/**
 * Suspense component - handles async content with a fallback UI
 *
 * @param props - Component props with children, fallback, and optional key
 * @returns Placeholder node or fallback content
 *
 * @example
 * ```tsx
 * <Suspense fallback={<div>Loading...</div>}>
 *   {asyncContent}
 * </Suspense>
 * ```
 */
export function Suspense(props: SuspenseProps): Node | string {
  // Check if we're in SSR mode (no document)
  if (isUndefined(document)) {
    // In SSR, return fallback as string if available
    const fallback = props.fallback;
    if (fallback) {
      return String(fallback || '');
    }
    return '';
  }

  // Create a container to manage content swapping
  const container = document.createElement('div');
  container.style.display = 'contents'; // Invisible wrapper

  // Track if component is still mounted (for async cleanup)
  let isMounted = true;
  let pendingCount = 0;
  let isShowingFallback = false;

  let resolvedChildren: AnyNode | AnyNode[] | null = null;

  const showFallback = () => {
    if (isShowingFallback) return;
    isShowingFallback = true;

    // Clear container
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    if (props.fallback != null) {
      const normalized = normalizeNode(props.fallback);
      if (normalized) {
        insertNode(container, normalized);
      }
    }
  };

  const showChildren = () => {
    if (!isShowingFallback) return;

    // Check if we have something to show
    // If children is a promise, we need resolvedChildren.
    // If children is not a promise, we use it directly.
    const hasContent = resolvedChildren || (props.children != null && !isPromise(props.children));

    if (!hasContent) {
      // If we don't have content (e.g. promise rejected), keep fallback
      return;
    }

    isShowingFallback = false;

    // Clear container (remove fallback)
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    // Simple implementation: Re-render children
    if (resolvedChildren) {
      renderChildren(resolvedChildren);
    } else if (props.children != null && !isPromise(props.children)) {
      renderChildren(props.children);
    }
  };

  /**
   * Render children into the container
   */
  const renderChildren = (children: AnyNode | AnyNode[]): void => {
    // Clear existing content
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    if (children == null) return;

    const currentScope = getActiveScope();
    const childArray = isArray(children) ? children : [children];
    childArray.forEach(child => {
      if (child != null) {
        // Reparent component to current context to ensure it can access SuspenseContext
        // This is necessary because children are created in the parent scope
        if (isComponent(child)) {
          (child as any).parentContext = currentScope;
        }

        const normalized = normalizeNode(child);
        if (normalized) {
          insertNode(container, normalized);
        }
      }
    });

    // Fix: If a child suspended during insertion, we might have both fallback and children in the container.
    // We need to ensure that if we are in fallback mode, only fallback is shown.
    if (isShowingFallback) {
      // We are in fallback mode.
      // Clear everything (including the just-inserted children)
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
      // Re-insert fallback
      if (props.fallback != null) {
        const normalized = normalizeNode(props.fallback);
        if (normalized) {
          insertNode(container, normalized);
        }
      }
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
        .catch(error => {
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
      pendingCount--;
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
      .then(resolved => {
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
    // Clear container
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
  });

  return container;
}

Suspense[COMPONENT_TYPE.SUSPENSE] = true;

/**
 * Check if a node is a Suspense component
 * @param node - Node to check
 * @returns true if node is a Suspense
 */
export function isSuspense(node: unknown): boolean {
  return !!node && !!(node as any)[COMPONENT_TYPE.SUSPENSE];
}
