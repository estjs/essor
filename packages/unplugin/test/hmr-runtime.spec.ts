import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyUpdate,
  createHMRComponent,
  hmrAccept,
  unregisterAllInstances,
} from '../src/hmr-runtime';

interface HMRComponent {
  (): any;
  __hmrId?: string;
  __signature?: string;
  _hmrInstances?: Set<any>;
}

type Mock = any;

vi.mock('essor', () => {
  let activeEffect: (() => void) | null = null;
  const signal = (initial: any) => {
    let value = initial;
    const subs = new Set<() => void>();
    return {
      get value() {
        if (activeEffect) subs.add(activeEffect);
        return value;
      },
      set value(newValue: any) {
        value = newValue;
        subs.forEach(fn => fn());
      },
    };
  };

  const effect = (fn: () => void) => {
    const run = () => {
      const prev = activeEffect;
      activeEffect = run;
      try {
        fn();
      } finally {
        activeEffect = prev;
      }
    };
    run();
    return () => {};
  };

  const createComponent = (fn: any) => {
    const instance = { forceUpdate: vi.fn() };
    if (fn._hmrInstances) {
      fn._hmrInstances.add(instance);
    }
    return instance;
  };

  return { signal, effect, createComponent };
});

describe('hMR Runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createHMRComponent', () => {
    it('should return original component if no hmrId', () => {
      const Comp = () => 'test';
      const wrapped = createHMRComponent(Comp, {});
      // Should be instance from mock createComponent
      expect(wrapped.forceUpdate).toBeDefined();
    });

    it('should wrap component with HMR logic and register it', () => {
      const Comp = () => 'test';
      (Comp as HMRComponent).__hmrId = 'test-id';
      (Comp as HMRComponent).__signature = 'sig-1';

      const wrapped = createHMRComponent(Comp as HMRComponent, {});
      expect(wrapped).toBeDefined();
      expect(wrapped.forceUpdate).toBeDefined();
    });
  });

  describe('applyUpdate', () => {
    it('should update component and trigger forceUpdate when signature changes', () => {
      const hmrId = 'update-test-id';
      const Comp1 = () => 'v1';
      (Comp1 as HMRComponent).__hmrId = hmrId;
      (Comp1 as HMRComponent).__signature = 'sig-1';

      // 1. Initial render - this registers the component and sets up effect
      const instance = createHMRComponent(Comp1, {});

      // Clear initial call from creation
      (instance.forceUpdate as Mock).mockClear();

      // 2. Create new component version
      const Comp2 = () => 'v2';
      (Comp2 as HMRComponent).__hmrId = hmrId;
      (Comp2 as HMRComponent).__signature = 'sig-2'; // Changed signature

      // 3. Apply update
      const registry = [Comp2];
      const needsReload = applyUpdate(registry);

      expect(needsReload).toBe(false);

      // Verify forceUpdate was called because signal changed
      expect(instance.forceUpdate).toHaveBeenCalledTimes(1);
    });

    it('should not trigger update if signature matches', () => {
      const hmrId = 'skip-test-id';
      const Comp1 = () => 'v1';
      (Comp1 as HMRComponent).__hmrId = hmrId;
      (Comp1 as HMRComponent).__signature = 'sig-1';

      const instance = createHMRComponent(Comp1, {});
      (instance.forceUpdate as Mock).mockClear();

      const registry = [Comp1];
      const needsReload = applyUpdate(registry);

      expect(needsReload).toBe(false);
      expect(instance.forceUpdate).not.toHaveBeenCalled();
    });

    it('should update if function instance changed (constant update)', () => {
      const hmrId = 'constant-test-id';
      const Comp1 = () => 'v1';
      (Comp1 as HMRComponent).__hmrId = hmrId;
      (Comp1 as HMRComponent).__signature = 'sig-1';

      const instance = createHMRComponent(Comp1, {});
      (instance.forceUpdate as Mock).mockClear();

      const Comp2 = () => 'v1'; // Different function, same code/signature
      (Comp2 as HMRComponent).__hmrId = hmrId;
      (Comp2 as HMRComponent).__signature = 'sig-1';

      const registry = [Comp2];
      const needsReload = applyUpdate(registry);

      expect(needsReload).toBe(false);
      // Even if signature is same, different function reference triggers update
      // This is because we check `oldFn !== newComponentFn` in shouldUpdate
      expect(instance.forceUpdate).toHaveBeenCalledTimes(1);
    });

    it('should ignore updates for unknown components (not rendered yet)', () => {
      const Comp = () => 'new';
      (Comp as HMRComponent).__hmrId = 'unknown-id';
      (Comp as HMRComponent).__signature = 'sig';

      const needsReload = applyUpdate([Comp]);
      expect(needsReload).toBe(false);
    });
  });

  describe('hmrAccept', () => {
    it('should handle vite HMR', () => {
      const hot = {
        accept: vi.fn(),
        invalidate: vi.fn(),
      };

      const registry = [() => {}];
      const res = hmrAccept('vite', hot, registry);

      expect(res).toBe(true);
      expect(hot.accept).toHaveBeenCalled();

      // Test the accept callback
      const callback = (hot.accept as Mock).mock.calls[0][0];

      // Case 1: invalid module (error)
      callback(null);
      expect(hot.invalidate).toHaveBeenCalled();

      // Case 2: valid module with no changes
      (hot.invalidate as Mock).mockClear();
      const mockModule = { __$registry$__: [] };
      callback(mockModule);
      expect(hot.invalidate).not.toHaveBeenCalled();
    });

    it('should handle webpack HMR', () => {
      const hot = {
        accept: vi.fn(),
        dispose: vi.fn(),
        data: {},
      };

      const registry = [() => {}];
      const res = hmrAccept('webpack', hot, registry);

      expect(res).toBe(true);
      expect(hot.accept).toHaveBeenCalled();
      expect(hot.dispose).toHaveBeenCalled();
    });

    it('should return false if hot object missing', () => {
      expect(hmrAccept('vite', undefined as any, [])).toBe(false);
    });
  });

  describe('unregisterAllInstances', () => {
    it('should cleanup instances', () => {
      const hmrId = 'cleanup-id';
      const Comp = () => 'v1';
      (Comp as HMRComponent).__hmrId = hmrId;
      (Comp as HMRComponent).__signature = 'sig-1';

      createHMRComponent(Comp, {});
      // createHMRComponent in our mock calls effect()
      // We can't easily capture the cleanup function returned by effect in this mock structure
      // BUT, `unregisterAllInstances` calls `item.cleanup()` on instances.
      // Wait, `createHMRComponent` attaches cleanup to `info.cleanups`.
      // `unregisterAllInstances` iterates `info.instances` -> checks `item.cleanup`?

      createHMRComponent(Comp, {});

      const count = unregisterAllInstances(hmrId);
      expect(count).toBeGreaterThan(0);
    });
  });
});
