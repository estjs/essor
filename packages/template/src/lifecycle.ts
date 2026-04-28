import { error, isPromise } from '@estjs/shared';
import { type Scope, getActiveScope, runWithScope } from './scope';

export type LifecycleHook = () => void | Promise<void>;

/**
 * Registers scoped hook.
 *
 * @param scope - The scope to register the hook for.
 * @param listKey - The key of the hook list.
 * @param hook - The hook function to register.
 */
function registerScopedHook(
  scope: Scope,
  listKey: 'onMount' | 'onUpdate' | 'onDestroy',
  hook: LifecycleHook,
): void {
  let hookList = scope[listKey];
  if (!hookList) {
    hookList = [];
    scope[listKey] = hookList;
  }
  hookList.push(hook);
}

/**
 * Executes lifecycle hooks and captures async rejections in dev mode.
 *
 * @param hooks - The array of hooks to execute.
 * @param scopeId - The ID of the scope.
 * @param phase - The lifecycle phase.
 * @returns A promise if any hooks are asynchronous, or undefined.
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
        const safePromise = result.catch((error_) => {
          if (__DEV__) {
            error(`Scope(${scopeId}): Async ${phase} hook rejected:`, error_);
          }
        });
        (pending || (pending = [])).push(safePromise);
      }
    } catch (error_) {
      if (__DEV__) {
        error(`Scope(${scopeId}): Error in ${phase} hook:`, error_);
      }
    }
  }

  if (!pending) return;
  return Promise.all(pending).then(() => {});
}

/**
 * Register a mount lifecycle hook.
 * If the scope is already mounted, the hook is executed immediately.
 *
 * @param hook - The hook function to register.
 * @returns {void}
 */
export function onMount(hook: LifecycleHook): void {
  const scope = getActiveScope();

  if (!scope) {
    if (__DEV__) error('onMount() must be called within a scope');
    return;
  }

  if (scope.isMounted) {
    try {
      const result = hook();
      if (isPromise(result)) {
        result.catch((error_) => {
          if (__DEV__) error(`Scope(${scope.id}): Async mount hook rejected:`, error_);
        });
      }
    } catch (error_) {
      if (__DEV__) error(`Scope(${scope.id}): Error in mount hook:`, error_);
    }
    return;
  }

  registerScopedHook(scope, 'onMount', hook);
}

/**
 * Register an update lifecycle hook.
 *
 * @param hook - The hook function to register.
 * @returns {void}
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
 *
 * @param hook - The hook function to register.
 * @returns {void}
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
 * Trigger mount lifecycle hooks for a scope.
 *
 * @param scope - The scope to trigger hooks for.
 * @returns A promise if any hooks are asynchronous, or undefined.
 */
export function triggerMountHooks(scope: Scope): void | Promise<void> {
  if (scope.isDestroyed) {
    return;
  }
  if (!scope.onMount || scope.onMount.length === 0) {
    scope.isMounted = true;
    return;
  }

  const mountHooks = scope.onMount;
  const result = runWithScope(scope, () => executeHooks(mountHooks, scope.id, 'mount'));
  mountHooks.length = 0;
  scope.isMounted = true;
  return result;
}

/**
 * Trigger update lifecycle hooks for a scope.
 *
 * @param scope - The scope to trigger hooks for.
 * @returns A promise if any hooks are asynchronous, or undefined.
 */
export function triggerUpdateHooks(scope: Scope): void | Promise<void> {
  if (scope.isDestroyed || !scope.onUpdate || scope.onUpdate.length === 0) return;
  return runWithScope(scope, () => executeHooks(scope.onUpdate!, scope.id, 'update'));
}

// NOTE: destroy hooks are executed directly inside `disposeScope` to keep
// the teardown path synchronous and free of extra `runWithScope` frames.
// See `./scope.ts`.
