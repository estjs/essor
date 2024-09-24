import type { Signal } from '@estjs/signal';
import type { Hook } from '../../types';

export class HooksManager {
  addEventListener(): void {}
  removeEventListener(): void {}

  static ref: HooksManager | null = null;
  static context: Record<symbol, Signal<any>> = {};

  hooks: Record<Hook, Set<() => void>> = {
    mounted: new Set(),
    destroy: new Set(),
  };

  addHook(hook: Hook, cb: () => void): void {
    this.hooks[hook]?.add(cb);
  }

  getContext<T>(context: symbol | string | number): T | undefined {
    return HooksManager.context[context];
  }

  setContext<T>(context: symbol | string | number, value: T): void {
    HooksManager.context[context] = value;
  }

  initRef() {
    HooksManager.ref = this;
  }
  removeRef() {
    HooksManager.ref = null;
  }

  clearHooks(): void {
    Object.values(this.hooks).forEach(set => set.clear());
  }
}
