import { error } from '@estjs/shared';
import { type Scope, getActiveScope, runWithScope } from './scope';

export type LifecycleHook = () => void | Promise<void>;

export const LIFECYCLE = {
  mount: 'mount',
  destroy: 'destroy',
  update: 'update',
} as const;

export type LifecycleType = (typeof LIFECYCLE)[keyof typeof LIFECYCLE];

export type LifecycleHooks = {
  [key in LifecycleType]: Set<LifecycleHook>;
};

/**
 * Create a new lifecycle context (deprecated)
 * @deprecated Lifecycle hooks are now managed by Scope
 * @returns A new lifecycle hooks object
 */
export function createLifecycleContext(): LifecycleHooks {
  return {
    mount: new Set<LifecycleHook>(),
    destroy: new Set<LifecycleHook>(),
    update: new Set<LifecycleHook>(),
  };
}

/**
 * Register a lifecycle hook
 * @param type - The type of lifecycle hook to register
 * @param hook - The hook function to register
 */
export function registerLifecycleHook(type: LifecycleType, hook: LifecycleHook): void {
  switch (type) {
    case LIFECYCLE.mount:
      registerMountHook(hook);
      break;
    case LIFECYCLE.update:
      registerUpdateHook(hook);
      break;
    case LIFECYCLE.destroy:
      registerDestroyHook(hook);
      break;
    default:
      if (__DEV__) {
        error(`Invalid lifecycle type: ${type}`);
      }
  }
}

/**
 * Register a mount lifecycle hook.
 * If the scope is already mounted, the hook is executed immediately.
 *
 * @param hook - The mount hook function
 */
export function registerMountHook(hook: () => void | Promise<void>): void {
  const scope = getActiveScope();

  if (!scope) {
    if (__DEV__) {
      error('onMount() must be called within a scope');
    }
    return;
  }

  // If already mounted, execute immediately
  if (scope.isMounted) {
    try {
      hook();
    } catch (error_) {
      if (__DEV__) {
        error(`Scope(${scope.id}): Error in mount hook:`, error_);
      }
    }
    return;
  }

  // Lazy initialize mount hooks set
  if (!scope.onMount) {
    scope.onMount = new Set();
  }

  scope.onMount.add(hook);
}

/**
 * Register an update lifecycle hook.
 *
 * @param hook - The update hook function
 */
export function registerUpdateHook(hook: () => void | Promise<void>): void {
  const scope = getActiveScope();

  if (!scope) {
    if (__DEV__) {
      error('onUpdate() must be called within a scope');
    }
    return;
  }

  // Lazy initialize update hooks set
  if (!scope.onUpdate) {
    scope.onUpdate = new Set();
  }

  scope.onUpdate.add(hook);
}

/**
 * Register a destroy lifecycle hook.
 *
 * @param hook - The destroy hook function
 */
export function registerDestroyHook(hook: () => void | Promise<void>): void {
  const scope = getActiveScope();

  if (!scope) {
    if (__DEV__) {
      error('onDestroy() must be called within a scope');
    }
    return;
  }

  // Lazy initialize destroy hooks set
  if (!scope.onDestroy) {
    scope.onDestroy = new Set();
  }

  scope.onDestroy.add(hook);
}

/**
 * Trigger mount lifecycle hooks for a scope.
 *
 * @param scope - The scope to trigger mount hooks for
 */
export function triggerMountHooks(scope: Scope): void {
  if (!scope || scope.isDestroyed || scope.isMounted) {
    return;
  }

  scope.isMounted = true;

  if (scope.onMount) {
    runWithScope(scope, () => {
      for (const hook of scope.onMount!) {
        try {
          hook();
        } catch (error_) {
          if (__DEV__) {
            error(`Scope(${scope.id}): Error in mount hook:`, error_);
          }
        }
      }
    });
  }
}

/**
 * Trigger update lifecycle hooks for a scope.
 *
 * @param scope - The scope to trigger update hooks for
 */
export function triggerUpdateHooks(scope: Scope): void {
  if (!scope || scope.isDestroyed) {
    return;
  }

  if (scope.onUpdate) {
    for (const hook of scope.onUpdate) {
      try {
        hook();
      } catch (error_) {
        if (__DEV__) {
          error(`Scope(${scope.id}): Error in update hook:`, error_);
        }
      }
    }
  }
}

/**
 * Trigger lifecycle hooks of a specific type for the active scope.
 * @param type - The type of lifecycle hooks to trigger
 */
export function triggerLifecycleHook(type: LifecycleType): void | Promise<void> {
  const scope = getActiveScope();
  if (!scope) {
    if (__DEV__) {
      error(`triggerLifecycleHook(${type}) called outside of a scope`);
    }
    return;
  }

  switch (type) {
    case LIFECYCLE.mount:
      return triggerMountHooks(scope);
    case LIFECYCLE.update:
      return triggerUpdateHooks(scope);
    case LIFECYCLE.destroy:
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
      }
      break;
  }
}
/**
 * Register a mount lifecycle hook.
 * Called after the component is mounted to the DOM.
 *
 * @param hook - The hook function to execute on mount
 */
export function onMount(hook: LifecycleHook): void {
  registerMountHook(hook);
}

/**
 * Register a destroy lifecycle hook.
 * Called before the component is removed from the DOM.
 *
 * @param hook - The hook function to execute on destroy
 */
export function onDestroy(hook: LifecycleHook): void {
  registerDestroyHook(hook);
}

/**
 * Register an update lifecycle hook.
 * Called after the component updates.
 *
 * @param hook - The hook function to execute on update
 */
export function onUpdate(hook: LifecycleHook): void {
  registerUpdateHook(hook);
}

/**
 * Cleanup lifecycle hooks for a context (deprecated)
 * @deprecated Use disposeScope instead
 * @param context - The context to cleanup
 */
export function cleanupLifecycle(context?: Scope): void {
  const scope = context || getActiveScope();
  if (!scope) {
    return;
  }

  // Clear all lifecycle hooks
  scope.onMount?.clear();
  scope.onDestroy?.clear();
  scope.onUpdate?.clear();
}
