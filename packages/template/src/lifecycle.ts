import { error } from '@estjs/shared';
import { type Context, getActiveContext } from './context';

export type LifecycleHook = () => void;

export const LIFECYCLE = {
  mounted: 'mounted',
  destroyed: 'destroyed',
  updated: 'updated',
} as const;

export type LifecycleType = (typeof LIFECYCLE)[keyof typeof LIFECYCLE];

export type LifecycleHooks = {
  [key in LifecycleType]: Set<LifecycleHook>;
};

/**
 * create a new lifecycle context
 * @returns {LifecycleHooks} a new lifecycle context
 */
export function createLifecycleContext() {
  return Object.keys(LIFECYCLE).reduce((acc, type) => {
    acc[type] = new Set<LifecycleHook>();
    return acc;
  }, {} as LifecycleHooks);
}

/**
 * register a lifecycle hook
 * @param {LifecycleType}  type - the type of lifecycle hook to register
 * @param {LifecycleHook}  hook - the hook to register
 */
export function registerLifecycleHook(type: LifecycleType, hook: LifecycleHook) {
  const context = getActiveContext();
  // check if context is active
  if (!context) {
    error(`Cannot register ${type} hook outside component context`);
    return;
  }

  // check if type is valid
  if (!LIFECYCLE[type]) {
    error(`Invalid lifecycle type: ${type}`);
    return;
  }

  // check if type is mounted and context is mounted
  if (type === LIFECYCLE.mounted && context.isMounted) {
    try {
      hook();
    } catch (error_) {
      error(`Error in ${type} hook:`, error_);
    }
    return;
  }

  context[type].add(hook);
}

/**
 * trigger a lifecycle hook
 * @param {LifecycleType} type - the type of lifecycle hook to trigger
 */
export function triggerLifecycleHook(type: LifecycleType) {
  const context = getActiveContext();
  // check if context is active
  if (!context) {
    error(`Cannot trigger ${type} hook outside component context`);
    return;
  }

  const hooks = context[type];
  if (!hooks?.size) {
    return;
  }

  hooks.forEach(hook => {
    try {
      hook();
    } catch (error_) {
      if (__DEV__) {
        error(`Error in ${type} lifecycle hook:`, error_);
      }
    }
  });
}

// on mount
export function onMounted(hook: LifecycleHook) {
  registerLifecycleHook(LIFECYCLE.mounted, hook);
}

// on destroyed
export function onDestroyed(hook: LifecycleHook) {
  registerLifecycleHook(LIFECYCLE.destroyed, hook);
}

// on updated
export function onUpdated(hook: LifecycleHook) {
  registerLifecycleHook(LIFECYCLE.updated, hook);
}

/**
 * cleanup lifecycle
 * @param {Context} context - the context to cleanup
 */
export function cleanupLifecycle(context?: Context): void {
  const ctx = context || getActiveContext();
  if (!ctx) {
    return;
  }

  // clear all lifecycle hooks
  if (ctx.mounted) {
    ctx.mounted.clear();
  }
  if (ctx.destroyed) {
    ctx.destroyed.clear();
  }
  if (ctx.updated) {
    ctx.updated.clear();
  }
}
