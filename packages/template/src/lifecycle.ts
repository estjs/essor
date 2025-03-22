import { getCurrentContext } from './context';
import type { LifecycleContext, LifecycleHook } from './types';

/**
 * Creates a new lifecycle context
 */
export function createLifecycleContext(): LifecycleContext {
  return {
    mounted: new Set<LifecycleHook>(),
    unmounted: new Set<LifecycleHook>(),
    updated: new Set<LifecycleHook>(),
  };
}

/**
 * Registers a lifecycle hook
 */
export function registerHook(type: keyof LifecycleContext, hook: LifecycleHook) {
  const ctx = getCurrentContext();
  if (!ctx) {
    throw new Error(`Cannot register ${type} hook outside component context`);
  }

  ctx[type].add(hook);
}

export const onMounted = (hook: LifecycleHook) => registerHook('mounted', hook);
export const onUnmounted = (hook: LifecycleHook) => registerHook('unmounted', hook);
export const onUpdated = (hook: LifecycleHook) => registerHook('updated', hook);

export function cleanupLifecycle() {
  const ctx = getCurrentContext();
  if (!ctx) {
    return;
  }
  ctx.mounted.clear();
  ctx.unmounted.clear();
  ctx.updated.clear();
}
