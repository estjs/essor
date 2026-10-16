import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyUpdate, createHMRComponent, hmrAccept } from '../src/hmrRuntime';

interface HMRComponent {
  (): any;
  __hmrId?: string;
  __signature?: string;
  _hmrInstances?: Set<any>;
}

type Mock = any;

/**
 * A component is a function call returning nodes, so this mock models the two
 * things the HMR runtime actually depends on: `createComponent` invokes the
 * function inside a scope, and `insert()` re-invokes a returned thunk when the
 * signal it reads changes. `mountThunk` below stands in for `insert()`.
 */
vi.mock('essor', () => {
  const createComponent = (fn: any, props: any = {}) => {
    const scope = { cleanup: [] as (() => void)[] };
    const previous = (globalThis as any).__essorMockScope;
    (globalThis as any).__essorMockScope = scope;
    try {
      const rendered = fn(props);
      // The scope stays reachable through the render record so a test can
      // dispose it the way the real runtime would.
      (globalThis as any).__essorMockLastScope = scope;
      return rendered;
    } finally {
      (globalThis as any).__essorMockScope = previous;
    }
  };

  const onDestroy = (fn: () => void) => {
    (globalThis as any).__essorMockScope?.cleanup.push(fn);
  };

  const getCurrentScope = () => (globalThis as any).__essorMockScope ?? null;

  const signal = (initial: any) => {
    let value = initial;
    const subscribers = new Set<() => void>();
    return {
      get value() {
        const sub = (globalThis as any).__essorMockSubscriber;
        if (sub) subscribers.add(sub);
        return value;
      },
      set value(next: any) {
        value = next;
        for (const sub of [...subscribers]) sub();
      },
    };
  };

  return { createComponent, onDestroy, getCurrentScope, signal };
});

/**
 * Stand-in for `insert()`: runs the thunk, tracking the signal it reads, and
 * re-runs it on change. Returns a record exposing the render count and the
 * latest rendered value, plus the scope of the most recent render.
 */
function mountThunk(thunk: any) {
  const record: any = { renders: 0, value: undefined, scopes: [] as any[] };
  const run = () => {
    const previous = (globalThis as any).__essorMockSubscriber;
    (globalThis as any).__essorMockSubscriber = run;
    try {
      record.renders++;
      record.value = typeof thunk === 'function' ? thunk() : thunk;
      record.scopes.push((globalThis as any).__essorMockLastScope);
      record.scope = (globalThis as any).__essorMockLastScope;
    } finally {
      (globalThis as any).__essorMockSubscriber = previous;
    }
  };
  run();
  return record;
}

/** Run the cleanups registered in a render's scope (what unmount does). */
const runScopeCleanups = (record: any) => {
  for (const cleanup of [...(record.scope?.cleanup ?? [])]) cleanup();
  if (record.scope) record.scope.cleanup.length = 0;
};

