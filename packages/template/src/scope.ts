import { error } from '@estjs/shared';
import type { InjectionKey } from './provide';

/**
 * Scope represents an execution context in the component tree.
 * It manages provides, cleanup functions, and lifecycle hooks.
 */
export interface Scope {
  /** Unique identifier for debugging */
  readonly id: number;

  /** Parent scope in the hierarchy */
  parent: Scope | null;

  /** Child scopes (lazy initialized) */
  children: Set<Scope> | null;

  /** Provided values (lazy initialized) */
  provides: Map<InjectionKey<unknown> | string | number | symbol, unknown> | null;

  /** Cleanup functions (lazy initialized) */
  cleanup: Set<() => void> | null;

  /** Mount lifecycle hooks (lazy initialized) */
  onMount: Set<() => void | Promise<void>> | null;

  /** Update lifecycle hooks (lazy initialized) */
  onUpdate: Set<() => void | Promise<void>> | null;

  /** Destroy lifecycle hooks (lazy initialized) */
  onDestroy: Set<() => void | Promise<void>> | null;

  /** Whether the scope has been mounted */
  isMounted: boolean;

  /** Whether the scope has been destroyed */
  isDestroyed: boolean;
}

/** Currently active scope */
let activeScope: Scope | null = null;

/** Scope ID counter for unique identification */
let scopeId = 0;

/**
 * Get the currently active scope.
 * @returns The active scope or null if none is active
 */
export function getActiveScope(): Scope | null {
  return activeScope;
}

/**
 * Set the active scope (internal use).
 * @param scope - The scope to set as active
 */
export function setActiveScope(scope: Scope | null): void {
  activeScope = scope;
}

/**
 * Create a new scope with optional parent.
 * If no parent is provided, uses the current active scope as parent.
 *
 * @param parent - Optional parent scope (defaults to active scope)
 * @returns A new scope instance
 */
export function createScope(parent: Scope | null = activeScope): Scope {
  const scope: Scope = {
    id: ++scopeId,
    parent,
    children: null, // Lazy initialized
    provides: null, // Lazy initialized
    cleanup: null, // Lazy initialized
    onMount: null, // Lazy initialized
    onUpdate: null, // Lazy initialized
    onDestroy: null, // Lazy initialized
    isMounted: false,
    isDestroyed: false,
  };

  // Establish parent-child relationship
  if (parent) {
    if (!parent.children) {
      parent.children = new Set();
    }
    parent.children.add(scope);
  }

  return scope;
}

/**
 * Run a function within a scope, ensuring proper cleanup.
 * The previous active scope is restored even if the function throws.
 *
 * @param scope - The scope to run within
 * @param fn - The function to execute
 * @returns The return value of the function
 */
export function runWithScope<T>(scope: Scope, fn: () => T): T {
  const prevScope = activeScope;
  activeScope = scope;

  try {
    return fn();
  } finally {
    // Restore previous scope directly
    activeScope = prevScope;
  }
}

/**
 * Dispose a scope and all its children.
 * Children are disposed first (depth-first), then the scope itself.
 *
 * @param scope - The scope to dispose
 */
export function disposeScope(scope: Scope): void {
  // Idempotent: already destroyed
  if (!scope || scope.isDestroyed) {
    return;
  }

  // Dispose children first (depth-first)
  // Iterate directly without copying to avoid allocation
  if (scope.children) {
    // Use while loop since children will remove themselves during dispose
    while (scope.children.size > 0) {
      const child = scope.children.values().next().value;
      if (child) {
        disposeScope(child);
      }
    }
  }

  // Execute destroy lifecycle hooks
  if (scope.onDestroy) {
    for (const hook of scope.onDestroy) {
      try {
        hook();
      } catch (error_) {
        if (__DEV__) {
          error(`Scope(${scope.id}): Error in destroy hook:`, error_);
        }
      }
    }
    scope.onDestroy.clear();
  }

  // Execute cleanup functions
  if (scope.cleanup) {
    for (const fn of scope.cleanup) {
      try {
        fn();
      } catch (error_) {
        if (__DEV__) {
          error(`Scope(${scope.id}): Error in cleanup:`, error_);
        }
      }
    }
    scope.cleanup.clear();
  }

  // Remove from parent's children
  if (scope.parent?.children) {
    scope.parent.children.delete(scope);
  }

  // Clear all internal collections
  scope.children?.clear();
  scope.provides?.clear();
  scope.onMount?.clear();
  scope.onUpdate?.clear();

  // reset active with parent scope
  setActiveScope(scope.parent);

  // Break parent reference to prevent memory leaks
  scope.parent = null;

  // Mark as destroyed
  scope.isDestroyed = true;
}

/**
 * Register a cleanup function in the current scope.
 * The function will be called when the scope is disposed.
 *
 * @param fn - The cleanup function
 */
export function onCleanup(fn: () => void): void {
  const scope = activeScope;

  if (!scope) {
    if (__DEV__) {
      error('onCleanup() must be called within a scope');
    }
    return;
  }

  // Lazy initialize cleanup set
  if (!scope.cleanup) {
    scope.cleanup = new Set();
  }

  scope.cleanup.add(fn);
}
