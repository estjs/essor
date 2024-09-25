import type { Signal } from '@estjs/signal';
import type { Hook } from '../types';

// create lifecycle and context
export class LifecycleContext {
  addEventListener(): void {}
  removeEventListener(): void {}

  // current context ref
  static ref: LifecycleContext | null = null;
  static context: Record<symbol, Signal<any>> = {};

  hooks: Record<Hook, Set<() => void>> = {
    mounted: new Set(),
    destroy: new Set(),
  };

  addHook(hook: Hook, cb: () => void): void {
    this.hooks[hook]?.add(cb);
  }

  getContext<T>(context: symbol | string | number): T | undefined {
    return LifecycleContext.context[context];
  }

  setContext<T>(context: symbol | string | number, value: T): void {
    LifecycleContext.context[context] = value;
  }

  initRef() {
    LifecycleContext.ref = this;
  }
  removeRef() {
    LifecycleContext.ref = null;
  }

  clearHooks(): void {
    Object.values(this.hooks).forEach(set => set.clear());
  }
}
