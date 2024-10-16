import type { Signal } from '@estjs/signal';
import type { Hook } from '../types';

// Class to manage lifecycle and context for components
export class LifecycleContext {
  addEventListener(): void {}
  removeEventListener(): void {}

  // Static reference to the current context
  static ref: LifecycleContext | null = null;
  // Static context to store shared values
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

  // Initialize the static reference
  initRef() {
    LifecycleContext.ref = this;
  }

  // Remove the static reference
  removeRef() {
    LifecycleContext.ref = null;
  }

  // Clear all hooks
  clearHooks(): void {
    Object.values(this.hooks).forEach(set => set.clear());
  }
}
