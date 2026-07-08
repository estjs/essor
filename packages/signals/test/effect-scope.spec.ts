import { describe, expect, it, vi } from 'vitest';
import { computed, effect, effectScope, getCurrentScope, onScopeDispose, signal } from '../src';

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

  it('stops nested scopes when the parent scope stops', () => {
    const count = signal(0);
    const parent = effectScope();
    let childRuns = 0;

    parent.run(() => {
      const child = effectScope();

      child.run(() => {
        effect(() => {
          childRuns++;
          count.value;
        });
      });
    });

    expect(childRuns).toBe(1);

    count.value = 1;
    expect(childRuns).toBe(2);

    parent.stop();
    count.value = 2;

    expect(childRuns).toBe(2);
  });

  it('continues disposing sibling scopes when a child cleanup throws', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const parent = effectScope();
    let siblingCleanupRuns = 0;

    try {
      parent.run(() => {
        const throwingChild = effectScope();
        throwingChild.run(() => {
          onScopeDispose(() => {
            throw new Error('cleanup failed');
          });
        });

        const sibling = effectScope();
        sibling.run(() => {
          onScopeDispose(() => {
            siblingCleanupRuns++;
          });
        });
      });

      parent.stop();

      expect(siblingCleanupRuns).toBe(1);
    } finally {
      errorSpy.mockRestore();
    }
  });
});
