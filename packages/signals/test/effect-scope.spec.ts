import { describe, expect, it, vi } from 'vitest';
import {
  EffectScope,
  computed,
  effect,
  effectScope,
  nextTick,
  onScopeDispose,
  reactive,
  signal,
  watch,
} from '../src';
import { ReactiveEffect } from '../src/effect';
import { getCurrentScope, setCurrentScope } from '../src/effectScope';

describe('effectScope', () => {
  it('captures effects, computed values, and cleanups created inside the scope', () => {
    const count = signal(0);
    const scope = effectScope();
    let effectRuns = 0;
    let computedRuns = 0;
    let cleanupRuns = 0;

    expect(getCurrentScope()).toBeUndefined();

    scope.run(() => {
      expect(getCurrentScope()).toBe(scope);

      const doubled = computed(() => {
        computedRuns++;
        return count.value * 2;
      });

      effect(() => {
        effectRuns++;
        doubled.value;
      });

      onScopeDispose(() => {
        cleanupRuns++;
      });
    });

    expect(getCurrentScope()).toBeUndefined();
    expect(effectRuns).toBe(1);
    expect(computedRuns).toBe(1);
    expect(cleanupRuns).toBe(0);

    count.value = 1;
    expect(effectRuns).toBe(2);
    expect(computedRuns).toBe(2);

    scope.stop();
    count.value = 2;

    expect(effectRuns).toBe(2);
    expect(computedRuns).toBe(2);
    expect(cleanupRuns).toBe(1);
  });

  it('returns the value of run()', () => {
    const scope = effectScope();
    expect(scope.run(() => 'ok')).toBe('ok');
    scope.stop();
  });

  it('restores the previous scope when run() throws', () => {
    const scope = effectScope();
    expect(() =>
      scope.run(() => {
        throw new Error('run failed');
      }),
    ).toThrow('run failed');
    expect(getCurrentScope()).toBeUndefined();
    scope.stop();
  });

  it('stops nested scopes when the parent scope stops', () => {
    const count = signal(0);
    const parent = effectScope();
    let child!: ReturnType<typeof effectScope>;
    let childRuns = 0;

    parent.run(() => {
      child = effectScope();
      child.run(() => {
        effect(() => {
          count.value;
          childRuns++;
        });
      });
    });

    parent.stop();
    count.value = 1;

    expect(child.active).toBe(false);
    expect(childRuns).toBe(1);
  });

  it('keeps detached scopes alive when the parent stops', () => {
    const count = signal(0);
    const parent = effectScope();
    let detached!: ReturnType<typeof effectScope>;
    let runs = 0;

    parent.run(() => {
      detached = effectScope(true);
      detached.run(() => {
        effect(() => {
          count.value;
          runs++;
        });
      });
    });

    parent.stop();
    count.value = 1;

    expect(detached.active).toBe(true);
    expect(runs).toBe(2);
    detached.stop();
  });

  it('stops child effects before running its own cleanups', () => {
    const order: string[] = [];
    const scope = effectScope();

    scope.run(() => {
      onScopeDispose(() => order.push('first cleanup'));
      effectScope().run(() => {
        onScopeDispose(() => order.push('child scope cleanup'));
      });
      onScopeDispose(() => order.push('second cleanup'));
    });

    scope.stop();
    expect(order).toEqual(['child scope cleanup', 'first cleanup', 'second cleanup']);
  });

  it('stops idempotently', () => {
    const cleanup = vi.fn();
    const scope = effectScope();
    scope.run(() => onScopeDispose(cleanup));

    scope.stop();
    scope.stop();

    expect(scope.active).toBe(false);
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('stops watchers created inside the scope', () => {
    const source = signal(0);
    const callback = vi.fn();
    const scope = effectScope();

    scope.run(() => {
      watch(source, callback);
    });

    source.value = 1;
    expect(callback).toHaveBeenCalledOnce();

    scope.stop();
    source.value = 2;
    expect(callback).toHaveBeenCalledOnce();
  });
});

describe('effectScope pause and resume', () => {
  it('pauses descendant effects and replays pending work on resume', () => {
    const count = signal(0);
    const seen: number[] = [];
    const scope = effectScope();

    scope.run(() => {
      effect(() => {
        seen.push(count.value);
      });
      effectScope().run(() => {
        effect(() => {
          seen.push(count.value * 10);
        });
      });
    });

    scope.pause();
    count.value = 1;
    expect(seen).toEqual([0, 0]);

    scope.resume();
    expect(seen).toEqual([0, 0, 1, 10]);
    scope.stop();
  });

  it('does not rerun effects on resume when nothing changed', () => {
    const run = vi.fn();
    const scope = effectScope();
    scope.run(() => effect(run));

    scope.pause();
    scope.resume();

    expect(run).toHaveBeenCalledOnce();
    scope.stop();
  });

  it('can still run work while paused', () => {
    const scope = effectScope();
    scope.pause();
    const run = vi.fn(() => 'ok');

    expect(scope.run(run)).toBe('ok');
    expect(run).toHaveBeenCalledOnce();
    expect(scope.active).toBe(true);
    scope.stop();
  });
});

describe('effectScope current scope helpers', () => {
  it('setCurrentScope installs a scope and returns the previous one', () => {
    const scope = effectScope();

    const prev = setCurrentScope(scope);
    expect(prev).toBeUndefined();
    expect(getCurrentScope()).toBe(scope);

    expect(setCurrentScope(prev)).toBe(scope);
    expect(getCurrentScope()).toBeUndefined();
    scope.stop();
  });

  it('warns when onScopeDispose has no active scope', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});

    onScopeDispose(() => {});
    expect(warning).toHaveBeenCalled();
    expect(String(warning.mock.calls[0].join(' '))).toContain('onScopeDispose()');

    warning.mockClear();
    onScopeDispose(() => {}, true);
    expect(warning).not.toHaveBeenCalled();
    warning.mockRestore();
  });
});

