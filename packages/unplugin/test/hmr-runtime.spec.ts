import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyUpdate,
  createHMRComponent,
  getRegistryInfo,
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
const runScopeCleanups = (instance: any) => {
  for (const cleanup of [...(instance.scope?.cleanup ?? [])]) cleanup();
  if (instance.scope) instance.scope.cleanup.length = 0;
};

vi.mock('essor', () => {
  const createComponent = (fn: any) => {
    const instance: any = {
      component: fn,
      destroy: vi.fn(),
      lastRender: undefined,
      mount: vi.fn(),
      scope: null,
    };
    instance.mount = vi.fn(() => {
      instance.scope = { cleanup: [] };
      (globalThis as any).__essorMockMountingInstance = instance;
      try {
        instance.lastRender = fn();
      } finally {
        (globalThis as any).__essorMockMountingInstance = undefined;
      }
    });
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

  const onDestroy = (fn: () => void) => {
    const instance = (globalThis as any).__essorMockMountingInstance;
    instance?.scope?.cleanup.push(fn);
  };

  return { createComponent, onDestroy };
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

    it('registers destroy cleanup after mount so root wrappers do not need an active scope', () => {
      const hmrId = 'root-cleanup-after-mount-id';
      const Comp1 = () => 'v1';
      (Comp1 as HMRComponent).__hmrId = hmrId;
      (Comp1 as HMRComponent).__signature = 'sig-1';

      const instance = createHMRComponent(Comp1, {});
      expect(instance.scope).toBeNull();

      instance.mount();
      expect(instance.scope.cleanup).toHaveLength(1);

      (forceUpdateMock(instance) as Mock).mockClear();
      runScopeCleanups(instance);

      const Comp2 = () => 'v2';
      (Comp2 as HMRComponent).__hmrId = hmrId;
      (Comp2 as HMRComponent).__signature = 'sig-2';

      applyUpdate([Comp2]);
      expect(forceUpdateMock(instance)).not.toHaveBeenCalled();
    });

    it('uses the incoming implementation immediately when all old instances were disposed', () => {
      const hmrId = 'disposed-root-test-id';
      const Comp1 = () => 'v1';
      (Comp1 as HMRComponent).__hmrId = hmrId;
      (Comp1 as HMRComponent).__signature = 'sig-1';

      const first = createHMRComponent(Comp1, {});
      first.destroy();

      const Comp2 = () => 'v2';
      (Comp2 as HMRComponent).__hmrId = hmrId;
      (Comp2 as HMRComponent).__signature = 'sig-2';

      const second = createHMRComponent(Comp2, {});

      second.mount();
      expect(second.lastRender).toBe('v2');
      expect(forceUpdateMock(second)).not.toHaveBeenCalled();
    });
  });

  describe('applyUpdate', () => {
    it('should update component and trigger forceUpdate when signature changes', () => {
      const hmrId = 'update-test-id';
      const Comp1 = () => 'v1';
      (Comp1 as HMRComponent).__hmrId = hmrId;
      (Comp1 as HMRComponent).__signature = 'sig-1';

      const instance = createHMRComponent(Comp1, {});

      (forceUpdateMock(instance) as Mock).mockClear();

      const Comp2 = () => 'v2';
      (Comp2 as HMRComponent).__hmrId = hmrId;
      (Comp2 as HMRComponent).__signature = 'sig-2';

      const registry = [Comp2];
      const needsReload = applyUpdate(registry);

      expect(needsReload).toBe(false);
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
      instance.mount();

      expect(instance.lastRender).toBe('v2');
    });

    it('does not downgrade child registry while a parent hot update remounts stale closures', () => {
      const childHmrId = 'stale-child-remount-test-id';
      const Child1 = () => 'child-v1';
      (Child1 as HMRComponent).__hmrId = childHmrId;
      (Child1 as HMRComponent).__signature = 'child-sig';

      const childInstance = createHMRComponent(Child1, {});

      const Child2 = () => 'child-v2';
      (Child2 as HMRComponent).__hmrId = childHmrId;
      (Child2 as HMRComponent).__signature = 'child-sig';
      applyUpdate([Child2]);

      const parentHmrId = 'stale-parent-remount-test-id';
      const Parent1 = () => 'parent-v1';
      (Parent1 as HMRComponent).__hmrId = parentHmrId;
      (Parent1 as HMRComponent).__signature = 'parent-sig-1';

      const parentInstance = createHMRComponent(Parent1, {});
      let remountedChild: any;
      parentInstance.forceUpdate = vi.fn(() => {
        childInstance.destroy();
        remountedChild = createHMRComponent(Child1, {});
      });

      const Parent2 = () => 'parent-v2';
      (Parent2 as HMRComponent).__hmrId = parentHmrId;
      (Parent2 as HMRComponent).__signature = 'parent-sig-2';

      applyUpdate([Parent2]);
      remountedChild.mount();

      expect(remountedChild.lastRender).toBe('child-v2');
    });

    it('keeps the latest implementation for stale closures after a child is toggled off and on', () => {
      const hmrId = 'stale-toggle-remount-test-id';
      const Comp1 = () => 'v1';
      (Comp1 as HMRComponent).__hmrId = hmrId;
      (Comp1 as HMRComponent).__signature = 'sig-1';

      const first = createHMRComponent(Comp1, {});

      const Comp2 = () => 'v2';
      (Comp2 as HMRComponent).__hmrId = hmrId;
      (Comp2 as HMRComponent).__signature = 'sig-2';

      applyUpdate([Comp2]);
      first.destroy();

      const second = createHMRComponent(Comp1, {});
      second.mount();

      expect(second.lastRender).toBe('v2');
    });

    it('keeps module updates for unmounted components so stale closures remount the latest implementation', () => {
      const hmrId = 'unmounted-module-update-test-id';
      const Comp1 = () => 'v1';
      (Comp1 as HMRComponent).__hmrId = hmrId;
      (Comp1 as HMRComponent).__signature = 'sig-1';

      const first = createHMRComponent(Comp1, {});
      first.destroy();

      const Comp2 = () => 'v2';
      (Comp2 as HMRComponent).__hmrId = hmrId;
      (Comp2 as HMRComponent).__signature = 'sig-2';

      expect(applyUpdate([Comp2])).toBe(false);

      const second = createHMRComponent(Comp1, {});
      second.mount();

      expect(second.lastRender).toBe('v2');
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

      const Comp2 = () => 'v1';
      (Comp2 as HMRComponent).__hmrId = hmrId;
      (Comp2 as HMRComponent).__signature = 'sig-1';

      const registry = [Comp2];
      const needsReload = applyUpdate(registry);

      expect(needsReload).toBe(false);
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

    it('requests a reload and unregisters the instance when forceUpdate fails', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const hmrId = 'failed-force-update-test-id';
      const Comp1 = () => 'v1';
      (Comp1 as HMRComponent).__hmrId = hmrId;
      (Comp1 as HMRComponent).__signature = 'sig-1';

      const instance = createHMRComponent(Comp1, {});
      const failingForceUpdate = vi.fn(() => {
        throw new Error('force update failed');
      });
      instance.forceUpdate = failingForceUpdate;

      const Comp2 = () => 'v2';
      (Comp2 as HMRComponent).__hmrId = hmrId;
      (Comp2 as HMRComponent).__signature = 'sig-2';

      expect(applyUpdate([Comp2])).toBe(true);
      expect(failingForceUpdate).toHaveBeenCalledTimes(1);

      const Comp3 = () => 'v3';
      (Comp3 as HMRComponent).__hmrId = hmrId;
      (Comp3 as HMRComponent).__signature = 'sig-3';

      applyUpdate([Comp3]);
      expect(failingForceUpdate).toHaveBeenCalledTimes(1);

      errorSpy.mockRestore();
    });
  });

  describe('hmrAccept', () => {
    it('should handle vite HMR', () => {
      const hot = {
        accept: vi.fn(),
        invalidate: vi.fn(),
        data: {},
      };

      const first = () => 'v1';
      (first as HMRComponent).__hmrId = 'vite:App';
      (first as HMRComponent).__signature = 'sig-1';
      const firstRegistry = [first];
      const instance = createHMRComponent(first, {});
      (forceUpdateMock(instance) as Mock).mockClear();

      const firstResult = hmrAccept('vite', hot, firstRegistry);
      expect(firstResult).toBe(true);
      expect(hot.data['essor-hmr']).toBe(firstRegistry);
      expect(hot.invalidate).not.toHaveBeenCalled();

      const next = () => 'v2';
      (next as HMRComponent).__hmrId = 'vite:App';
      (next as HMRComponent).__signature = 'sig-2';
      const nextRegistry = [next];

      const res = hmrAccept('vite', hot, nextRegistry);
      expect(res).toBe(true);
      expect(hot.invalidate).not.toHaveBeenCalled();
      expect(forceUpdateMock(instance)).toHaveBeenCalledTimes(1);
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

    it('unregisters an instance when it is unmounted', () => {
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

    it('unregisters an instance when its owner scope is disposed', () => {
      const hmrId = 'scope-cleanup-id';
      const Comp1 = () => 'v1';
      (Comp1 as HMRComponent).__hmrId = hmrId;
      (Comp1 as HMRComponent).__signature = 'sig-1';

      const instance = createHMRComponent(Comp1, {});
      instance.mount();
      (forceUpdateMock(instance) as Mock).mockClear();

      runScopeCleanups(instance);

      const Comp2 = () => 'v2';
      (Comp2 as HMRComponent).__hmrId = hmrId;
      (Comp2 as HMRComponent).__signature = 'sig-2';

      applyUpdate([Comp2]);

      expect(forceUpdateMock(instance)).not.toHaveBeenCalled();
    });

    it('releases registry entries after the last live instance is destroyed', async () => {
      const hmrId = 'release-empty-registry-id';
      const Comp = () => 'v1';
      (Comp as HMRComponent).__hmrId = hmrId;
      (Comp as HMRComponent).__signature = 'sig-1';

      const instance = createHMRComponent(Comp, {});
      expect(getRegistryInfo()[hmrId]).toEqual({
        signature: 'sig-1',
        instanceCount: 1,
      });

      instance.destroy();
      await Promise.resolve();

      expect(getRegistryInfo()[hmrId]).toBeUndefined();
    });

    it('does not let a stale cleanup remove a newer registry entry', () => {
      const hmrId = 'stale-cleanup-registry-id';
      const Comp = () => 'v1';
      (Comp as HMRComponent).__hmrId = hmrId;
      (Comp as HMRComponent).__signature = 'sig-1';

      const oldInstance = createHMRComponent(Comp, {});
      unregisterAllInstances(hmrId);

      const newInstance = createHMRComponent(Comp, {});
      oldInstance.destroy();

      expect(getRegistryInfo()[hmrId]).toEqual({
        signature: 'sig-1',
        instanceCount: 1,
      });

      newInstance.destroy();
      expect(getRegistryInfo()[hmrId]).toBeUndefined();
    });
  });
});
