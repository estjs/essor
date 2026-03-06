import { error } from '@estjs/shared';
import { triggerDestroyHooks } from './lifecycle';
import type { InjectionKey } from './provide';


export interface Scope {
  /// Unique identifier for debugging and tracking scope lifetime
  readonly id: number;

  // Parent scope in the tree 
  parent: Scope | null;

  // Child scopes created within this scope
  children: Scope[] | null;

 // Provided values map for dependency injection
  provides: Map<InjectionKey<unknown> | string | number | symbol, unknown> | null;

 // Set of cleanup functions to run on scope disposal 
  cleanup: (() => void)[] | null;

 // Mount lifecycle hooks - run once after first render
  onMount: (() => void | Promise<void>)[] | null;

  // Update lifecycle hooks
  onUpdate: (() => void | Promise<void>)[] | null;

 // Destroy lifecycle hooks - run before scope disposal 
  onDestroy: (() => void | Promise<void>)[] | null;

 // Flag indicating whether the scope has completed its mount phase 
  isMounted: boolean;

 // Flag indicating whether the scope has been disposed
  isDestroyed: boolean;
}

// Currently active scope 
let activeScope: Scope | null = null;

// Scope ID counter for unique identification 
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

export function createScope(parent: Scope | null = activeScope): Scope {
  const scope: Scope = {
    id: ++scopeId,
    parent,
    children: null, 
    provides: null, 
    cleanup: null, 
    onMount: null, 
    onUpdate: null, 
    onDestroy: null, 
    isMounted: false,
    isDestroyed: false,
  };

  // Establish parent-child relationship
  if (parent) {
    if (!parent.children) {
      parent.children = [];
    }
    parent.children.push(scope);
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
 * Dispose a scope and recursively dispose all child scopes.
 * Performs the following cleanup in order:
 * 1. Recursively disposes all children (depth-first)
 * 2. Executes destroy lifecycle hooks
 * 3. Executes registered cleanup functions
 * 4. Removes scope from parent's children list
 * 5. Clears all internal collections and resets state
 *
 * Safe to call multiple times (idempotent).
 *
 * @param scope - The scope to dispose
 *
 * @example
 * ```ts
 * const scope = createScope(parent);
 * // ... use scope ...
 * disposeScope(scope); // Cleanup everything
 * ```
 */
export function disposeScope(scope: Scope): void {
  // Idempotent: skip if already destroyed
  if (!scope || scope.isDestroyed) {
    return;
  }

  const parentScope = scope.parent;

  // Recursively dispose children first (depth-first cleanup)
  if (scope.children) {
    for (const child of scope.children) {
      disposeScope(child);
    }
    scope.children.length = 0;
  }

  //  Execute destroy lifecycle hooks
  if (scope.onDestroy?.length) {
    triggerDestroyHooks(scope);
    scope.onDestroy.length = 0;
  }

  //  Execute cleanup functions in reverse order
  if (scope.cleanup?.length) {
    for (const fn of scope.cleanup) {
      try {
        fn();
      } catch (error_) {
        if (__DEV__) {
          error(`Scope(${scope.id}): Error in cleanup:`, error_);
        }
      }
    }
    scope.cleanup.length = 0;
  }

  // Step 4: Remove from parent's children array
  if (parentScope?.children) {
    const idx = parentScope.children.indexOf(scope);
    if (idx !== -1) {
      parentScope.children.splice(idx, 1);
    }
  }

  // Clear provides map
  scope.provides?.clear();

  // Clear mount and update hooks
  if (scope.onMount) scope.onMount.length = 0;
  if (scope.onUpdate) scope.onUpdate.length = 0;

  // Clear references to prevent memory leaks
  scope.parent = null;
  scope.isDestroyed = true;

  // Restore parent scope context if it was active
  if (activeScope === scope) {
    activeScope = parentScope;
  }
}



/**
 * Register a cleanup function to be executed when the scope is disposed.
 * Useful for cleaning up timers, subscriptions, event listeners, etc.
 *
 * Cleanup functions are executed in LIFO order (last registered, first executed).
 * Cleanup errors don't prevent other cleanups from running.
 *
 * @param fn - The cleanup function to register
 *
 * @throws Error in dev mode if called outside a scope
 *
 * @example
 * ```ts
 * const timerId = setInterval(() => {}, 1000);
 * onCleanup(() => clearInterval(timerId));
 * ```
 */
export function onCleanup(fn: () => void): void {
  const scope = activeScope;

  if (!scope) {
    if (__DEV__) {
      error('onCleanup() must be called within a scope');
    }
    return;
  }

  // Lazy initialize cleanup array
  if (!scope.cleanup) {
    scope.cleanup = [];
  }

  scope.cleanup.push(fn);
}
