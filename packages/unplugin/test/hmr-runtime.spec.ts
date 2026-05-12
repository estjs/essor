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

const forceUpdateMock = (instance: any) => instance.__forceUpdateMock ?? instance.forceUpdate;

vi.mock('essor', () => {
  let activeEffect: any = null;
  const signal = (initial: any) => {
    let value = initial;
    const subs = new Set<any>();
    return {
      get value() {
        if (activeEffect) {
          subs.add(activeEffect);
          activeEffect.deps.add(subs);
        }
        return value;
      },
      set value(newValue: any) {
        value = newValue;
        [...subs].forEach((fn) => fn());
      },
    };
  };

  const effect = (fn: () => void) => {
    const run: any = () => {
      const prev = activeEffect;
      activeEffect = run;
      try {
        fn();
      } finally {
        activeEffect = prev;
      }
    };
    run.deps = new Set<Set<any>>();
    run.stop = vi.fn(() => {
      for (const dep of run.deps) {
        dep.delete(run);
      }
      run.deps.clear();
    });
    run();
    return run;
  };

  const createComponent = (fn: any) => {
    const instance: any = {
      component: fn,
      destroy: vi.fn(),
      mount: vi.fn(),
    };
    const forceUpdate = vi.fn(() => {
      instance.destroy();
      instance.mount();
    });
    instance.forceUpdate = forceUpdate;
    instance.__forceUpdateMock = forceUpdate;
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
      (forceUpdateMock(instance) as Mock).mockClear();

      // 2. Create new component version
      const Comp2 = () => 'v2';
      (Comp2 as HMRComponent).__hmrId = hmrId;
      (Comp2 as HMRComponent).__signature = 'sig-2'; // Changed signature

      // 3. Apply update
      const registry = [Comp2];
      const needsReload = applyUpdate(registry);

      expect(needsReload).toBe(false);

      // Verify forceUpdate was called because signal changed
      expect(forceUpdateMock(instance)).toHaveBeenCalledTimes(1);
    });

    it('should keep updating after forceUpdate remounts the component', () => {
      const hmrId = 'remount-update-test-id';
      const Comp1 = () => 'v1';
      (Comp1 as HMRComponent).__hmrId = hmrId;
      (Comp1 as HMRComponent).__signature = 'sig-1';

      const instance = createHMRComponent(Comp1, {});
      (forceUpdateMock(instance) as Mock).mockClear();

      const Comp2 = () => 'v2';
      (Comp2 as HMRComponent).__hmrId = hmrId;
      (Comp2 as HMRComponent).__signature = 'sig-2';

      applyUpdate([Comp2]);
      expect(forceUpdateMock(instance)).toHaveBeenCalledTimes(1);

      (forceUpdateMock(instance) as Mock).mockClear();

      const Comp3 = () => 'v3';
      (Comp3 as HMRComponent).__hmrId = hmrId;
      (Comp3 as HMRComponent).__signature = 'sig-3';

      applyUpdate([Comp3]);
      expect(forceUpdateMock(instance)).toHaveBeenCalledTimes(1);
    });

    it('should create new instances with the latest registered component after an update', () => {
      const hmrId = 'latest-instance-test-id';
      const Comp1 = () => 'v1';
      (Comp1 as HMRComponent).__hmrId = hmrId;
      (Comp1 as HMRComponent).__signature = 'sig-1';

      createHMRComponent(Comp1, {});

      const Comp2 = () => 'v2';
      (Comp2 as HMRComponent).__hmrId = hmrId;
      (Comp2 as HMRComponent).__signature = 'sig-2';
      applyUpdate([Comp2]);

      const instance = createHMRComponent(Comp1, {});

      expect(instance.component).toBe(Comp2);
    });

    it('should not trigger update if signature matches', () => {
      const hmrId = 'skip-test-id';
      const Comp1 = () => 'v1';
      (Comp1 as HMRComponent).__hmrId = hmrId;
      (Comp1 as HMRComponent).__signature = 'sig-1';

      const instance = createHMRComponent(Comp1, {});
      (forceUpdateMock(instance) as Mock).mockClear();

      const registry = [Comp1];
      const needsReload = applyUpdate(registry);

      expect(needsReload).toBe(false);
      expect(forceUpdateMock(instance)).not.toHaveBeenCalled();
    });

    it('should update if function instance changed (constant update)', () => {
      const hmrId = 'constant-test-id';
      const Comp1 = () => 'v1';
      (Comp1 as HMRComponent).__hmrId = hmrId;
      (Comp1 as HMRComponent).__signature = 'sig-1';

      const instance = createHMRComponent(Comp1, {});
      (forceUpdateMock(instance) as Mock).mockClear();

      const Comp2 = () => 'v1'; // Different function, same code/signature
      (Comp2 as HMRComponent).__hmrId = hmrId;
      (Comp2 as HMRComponent).__signature = 'sig-1';

      const registry = [Comp2];
      const needsReload = applyUpdate(registry);

      expect(needsReload).toBe(false);
      // Even if signature is same, different function reference triggers update
      // This is because we check `oldFn !== newComponentFn` in shouldUpdate
      expect(forceUpdateMock(instance)).toHaveBeenCalledTimes(1);
    });

    it('should ignore updates for unknown components (not rendered yet)', () => {
      const Comp = () => 'new';
      (Comp as HMRComponent).__hmrId = 'unknown-id';
      (Comp as HMRComponent).__signature = 'sig';

      const needsReload = applyUpdate([Comp]);
      expect(needsReload).toBe(false);
    });

    it('should ignore invalid registry entries and keep applying valid updates', () => {
      const hmrId = 'invalid-entry-test-id';
      const Comp1 = () => 'v1';
      (Comp1 as HMRComponent).__hmrId = hmrId;
      (Comp1 as HMRComponent).__signature = 'sig-1';

      const instance = createHMRComponent(Comp1, {});
      (forceUpdateMock(instance) as Mock).mockClear();

      const Comp2 = () => 'v2';
      (Comp2 as HMRComponent).__hmrId = hmrId;
      (Comp2 as HMRComponent).__signature = 'sig-2';

      const needsReload = applyUpdate([undefined, null, {}, Comp2]);

      expect(needsReload).toBe(false);
      expect(forceUpdateMock(instance)).toHaveBeenCalledTimes(1);
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
      expect(hmrAccept('vite', undefined, [])).toBe(false);
    });
  });

  describe('unregisterAllInstances', () => {
    it('should cleanup instances', () => {
      const hmrId = 'cleanup-id';
      const Comp = () => 'v1';
      (Comp as HMRComponent).__hmrId = hmrId;
      (Comp as HMRComponent).__signature = 'sig-1';

      const first = createHMRComponent(Comp, {});
      const second = createHMRComponent(Comp, {});
      (forceUpdateMock(first) as Mock).mockClear();
      (forceUpdateMock(second) as Mock).mockClear();

      const count = unregisterAllInstances(hmrId);
      expect(count).toBe(2);

      const NextComp = () => 'v2';
      (NextComp as HMRComponent).__hmrId = hmrId;
      (NextComp as HMRComponent).__signature = 'sig-2';
      applyUpdate([NextComp]);

      expect(forceUpdateMock(first)).not.toHaveBeenCalled();
      expect(forceUpdateMock(second)).not.toHaveBeenCalled();
    });

    it('stops the HMR effect when a component instance is unmounted', () => {
      const hmrId = 'unmounted-cleanup-id';
      const Comp1 = () => 'v1';
      (Comp1 as HMRComponent).__hmrId = hmrId;
      (Comp1 as HMRComponent).__signature = 'sig-1';

      const instance = createHMRComponent(Comp1, {});
      (forceUpdateMock(instance) as Mock).mockClear();

      instance.destroy();

      const Comp2 = () => 'v2';
      (Comp2 as HMRComponent).__hmrId = hmrId;
      (Comp2 as HMRComponent).__signature = 'sig-2';

      applyUpdate([Comp2]);

      expect(forceUpdateMock(instance)).not.toHaveBeenCalled();
    });
  });
});