describe('hMR Runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createHMRComponent', () => {
    it('renders directly when there is no hmrId', () => {
      const Comp = () => 'test';
      // Without an hmrId there is nothing to track, so the component is called
      // straight through and the rendered value is returned, not a thunk.
      expect(createHMRComponent(Comp, {})).toBe('test');
    });

    it('should wrap component with HMR logic and register it', () => {
      const Comp = () => 'test';
      (Comp as HMRComponent).__hmrId = 'test-id';
      (Comp as HMRComponent).__signature = 'sig-1';

      const wrapped = createHMRComponent(Comp as HMRComponent, {});
      // A tracked component returns a thunk so insert() can re-run it on update.
      expect(typeof wrapped).toBe('function');
      expect(mountThunk(wrapped).value).toBe('test');
    });

    it('registers destroy cleanup on the render scope, not an ambient one', () => {
      const hmrId = 'root-cleanup-after-mount-id';
      const Comp1 = () => 'v1';
      (Comp1 as HMRComponent).__hmrId = hmrId;
      (Comp1 as HMRComponent).__signature = 'sig-1';

      const mounted = mountThunk(createHMRComponent(Comp1, {}));
      expect(mounted.scope.cleanup).toHaveLength(1);

      // Unmounting runs that cleanup, which unregisters the mount — so a later
      // update must not try to re-render it.
      runScopeCleanups(mounted);

      const Comp2 = () => 'v2';
      (Comp2 as HMRComponent).__hmrId = hmrId;
      (Comp2 as HMRComponent).__signature = 'sig-2';

      const rendersBefore = mounted.renders;
      applyUpdate([Comp2]);
      expect(mounted.renders).toBe(rendersBefore);
    });

    it('uses the incoming implementation immediately when all old mounts were disposed', () => {
      const hmrId = 'disposed-root-test-id';
      const Comp1 = () => 'v1';
      (Comp1 as HMRComponent).__hmrId = hmrId;
      (Comp1 as HMRComponent).__signature = 'sig-1';

      const first = mountThunk(createHMRComponent(Comp1, {}));
      runScopeCleanups(first);

      const Comp2 = () => 'v2';
      (Comp2 as HMRComponent).__hmrId = hmrId;
      (Comp2 as HMRComponent).__signature = 'sig-2';

      const second = mountThunk(createHMRComponent(Comp2, {}));

      // No stale mounts remain, so the new implementation is adopted on sight
      // rather than requiring an applyUpdate to swap it in.
      expect(second.value).toBe('v2');
      expect(second.renders).toBe(1);
    });
  });

  describe('applyUpdate', () => {
    it('should update component and trigger forceUpdate when signature changes', () => {
      const hmrId = 'update-test-id';
      const Comp1 = () => 'v1';
      (Comp1 as HMRComponent).__hmrId = hmrId;
      (Comp1 as HMRComponent).__signature = 'sig-1';

      const mounted = mountThunk(createHMRComponent(Comp1, {}));
      expect(mounted.value).toBe('v1');

      const Comp2 = () => 'v2';
      (Comp2 as HMRComponent).__hmrId = hmrId;
      (Comp2 as HMRComponent).__signature = 'sig-2';

      const registry = [Comp2];
      const needsReload = applyUpdate(registry);

      expect(needsReload).toBe(false);
      // The mount re-rendered in place and now shows the new implementation.
      expect(mounted.renders).toBe(2);
      expect(mounted.value).toBe('v2');
    });

    it('should keep updating across successive hot swaps', () => {
      const hmrId = 'remount-update-test-id';
      const Comp1 = () => 'v1';
      (Comp1 as HMRComponent).__hmrId = hmrId;
      (Comp1 as HMRComponent).__signature = 'sig-1';

      const mounted = mountThunk(createHMRComponent(Comp1, {}));

      const Comp2 = () => 'v2';
      (Comp2 as HMRComponent).__hmrId = hmrId;
      (Comp2 as HMRComponent).__signature = 'sig-2';

      applyUpdate([Comp2]);
      expect(mounted.value).toBe('v2');

      const Comp3 = () => 'v3';
      (Comp3 as HMRComponent).__hmrId = hmrId;
      (Comp3 as HMRComponent).__signature = 'sig-3';

      // A swap must not consume the mount's ability to swap again.
      applyUpdate([Comp3]);
      expect(mounted.value).toBe('v3');
      expect(mounted.renders).toBe(3);
    });

    it('renders new mounts with the latest registered implementation', () => {
      const hmrId = 'latest-instance-test-id';
      const Comp1 = () => 'v1';
      (Comp1 as HMRComponent).__hmrId = hmrId;
      (Comp1 as HMRComponent).__signature = 'sig-1';

      mountThunk(createHMRComponent(Comp1, {}));

      const Comp2 = () => 'v2';
      (Comp2 as HMRComponent).__hmrId = hmrId;
      (Comp2 as HMRComponent).__signature = 'sig-2';
      applyUpdate([Comp2]);

      // A stale closure still referencing Comp1 mounts the LATEST code: the
      // boundary resolves through the registry, not through the captured fn.
      const mounted = mountThunk(createHMRComponent(Comp1, {}));

      expect(mounted.value).toBe('v2');
    });

    it('does not downgrade child registry while a parent hot update remounts stale closures', () => {
      const childHmrId = 'stale-child-remount-test-id';
      const Child1 = () => 'child-v1';
      (Child1 as HMRComponent).__hmrId = childHmrId;
      (Child1 as HMRComponent).__signature = 'child-sig';

      const child = mountThunk(createHMRComponent(Child1, {}));

      const Child2 = () => 'child-v2';
      (Child2 as HMRComponent).__hmrId = childHmrId;
      (Child2 as HMRComponent).__signature = 'child-sig';
      applyUpdate([Child2]);

      // The parent's swap unmounts the old child and mounts a stale closure of
      // it. That remount must not reset the child registry to `child-sig`'s
      // original implementation.
      runScopeCleanups(child);
      const remountedChild = mountThunk(createHMRComponent(Child1, {}));

      expect(remountedChild.value).toBe('child-v2');
    });

    it('keeps the latest implementation for stale closures after a child is toggled off and on', () => {
      const hmrId = 'stale-toggle-remount-test-id';
      const Comp1 = () => 'v1';
      (Comp1 as HMRComponent).__hmrId = hmrId;
      (Comp1 as HMRComponent).__signature = 'sig-1';

      const first = mountThunk(createHMRComponent(Comp1, {}));

      const Comp2 = () => 'v2';
      (Comp2 as HMRComponent).__hmrId = hmrId;
      (Comp2 as HMRComponent).__signature = 'sig-2';

      applyUpdate([Comp2]);
      runScopeCleanups(first);

      const second = mountThunk(createHMRComponent(Comp1, {}));

      expect(second.value).toBe('v2');
    });

    it('keeps module updates for unmounted components so stale closures remount the latest implementation', () => {
      const hmrId = 'unmounted-module-update-test-id';
      const Comp1 = () => 'v1';
      (Comp1 as HMRComponent).__hmrId = hmrId;
      (Comp1 as HMRComponent).__signature = 'sig-1';

      const first = mountThunk(createHMRComponent(Comp1, {}));
      runScopeCleanups(first);

      const Comp2 = () => 'v2';
      (Comp2 as HMRComponent).__hmrId = hmrId;
      (Comp2 as HMRComponent).__signature = 'sig-2';

      // Nothing is mounted, so the update has no mount to swap — but the new
      // implementation must still be REMEMBERED for the next mount.
      expect(applyUpdate([Comp2])).toBe(false);

      const second = mountThunk(createHMRComponent(Comp1, {}));

      expect(second.value).toBe('v2');
    });

    it('should not trigger update if signature matches', () => {
      const hmrId = 'skip-test-id';
      const Comp1 = () => 'v1';
      (Comp1 as HMRComponent).__hmrId = hmrId;
      (Comp1 as HMRComponent).__signature = 'sig-1';

      const mounted = mountThunk(createHMRComponent(Comp1, {}));

      const registry = [Comp1];
      const needsReload = applyUpdate(registry);

      expect(needsReload).toBe(false);
      // Same function AND same signature: nothing changed, so no re-render.
      expect(mounted.renders).toBe(1);
    });

    it('should update if function instance changed (constant update)', () => {
      const hmrId = 'constant-test-id';
      const Comp1 = () => 'v1';
      (Comp1 as HMRComponent).__hmrId = hmrId;
      (Comp1 as HMRComponent).__signature = 'sig-1';

      const mounted = mountThunk(createHMRComponent(Comp1, {}));

      const Comp2 = () => 'v1';
      (Comp2 as HMRComponent).__hmrId = hmrId;
      (Comp2 as HMRComponent).__signature = 'sig-1';

      const registry = [Comp2];
      const needsReload = applyUpdate(registry);

      expect(needsReload).toBe(false);
      // Identical signature but a DIFFERENT function object means the module was
      // re-executed (e.g. a changed constant), so the mount re-renders.
      expect(mounted.renders).toBe(2);
    });

    it('emits a browser event after live component instances update', () => {
      const hmrId = 'event-test-id';
      const Comp1 = () => 'v1';
      (Comp1 as HMRComponent).__hmrId = hmrId;
      (Comp1 as HMRComponent).__signature = 'sig-1';

      mountThunk(createHMRComponent(Comp1, {}));

      const events: unknown[] = [];
      const onUpdate = (event: Event) => {
        events.push((event as CustomEvent).detail);
      };
      addEventListener('essor:hmr-update', onUpdate);

      try {
        const Comp2 = () => 'v2';
        (Comp2 as HMRComponent).__hmrId = hmrId;
        (Comp2 as HMRComponent).__signature = 'sig-2';

        expect(applyUpdate([Comp2])).toBe(false);
      } finally {
        removeEventListener('essor:hmr-update', onUpdate);
      }

      expect(events).toEqual([{ updatedIds: [hmrId] }]);
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

      const mounted = mountThunk(createHMRComponent(Comp1, {}));

      const Comp2 = () => 'v2';
      (Comp2 as HMRComponent).__hmrId = hmrId;
      (Comp2 as HMRComponent).__signature = 'sig-2';

      const needsReload = applyUpdate([undefined, null, {}, Comp2]);

      expect(needsReload).toBe(false);
      expect(mounted.value).toBe('v2');
    });

    it('requests a reload and unregisters the mount when a swap throws', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const hmrId = 'failed-force-update-test-id';
      const Comp1 = () => 'v1';
      (Comp1 as HMRComponent).__hmrId = hmrId;
      (Comp1 as HMRComponent).__signature = 'sig-1';

      let failing = false;
      const thunk = createHMRComponent(Comp1, {});
      const mounted = mountThunk(() => {
        if (failing) throw new Error('force update failed');
        return (thunk as any)();
      });

      const Comp2 = () => 'v2';
      (Comp2 as HMRComponent).__hmrId = hmrId;
      (Comp2 as HMRComponent).__signature = 'sig-2';

      // A re-render that throws must be reported as needing a reload…
      failing = true;
      expect(applyUpdate([Comp2])).toBe(true);
      const rendersAfterFailure = mounted.renders;

      const Comp3 = () => 'v3';
      (Comp3 as HMRComponent).__hmrId = hmrId;
      (Comp3 as HMRComponent).__signature = 'sig-3';

      // …and the broken mount must be dropped, so a later update ignores it.
      applyUpdate([Comp3]);
      expect(mounted.renders).toBe(rendersAfterFailure);

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
      const mounted = mountThunk(createHMRComponent(first, {}));

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
      expect(mounted.value).toBe('v2');
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

    it('should setup standard HMR and handle accept callbacks', () => {
      let acceptCallback: ((mod: any) => void) | undefined;
      const hot = {
        accept: vi.fn((cb) => {
          acceptCallback = cb;
        }),
        dispose: vi.fn((cb) => {
          cb({});
        }),
        invalidate: vi.fn(),
        data: { 'essor-hmr': [] },
      };

      const Comp = () => 'hi';
      (Comp as any).__hmrId = 'std-1';
      (Comp as any).__signature = 'sig-std';

      expect(hmrAccept('other', hot, [Comp])).toBe(true);
      expect(hot.accept).toHaveBeenCalled();
      expect(hot.dispose).toHaveBeenCalled();

      // Test accept callback with new module having __$registry$__
      const newComp = () => 'hi2';
      (newComp as any).__hmrId = 'std-1';
      (newComp as any).__signature = 'sig-std-2';
      acceptCallback?.({ __$registry$__: [newComp] });

      // Test accept callback with exported components
      acceptCallback?.({ MyComponent: newComp });

      // Test accept callback with null module (triggers invalidate)
      acceptCallback?.(null);
      expect(hot.invalidate).toHaveBeenCalled();
    });
  });

  describe('instance lifecycle', () => {
    it('unregisters a mount when it is unmounted', () => {
      const hmrId = 'unmounted-cleanup-id';
      const Comp1 = () => 'v1';
      (Comp1 as HMRComponent).__hmrId = hmrId;
      (Comp1 as HMRComponent).__signature = 'sig-1';

      const mounted = mountThunk(createHMRComponent(Comp1, {}));
      runScopeCleanups(mounted);

      const Comp2 = () => 'v2';
      (Comp2 as HMRComponent).__hmrId = hmrId;
      (Comp2 as HMRComponent).__signature = 'sig-2';

      applyUpdate([Comp2]);

      expect(mounted.renders).toBe(1);
    });

    it('unregisters a mount when its owner scope is disposed', () => {
      const hmrId = 'scope-cleanup-id';
      const Comp1 = () => 'v1';
      (Comp1 as HMRComponent).__hmrId = hmrId;
      (Comp1 as HMRComponent).__signature = 'sig-1';

      const mounted = mountThunk(createHMRComponent(Comp1, {}));

      runScopeCleanups(mounted);

      const Comp2 = () => 'v2';
      (Comp2 as HMRComponent).__hmrId = hmrId;
      (Comp2 as HMRComponent).__signature = 'sig-2';

      applyUpdate([Comp2]);

      expect(mounted.renders).toBe(1);
    });
  });
});