describe('reactivity/effect/scope', () => {
  it('should run', () => {
    const fnSpy = vi.fn(() => {});
    effectScope().run(fnSpy);
    expect(fnSpy).toHaveBeenCalledTimes(1);
  });

  it('should accept zero argument', () => {
    const scope = effectScope();
    expect(getEffectsCount(scope)).toBe(0);
  });

  it('should return run value', () => {
    expect(effectScope().run(() => 1)).toBe(1);
  });

  it('should work w/ active property', () => {
    const scope = effectScope();
    const src = computed(() => 1);
    scope.run(() => src.value);
    expect(scope.active).toBe(true);
    scope.stop();
    expect(scope.active).toBe(false);
  });

  it('should collect the effects', () => {
    const scope = effectScope();
    scope.run(() => {
      let dummy;
      const counter = reactive({ num: 0 });
      effect(() => (dummy = counter.num));

      expect(dummy).toBe(0);
      counter.num = 7;
      expect(dummy).toBe(7);
    });

    expect(getEffectsCount(scope)).toBe(1);
  });

  it('stop', () => {
    let dummy, doubled;
    const counter = reactive({ num: 0 });

    const scope = effectScope();
    scope.run(() => {
      effect(() => (dummy = counter.num));
      effect(() => (doubled = counter.num * 2));
    });

    expect(getEffectsCount(scope)).toBe(2);

    expect(dummy).toBe(0);
    counter.num = 7;
    expect(dummy).toBe(7);
    expect(doubled).toBe(14);

    scope.stop();

    counter.num = 6;
    expect(dummy).toBe(7);
    expect(doubled).toBe(14);
  });

  it('should collect nested scope', () => {
    let dummy, doubled;
    const counter = reactive({ num: 0 });

    const scope = effectScope();
    scope.run(() => {
      effect(() => (dummy = counter.num));
      // nested scope
      effectScope().run(() => {
        effect(() => (doubled = counter.num * 2));
      });
    });

    expect(getEffectsCount(scope)).toBe(1);
    expect(scope.deps?.nextDep?.dep).toBeInstanceOf(EffectScope);

    expect(dummy).toBe(0);
    counter.num = 7;
    expect(dummy).toBe(7);
    expect(doubled).toBe(14);

    // stop the nested scope as well
    scope.stop();

    counter.num = 6;
    expect(dummy).toBe(7);
    expect(doubled).toBe(14);
  });

  it('nested scope can be escaped', () => {
    let dummy, doubled;
    const counter = reactive({ num: 0 });

    const scope = effectScope();
    scope.run(() => {
      effect(() => (dummy = counter.num));
      // nested scope
      effectScope(true).run(() => {
        effect(() => (doubled = counter.num * 2));
      });
    });

    expect(getEffectsCount(scope)).toBe(1);

    expect(dummy).toBe(0);
    counter.num = 7;
    expect(dummy).toBe(7);
    expect(doubled).toBe(14);

    scope.stop();

    counter.num = 6;
    expect(dummy).toBe(7);

    // nested scope should not be stopped
    expect(doubled).toBe(12);
  });

  it('able to run the scope', () => {
    let dummy, doubled;
    const counter = reactive({ num: 0 });

    const scope = effectScope();
    scope.run(() => {
      effect(() => (dummy = counter.num));
    });

    expect(getEffectsCount(scope)).toBe(1);

    scope.run(() => {
      effect(() => (doubled = counter.num * 2));
    });

    expect(getEffectsCount(scope)).toBe(2);

    counter.num = 7;
    expect(dummy).toBe(7);
    expect(doubled).toBe(14);

    scope.stop();
  });

  it('can not run an inactive scope', () => {
    let dummy, doubled;
    const counter = reactive({ num: 0 });

    const scope = effectScope();
    scope.run(() => {
      effect(() => (dummy = counter.num));
    });

    expect(getEffectsCount(scope)).toBe(1);

    scope.stop();

    expect(getEffectsCount(scope)).toBe(0);

    scope.run(() => {
      effect(() => (doubled = counter.num * 2));
    });

    expect(getEffectsCount(scope)).toBe(1);

    counter.num = 7;
    expect(dummy).toBe(0);
    expect(doubled).toBe(14);
  });

  it('should fire onScopeDispose hook', () => {
    let dummy = 0;

    const scope = effectScope();
    scope.run(() => {
      onScopeDispose(() => (dummy += 1));
      onScopeDispose(() => (dummy += 2));
    });

    scope.run(() => {
      onScopeDispose(() => (dummy += 4));
    });

    expect(dummy).toBe(0);

    scope.stop();
    expect(dummy).toBe(7);
  });

  it('should warn onScopeDispose() is called when there is no active effect scope', () => {
    const spy = vi.fn();
    const scope = effectScope();
    scope.run(() => {
      onScopeDispose(spy);
    });

    expect(spy).toHaveBeenCalledTimes(0);

    onScopeDispose(spy);

    expect(
      'onScopeDispose() is called when there is no active effect scope to be associated with.',
    ).toHaveBeenWarned();

    scope.stop();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('should dereference child scope from parent scope after stopping child scope (no memleaks)', () => {
    const parent = effectScope();
    const child = parent.run(() => effectScope())!;
    expect(parent.deps?.dep).toBe(child);
    child.stop();
    expect(parent.deps).toBeUndefined();
  });

  it('getCurrentScope() stays valid when running a detached nested EffectScope', () => {
    const parentScope = effectScope();

    parentScope.run(() => {
      const currentScope = getCurrentScope();
      expect(currentScope).toBeDefined();
      const detachedScope = effectScope(true);
      detachedScope.run(() => {});

      expect(getCurrentScope()).toBe(currentScope);
    });
  });

  it('calling .off() of a detached scope inside an active scope should not break currentScope', () => {
    const parentScope = effectScope();

    parentScope.run(() => {
      const childScope = effectScope(true);
      setCurrentScope(setCurrentScope(childScope));
      expect(getCurrentScope()).toBe(parentScope);
    });
  });

  it('should pause/resume EffectScope', async () => {
    const counter = reactive({ num: 0 });
    const fnSpy = vi.fn(() => counter.num);
    const scope = new EffectScope();
    scope.run(() => {
      effect(fnSpy);
    });

    expect(fnSpy).toHaveBeenCalledTimes(1);

    counter.num++;
    await nextTick();
    expect(fnSpy).toHaveBeenCalledTimes(2);

    scope.pause();
    counter.num++;
    await nextTick();
    expect(fnSpy).toHaveBeenCalledTimes(2);

    counter.num++;
    await nextTick();
    expect(fnSpy).toHaveBeenCalledTimes(2);

    scope.resume();
    expect(fnSpy).toHaveBeenCalledTimes(3);
  });

  it('removing a watcher while stopping its effectScope', async () => {
    const count = signal(0);
    const scope = effectScope();
    let watcherCalls = 0;
    let cleanupCalls = 0;

    scope.run(() => {
      const stop1 = watch(count, () => {
        watcherCalls++;
      });
      watch(count, (val, old, onCleanup) => {
        watcherCalls++;
        onCleanup(() => {
          cleanupCalls++;
          stop1();
        });
      });
      watch(count, () => {
        watcherCalls++;
      });
    });

    expect(watcherCalls).toBe(0);
    expect(cleanupCalls).toBe(0);

    count.value++;
    await nextTick();
    expect(watcherCalls).toBe(3);
    expect(cleanupCalls).toBe(0);

    scope.stop();
    count.value++;
    await nextTick();
    expect(watcherCalls).toBe(3);
    expect(cleanupCalls).toBe(1);

    expect(getEffectsCount(scope)).toBe(0);
    expect(scope.cleanupsLength).toBe(0);
  });

  it('should still trigger updates after stopping scope stored in reactive object', () => {
    const rs = signal({
      stage: 0,
      scope: null,
    });

    let renderCount = 0;
    effect(() => {
      renderCount++;
      return rs.value.stage;
    });

    const handleBegin = () => {
      const status = rs.value;
      status.stage = 1;
      status.scope = effectScope();
      status.scope.run(() => {
        watch([() => status.stage], () => {});
      });
    };

    const handleExit = () => {
      const status = rs.value;
      status.stage = 0;
      const watchScope = status.scope;
      status.scope = null;
      if (watchScope) {
        watchScope.stop();
      }
    };

    expect(rs.value.stage).toBe(0);
    expect(renderCount).toBe(1);

    // 1. Click begin
    handleBegin();
    expect(rs.value.stage).toBe(1);
    expect(renderCount).toBe(2);

    // 2. Click add
    rs.value.stage++;
    expect(rs.value.stage).toBe(2);
    expect(renderCount).toBe(3);

    // 3. Click end
    handleExit();
    expect(rs.value.stage).toBe(0);
    expect(renderCount).toBe(4);

    handleBegin();
    expect(rs.value.stage).toBe(1);
    expect(renderCount).toBe(5);
  });

  it('should stop child scopes when cleanup stops a sibling scope', () => {
    const parent = effectScope();
    let sibling!: EffectScope;

    parent.run(() => {
      effectScope().run(() => {
        onScopeDispose(() => sibling.stop());
      });
      sibling = effectScope();
    });

    expect(() => parent.stop()).not.toThrow();
    expect(sibling.active).toBe(false);
  });

  it('should resume effects when a watcher stops a sibling watcher', () => {
    const count = signal(0);
    const scope = effectScope();
    let stopSecond = () => {};
    const firstSpy = vi.fn(() => stopSecond());
    const secondSpy = vi.fn();

    scope.run(() => {
      watch(count, firstSpy, { flush: 'sync' });
      stopSecond = watch(count, secondSpy, { flush: 'sync' });
    });

    scope.pause();
    count.value++;

    expect(() => scope.resume()).not.toThrow();
    expect(firstSpy).toHaveBeenCalledTimes(1);
    expect(secondSpy).not.toHaveBeenCalled();
    expect(getEffectsCount(scope)).toBe(1);
  });
});

function getEffectsCount(scope: EffectScope): number {
  let n = 0;
  for (let dep = scope.deps; dep !== undefined; dep = dep.nextDep) {
    if (dep.dep instanceof ReactiveEffect) {
      n++;
    }
  }
  return n;
}

describe('edge cases', () => {
  it('pause/resume are idempotent', () => {
    const scope = effectScope();
    const n = signal(0);
    const fn = vi.fn();
    scope.run(() => effect(() => fn(n.value)));
    scope.resume();
    scope.pause();
    scope.pause();
    n.value++;
    expect(fn).toHaveBeenCalledTimes(1);
    scope.resume();
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
