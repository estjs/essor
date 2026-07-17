import { error } from '@estjs/shared';
import { type EffectScope, effectScope, setCurrentScope } from '@estjs/signals';
import { requestSlotProviders } from './request-slots';
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
 * Host-injectable storage slot for the active scope.
 *
 * On the client the active scope lives in the module-global `activeScope`
 * above. During SSR, `@estjs/server` installs a provider backed by
 * AsyncLocalStorage so that concurrent requests interleaving `await`s do not
 * clobber each other's scope. A provider returning `undefined` (or no
 * provider at all) falls back to the module global — the browser path pays
 * only a single optional-call check.
 */
export interface ActiveScopeSlot {
  scope: Scope | null;
}

type ActiveScopeSlotProvider = () => ActiveScopeSlot | undefined;

/**
 * Install (or clear) the request-local active-scope slot provider.
 *
 * Internal: consumed by `@estjs/server` via `@estjs/template/internal`.
 *
 * Stored in the cross-bundle `requestSlotProviders()` registry (NOT a module
 * variable): the CJS build inlines a separate copy of this module into each
 * entry bundle, and a module-level provider variable would be written by one
 * copy and read by the other. See request-slots.ts.
 *
 * @param provider - Returns the current request's slot, or `undefined` to
 *   fall back to the module-global active scope.
 */
export function setActiveScopeSlotProvider(provider: ActiveScopeSlotProvider | undefined): void {
  requestSlotProviders().activeScope = provider;
}

function activeScopeSlot(): ActiveScopeSlot | undefined {
  const provider = requestSlotProviders().activeScope as ActiveScopeSlotProvider | undefined;
  return provider?.();
}

/**
 * Get the currently active scope.
 *
 * @returns The active scope or null if none is active.
 */
export function getActiveScope(): Scope | null {
  const slot = activeScopeSlot();
  return slot ? slot.scope : activeScope;
}

/**
 * Set the active scope (internal use).
 *
 * @param scope - The scope to set as active.
 * @returns {void}
 */
export function setActiveScope(scope: Scope | null): void {
  const slot = activeScopeSlot();
  if (slot) {
    slot.scope = scope;
  } else {
    activeScope = scope;
  }
  setCurrentScope(scope?.effectScope);
}

/**
 * Activate only the reactive effect scope associated with a template scope.
 *
 * Hosts that provide request-local template state use this narrow adapter to
 * bracket one synchronous execution segment without changing the active
 * template scope itself.
 *
 * @param scope - The template scope whose reactive effects should be active.
 * @returns An idempotent function that restores the previous effect scope.
 */
export function activateScopeEffects(scope: Scope): () => void {
  const previousScope = setCurrentScope(scope.effectScope);
  let restored = false;

  return () => {
    if (restored) return;
    restored = true;
    setCurrentScope(previousScope);
  };
}

/**
 * Create a new scope with optional parent.
 * If no parent is provided, uses the current active scope as parent.
 *
 * @param parent - Optional parent scope (defaults to active scope).
 * @returns A new scope instance.
 */
export function createScope(parent: Scope | null = getActiveScope()): Scope {
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
  const prevScope = getActiveScope();
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

  // Dispose children first (depth-first). Iterate a snapshot so each child's
  // own detach step (which deletes it from this Set) cannot corrupt the loop.
  // The child's parent link stays intact during its hooks so inject() inside
  // child destroy callbacks can still see ancestors.
  if (scope.children && scope.children.size > 0) {
    for (const child of [...scope.children]) {
      if (child) {
        disposeScope(child);
      }
    }
    scope.children.clear();
  }

  // Execute destroy hooks and cleanups with this scope active — and with the
  // parent link still intact — so inject()/provide() lookups inside the
  // callbacks can resolve ancestor scopes. Detaching happens only
  // after all user callbacks have run.
  const prevScope = getActiveScope();
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

  // Detach from parent LAST — hooks/cleanups above may still walk the tree.
  if (scope.parent?.children) {
    scope.parent.children.delete(scope);
  }
  scope.parent = null;

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
  const scope = getActiveScope();

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
