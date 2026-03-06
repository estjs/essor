import { error, isPromise } from '@estjs/shared';
import { type Scope, getActiveScope, runWithScope } from './scope';

/**
 * Lifecycle hook type: returns void or a Promise that resolves when complete.
 * Hooks can perform cleanup by returning a cleanup function.
 */
export type LifecycleHook = () => void | Promise<void>;

/**
 * Lifecycle phases enumeration.
 * - mount: Initial render and component setup
 * - update: Re-render after props or state changes
 * - destroy: Cleanup before scope disposal
 */
export const LIFECYCLE = {
  mount: 'mount',
  destroy: 'destroy',
  update: 'update',
} as const;

export type LifecycleType = (typeof LIFECYCLE)[keyof typeof LIFECYCLE];

/**
 * Lifecycle hooks registry type.
 * Maps lifecycle phases to arrays of registered hooks.
 */
export type LifecycleHooks = {
  [key in LifecycleType]: LifecycleHook[];
};

/**
 * Register a hook into a scope's lifecycle list.
 * Lazily initializes the hook list if not already present.
 * Prevents duplicate registration of the same hook function.
 *
 * @internal
 */
function registerScopedHook(
  scope: Scope,
  listKey: 'onMount' | 'onUpdate' | 'onDestroy',
  hook: LifecycleHook,
): void {
  let hookList = scope[listKey];
  if (!hookList) {
    hookList = scope[listKey] = [];
  }
  // Prevent duplicate registration of the same hook function
  // This is important when component function is re-executed in forceUpdate
  if (!hookList.includes(hook)) {
    hookList.push(hook);
  }
}

/**
 * Execute an array of lifecycle hooks, collecting async results.
 * Errors in individual hooks don't prevent others from executing.
 *
 * @internal
 */
function executeHooks(
  hooks: LifecycleHook[],
  scopeId: number,
  phase: 'mount' | 'update' | 'destroy',
): void | Promise<void> {
  const len = hooks.length;
  if (len === 0) return;

  let pending: Promise<void>[] | undefined;

  for (let i = 0; i < len; i++) {
    try {
      const result = hooks[i]();
      if (isPromise(result)) {
        const safePromise = result.catch(error_ => {
          if (__DEV__) {
            error(`Scope(${scopeId}): Async ${phase} hook rejected:`, error_);
          }
        });
        (pending ?? (pending = [])).push(safePromise);
      }
    } catch (error_) {
      if (__DEV__) {
        error(`Scope(${scopeId}): Error in ${phase} hook:`, error_);
      }
    }
  }

  if (!pending) return;
  return Promise.all(pending).then(() => undefined);
}

/**
 * Register a mount lifecycle hook.
 * Runs after component is mounted and virtual tree is committed.
 * If the scope is already mounted, the hook executes immediately.
 *
 * @throws Error in dev mode if called outside a scope
 * @example
 * ```tsx
 * onMount(() => {
 *   console.log('Component mounted');
 *   return () => console.log('Cleanup');
 * });
 * ```
 */
export function onMount(hook: LifecycleHook): void {
  const scope = getActiveScope();

  if (!scope) {
    if (__DEV__) error('onMount() must be called within a scope');
    return;
  }

  if (scope.isMounted) {
    // Scope already mounted, execute immediately
    try {
      const result = hook();
      if (isPromise(result)) {
        result.catch(error_ => {
          if (__DEV__) error(`Scope(${scope.id}): Async ${LIFECYCLE.mount} hook rejected:`, error_);
        });
      }
    } catch (error_) {
      if (__DEV__) error(`Scope(${scope.id}): Error in ${LIFECYCLE.mount} hook:`, error_);
    }
    return;
  }

  registerScopedHook(scope, 'onMount', hook);
}

/**
 * Register an update lifecycle hook.
 * Runs whenever the component re-renders due to prop or state changes.
 *
 * @throws Error in dev mode if called outside a scope
 * @example
 * ```tsx
 * onUpdate(() => {
 *   console.log('Component updated');
 * });
 * ```
 */
export function onUpdate(hook: LifecycleHook): void {
  const scope = getActiveScope();

  if (!scope) {
    if (__DEV__) error('onUpdate() must be called within a scope');
    return;
  }

  registerScopedHook(scope, 'onUpdate', hook);
}

/**
 * Register a destroy lifecycle hook.
 * Runs before scope is disposed and resources are cleaned up.
 * Perfect for resetting external state, unsubscribing from events, etc.
 *
 * @throws Error in dev mode if called outside a scope
 * @example
 * ```tsx
 * onDestroy(() => {
 *   unsubscribe();
 *   clearTimeout(timerId);
 * });
 * ```
 */
export function onDestroy(hook: LifecycleHook): void {
  const scope = getActiveScope();

  if (!scope) {
    if (__DEV__) error('onDestroy() must be called within a scope');
    return;
  }

  registerScopedHook(scope, 'onDestroy', hook);
}

/**
 * Trigger all mount hooks registered in a scope.
 * Clears the hook list after execution and marks scope as mounted.
 *
 * @internal
 */
export function triggerMountHooks(scope: Scope): void | Promise<void> {
  if (scope.isDestroyed || !scope.onMount?.length) {
    scope.isMounted = true;
    return;
  }

  const mountHooks = scope.onMount;
  const result = runWithScope(scope, () => executeHooks(mountHooks, scope.id, LIFECYCLE.mount));
  mountHooks.length = 0; // Clear for garbage collection
  scope.isMounted = true;
  return result;
}

/**
 * Trigger all update hooks registered in a scope.
 * Clears the hook list after execution to prevent re-execution on next update.
 *
 * @internal
 */
export function triggerUpdateHooks(scope: Scope): void | Promise<void> {
  if (scope.isDestroyed || !scope.onUpdate?.length) return;
  const updateHooks = scope.onUpdate;
  const result = runWithScope(scope, () => executeHooks(updateHooks, scope.id, 'update'));
  updateHooks.length = 0; // Clear for next update cycle
  return result;
}

/**
 * Trigger all destroy hooks registered in a scope.
 * Hooks are executed in the scope context before resources are freed.
 *
 * @internal
 */
export function triggerDestroyHooks(scope: Scope): void | Promise<void> {
  if (scope.isDestroyed || !scope.onDestroy?.length) return;
  return runWithScope(scope, () => executeHooks(scope.onDestroy!, scope.id, 'destroy'));
}
