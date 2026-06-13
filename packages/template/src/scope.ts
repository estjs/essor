import { error } from '@estjs/shared';
import { type EffectScope, effectScope, setCurrentScope } from '@estjs/signals';
import type { InjectionKey } from './provide';

/**
 * Scope represents an execution context in the component tree.
 * It manages provides, cleanup functions, and lifecycle hooks.
 */
export interface Scope {
  /** Unique identifier for debugging */
  readonly id: number;

  /** Reactive effect scope tied to this template scope */
  readonly effectScope: EffectScope;

  /** Parent scope in the hierarchy */
  parent: Scope | null;

  /** Child scopes (lazy initialized) */
  children: Set<Scope> | null;

  /** Provided values (lazy initialized) */
  provides: Map<InjectionKey<unknown> | string | number | symbol, unknown> | null;

  /** Cleanup functions (lazy initialized) */
  cleanup: Array<() => void> | null;

  /** Mount lifecycle hooks (lazy initialized) */
  onMount: Array<() => void | Promise<void>> | null;

  /** Update lifecycle hooks (lazy initialized) */
  onUpdate: Array<() => void | Promise<void>> | null;

  /** Destroy lifecycle hooks (lazy initialized) */
  onDestroy: Array<() => void | Promise<void>> | null;

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
 *
 * @returns The active scope or null if none is active.
 */
export function getActiveScope(): Scope | null {
  return activeScope;
}

/**
 * Set the active scope (internal use).
 *
 * @param scope - The scope to set as active.
 * @returns {void}
 */
export function setActiveScope(scope: Scope | null): void {
  activeScope = scope;
  setCurrentScope(scope?.effectScope);
}

/**
 * Create a new scope with optional parent.
 * If no parent is provided, uses the current active scope as parent.
 *
 * @param parent - Optional parent scope (defaults to active scope).
 * @returns A new scope instance.
 */
export function createScope(parent: Scope | null = activeScope): Scope {
  const reactiveScope = parent ? parent.effectScope.run(() => effectScope())! : effectScope(true);
  const scope: Scope = {
    id: ++scopeId,
    effectScope: reactiveScope,
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
 * @param scope - The scope to run within.
 * @param fn - The function to execute.
 * @returns The return value of the function.
 */
export function runWithScope<T>(scope: Scope, fn: () => T): T {
  const prevScope = activeScope;
  setActiveScope(scope);
  try {
    return scope.effectScope.run(fn) as T;
  } finally {
    setActiveScope(prevScope);
  }
}

/**
 * Dispose a scope and all its children.
 * Children are disposed first (depth-first), then the scope itself.
 *
 * @param scope - The scope to dispose.
 * @returns {void}
 */
export function disposeScope(scope: Scope): void {
  // Idempotent: already destroyed
  if (!scope || scope.isDestroyed) {
    return;
  }

  // Mark destroyed immediately to block re-entrant disposeScope calls
  // (e.g. an onDestroy hook that accidentally disposes the same scope again).
  scope.isDestroyed = true;

  // Detach from parent BEFORE running destroy hooks so the scope hierarchy
  // is consistent if a destroy hook walks the scope tree or disposes the parent.
  if (scope.parent?.children) {
    scope.parent.children.delete(scope);
  }
  // Break parent reference early to prevent any hook from accidentally
  // re-traversing up to an already-disposing ancestor.
  scope.parent = null;

  // Dispose children first (depth-first). Null each child's parent before
  // recursing so the child's own detach step is a no-op — otherwise it would
  // delete itself from this Set while we're iterating it.
  if (scope.children && scope.children.size > 0) {
    for (const child of scope.children) {
      if (child) {
        child.parent = null;
        disposeScope(child);
      }
    }
    scope.children.clear();
  }

  // Execute destroy hooks with this scope active so inject/provide work in callbacks.
  const prevScope = activeScope;
  setActiveScope(scope);
  if (scope.onDestroy) {
    for (let i = 0; i < scope.onDestroy.length; i++) {
      try {
        scope.onDestroy[i]();
      } catch (error_) {
        if (__DEV__) error(`Scope(${scope.id}): Error in destroy hook:`, error_);
      }
    }
    scope.onDestroy = null;
  }
  if (scope.cleanup) {
    for (let i = 0; i < scope.cleanup.length; i++) {
      try {
        scope.cleanup[i]();
      } catch (error_) {
        if (__DEV__) error(`Scope(${scope.id}): Error in cleanup:`, error_);
      }
    }
    scope.cleanup = null;
  }
  setActiveScope(prevScope);

  scope.effectScope.stop();

  // Clear all internal collections to prevent memory leaks
  if (scope.provides) {
    scope.provides.clear();
    scope.provides = null;
  }
  scope.onMount = null;
  scope.onUpdate = null;
  scope.children = null;
}

/**
 * Register a cleanup function in the current scope.
 * The function will be called when the scope is disposed.
 *
 * @param fn - The cleanup function.
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
