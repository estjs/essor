import type { Signal } from '@aube/signal';
import type { Hook } from '../types';

export class LifecycleContext {
  addEventListener(): void {}
  removeEventListener(): void {}

  static ref: LifecycleContext | null = null;
  static context: Record<symbol, Signal<any>> = {};

  // Hooks for different lifecycle stages
  hooks: Record<Hook, Set<() => void>> = {
    mounted: new Set(),
    destroy: new Set(),
  };

  // Add a hook for a specific lifecycle stage
  addHook(hook: Hook, cb: () => void): void {
    this.hooks[hook]?.add(cb);
  }

  // Get a value from the static context
  getContext<T>(context: symbol | string | number): T | undefined {
    return LifecycleContext.context[context];
  }

  // Set a value in the static context
  setContext<T>(context: symbol | string | number, value: T): void {
    LifecycleContext.context[context] = value;
  }

  initRef() {
    LifecycleContext.ref = this;
  }

  removeRef() {
    LifecycleContext.ref = null;
  }

  // Clear all hooks
  clearHooks(): void {
    Object.values(this.hooks).forEach(set => set.clear());
  }
}
