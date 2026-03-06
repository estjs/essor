import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LIFECYCLE,
  onDestroy,
  onMount,
  onUpdate,
  triggerDestroyHooks,
  triggerMountHooks,
  triggerUpdateHooks,
} from '../src/lifecycle';
import { createScope, disposeScope, onCleanup, setActiveScope } from '../src/scope';
import { resetEnvironment } from './test-utils';

describe('lifecycle Management', () => {
  beforeEach(() => {
    resetEnvironment();
  });

  describe('onMount', () => {
    it('registers a mount hook in the active scope', () => {
      const scope = createScope();
      setActiveScope(scope);

      const hook = vi.fn();
      onMount(hook);

      expect(scope.onMount).toBeDefined();
      expect(scope.onMount?.[0]).toBe(hook);

      setActiveScope(null);
    });

    it('executes mount hook immediately if scope is already mounted', () => {
      const scope = createScope();
      scope.isMounted = true;
      setActiveScope(scope);

      const hook = vi.fn();
      onMount(hook);

      expect(hook).toHaveBeenCalledTimes(1);

      setActiveScope(null);
    });

    it('handles async mount hooks correctly', () => {
      const scope = createScope();
      scope.isMounted = true;
      setActiveScope(scope);

      const hook = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });
      onMount(hook);

      expect(hook).toHaveBeenCalledTimes(1);

      setActiveScope(null);
    });

    it('logs error when called outside a scope in dev mode', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const hook = vi.fn();
      onMount(hook);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('onMount() must be called within a scope'),
      );

      consoleSpy.mockRestore();
    });

    it('handles errors in mount hooks gracefully', () => {
      const scope = createScope();
      scope.isMounted = true;
      setActiveScope(scope);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const hook = vi.fn(() => {
        throw new Error('Mount hook error');
      });
      onMount(hook);

      expect(hook).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
      setActiveScope(null);
    });
  });

  describe('onUpdate', () => {
    it('registers an update hook in the active scope', () => {
      const scope = createScope();
      setActiveScope(scope);

      const hook = vi.fn();
      onUpdate(hook);

      expect(scope.onUpdate).toBeDefined();
      expect(scope.onUpdate?.[0]).toBe(hook);

      setActiveScope(null);
    });

    it('does not execute update hook immediately', () => {
      const scope = createScope();
      scope.isMounted = true;
      setActiveScope(scope);

      const hook = vi.fn();
      onUpdate(hook);

      expect(hook).not.toHaveBeenCalled();

      setActiveScope(null);
    });

    it('logs error when called outside a scope in dev mode', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const hook = vi.fn();
      onUpdate(hook);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('onUpdate() must be called within a scope'),
      );

      consoleSpy.mockRestore();
    });
  });

  describe('onDestroy', () => {
    it('registers a destroy hook in the active scope', () => {
      const scope = createScope();
      setActiveScope(scope);

      const hook = vi.fn();
      onDestroy(hook);

      expect(scope.onDestroy).toBeDefined();
      expect(scope.onDestroy?.[0]).toBe(hook);

      setActiveScope(null);
    });

    it('does not execute destroy hook immediately', () => {
      const scope = createScope();
      setActiveScope(scope);

      const hook = vi.fn();
      onDestroy(hook);

      expect(hook).not.toHaveBeenCalled();

      setActiveScope(null);
    });

    it('logs error when called outside a scope in dev mode', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const hook = vi.fn();
      onDestroy(hook);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('onDestroy() must be called within a scope'),
      );

      consoleSpy.mockRestore();
    });
  });

  describe('triggerMountHooks', () => {
    it('executes all registered mount hooks', () => {
      const scope = createScope();
      setActiveScope(scope);

      const hook1 = vi.fn();
      const hook2 = vi.fn();
      onMount(hook1);
      onMount(hook2);

      setActiveScope(null);

      triggerMountHooks(scope);

      expect(hook1).toHaveBeenCalledTimes(1);
      expect(hook2).toHaveBeenCalledTimes(1);
    });

    it('clears hooks after execution', () => {
      const scope = createScope();
      setActiveScope(scope);

      const hook = vi.fn();
      onMount(hook);

      setActiveScope(null);

      triggerMountHooks(scope);

      expect(scope.onMount?.length).toBe(0);
    });

    it('marks scope as mounted after execution', () => {
      const scope = createScope();
      setActiveScope(scope);

      const hook = vi.fn();
      onMount(hook);

      setActiveScope(null);

      triggerMountHooks(scope);

      expect(scope.isMounted).toBe(true);
    });

    it('marks scope as mounted even without hooks', () => {
      const scope = createScope();

      triggerMountHooks(scope);

      expect(scope.isMounted).toBe(true);
    });

    it('does nothing if scope is already destroyed', () => {
      const scope = createScope();
      scope.isDestroyed = true;
      setActiveScope(scope);

      const hook = vi.fn();
      onMount(hook);

      setActiveScope(null);

      triggerMountHooks(scope);

      expect(hook).not.toHaveBeenCalled();
    });

    it('handles errors in hooks gracefully', () => {
      const scope = createScope();
      setActiveScope(scope);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const errorHook = vi.fn(() => {
        throw new Error('Mount hook error');
      });
      const successHook = vi.fn();

      onMount(errorHook);
      onMount(successHook);

      setActiveScope(null);

      triggerMountHooks(scope);

      expect(errorHook).toHaveBeenCalledTimes(1);
      expect(successHook).toHaveBeenCalledTimes(1);

      consoleSpy.mockRestore();
    });

    it('handles async mount hooks', async () => {
      const scope = createScope();
      setActiveScope(scope);

      const hook = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });
      onMount(hook);

      setActiveScope(null);

      const result = triggerMountHooks(scope);

      if (result instanceof Promise) {
        await result;
      }

      expect(hook).toHaveBeenCalledTimes(1);
    });
  });

  describe('triggerUpdateHooks', () => {
    it('executes all registered update hooks', () => {
      const scope = createScope();
      setActiveScope(scope);

      const hook1 = vi.fn();
      const hook2 = vi.fn();
      onUpdate(hook1);
      onUpdate(hook2);

      setActiveScope(null);

      triggerUpdateHooks(scope);

      expect(hook1).toHaveBeenCalledTimes(1);
      expect(hook2).toHaveBeenCalledTimes(1);
    });

    it('does nothing if scope has no update hooks', () => {
      const scope = createScope();

      expect(triggerUpdateHooks(scope)).toBeUndefined();
    });

    it('does nothing if scope is destroyed', () => {
      const scope = createScope();
      scope.isDestroyed = true;
      setActiveScope(scope);

      const hook = vi.fn();
      onUpdate(hook);

      setActiveScope(null);

      triggerUpdateHooks(scope);

      expect(hook).not.toHaveBeenCalled();
    });

    it('handles errors in update hooks', () => {
      const scope = createScope();
      setActiveScope(scope);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const errorHook = vi.fn(() => {
        throw new Error('Update hook error');
      });
      const successHook = vi.fn();

      onUpdate(errorHook);
      onUpdate(successHook);

      setActiveScope(null);

      triggerUpdateHooks(scope);

      expect(errorHook).toHaveBeenCalledTimes(1);
      expect(successHook).toHaveBeenCalledTimes(1);

      consoleSpy.mockRestore();
    });
  });

  describe('triggerDestroyHooks', () => {
    it('executes all registered destroy hooks', () => {
      const scope = createScope();
      setActiveScope(scope);

      const hook1 = vi.fn();
      const hook2 = vi.fn();
      onDestroy(hook1);
      onDestroy(hook2);

      setActiveScope(null);

      triggerDestroyHooks(scope);

      expect(hook1).toHaveBeenCalledTimes(1);
      expect(hook2).toHaveBeenCalledTimes(1);
    });

    it('does nothing if scope has no destroy hooks', () => {
      const scope = createScope();

      expect(triggerDestroyHooks(scope)).toBeUndefined();
    });

    it('does nothing if scope is destroyed', () => {
      const scope = createScope();
      scope.isDestroyed = true;
      setActiveScope(scope);

      const hook = vi.fn();
      onDestroy(hook);

      setActiveScope(null);

      triggerDestroyHooks(scope);

      expect(hook).not.toHaveBeenCalled();
    });

    it('handles errors in destroy hooks', () => {
      const scope = createScope();
      setActiveScope(scope);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const errorHook = vi.fn(() => {
        throw new Error('Destroy hook error');
      });
      const successHook = vi.fn();

      onDestroy(errorHook);
      onDestroy(successHook);

      setActiveScope(null);

      triggerDestroyHooks(scope);

      expect(errorHook).toHaveBeenCalledTimes(1);
      expect(successHook).toHaveBeenCalledTimes(1);

      consoleSpy.mockRestore();
    });
  });

  describe('lifecycle Integration', () => {
    it('executes lifecycle hooks in correct order', () => {
      const order: string[] = [];

      const scope = createScope();
      setActiveScope(scope);

      onMount(() => void order.push('mount'));
      onUpdate(() => void order.push('update'));
      onDestroy(() => void order.push('destroy'));

      setActiveScope(null);

      // Trigger lifecycle phases
      triggerMountHooks(scope);
      triggerUpdateHooks(scope);
      triggerDestroyHooks(scope);

      expect(order).toEqual(['mount', 'update', 'destroy']);
    });

    it('handles multiple scope lifecycle cycles', () => {
      const parent = createScope();
      const child = createScope(parent);

      setActiveScope(child);
      const childMountHook = vi.fn();
      onMount(childMountHook);
      const childDestroyHook = vi.fn();
      onDestroy(childDestroyHook);
      setActiveScope(null);

      // Lifecycle for child
      triggerMountHooks(child);
      expect(childMountHook).toHaveBeenCalledTimes(1);

      disposeScope(child);

      expect(childDestroyHook).toHaveBeenCalledTimes(1);
    });

    it('preserves hook execution order', () => {
      const order: number[] = [];

      const scope = createScope();
      setActiveScope(scope);

      const hook1 = vi.fn(() => void order.push(1));
      const hook2 = vi.fn(() => void order.push(2));
      const hook3 = vi.fn(() => void order.push(3));

      onMount(hook1);
      onMount(hook2);
      onMount(hook3);

      setActiveScope(null);

      triggerMountHooks(scope);

      expect(order).toEqual([1, 2, 3]);
    });

    it('allows multiple lifecycle hook registrations', () => {
      const scope = createScope();
      setActiveScope(scope);

      const hooks = Array.from({ length: 5 }, (_, i) => vi.fn(() => void i));

      hooks.forEach(hook => onMount(hook));

      setActiveScope(null);

      triggerMountHooks(scope);

      hooks.forEach(hook => expect(hook).toHaveBeenCalledTimes(1));
    });
  });

  describe('lifecycle with Cleanup', () => {
    it('combines onCleanup with onDestroy', () => {
      const order: string[] = [];

      const scope = createScope();
      setActiveScope(scope);

      onCleanup(() => void order.push('cleanup'));
      onDestroy(() => void order.push('destroy'));

      setActiveScope(null);

      disposeScope(scope);

      expect(order).toContain('destroy');
      expect(order).toContain('cleanup');
    });

    it('cleanup functions run during scope disposal', () => {
      const scope = createScope();
      setActiveScope(scope);

      const cleanup1 = vi.fn();
      const cleanup2 = vi.fn();

      onCleanup(cleanup1);
      onCleanup(cleanup2);

      setActiveScope(null);

      disposeScope(scope);

      expect(cleanup1).toHaveBeenCalledTimes(1);
      expect(cleanup2).toHaveBeenCalledTimes(1);
    });
  });

  describe('edge Cases', () => {
    it('handles empty hook sets gracefully', () => {
      const scope = createScope();

      expect(() => {
        triggerMountHooks(scope);
        triggerUpdateHooks(scope);
        triggerDestroyHooks(scope);
      }).not.toThrow();
    });

    it('handles rapid lifecycle transitions', () => {
      const scope = createScope();
      setActiveScope(scope);

      const hook = vi.fn();
      onMount(hook);

      setActiveScope(null);

      triggerMountHooks(scope);
      triggerMountHooks(scope); // Should not call again
      triggerUpdateHooks(scope);
      triggerDestroyHooks(scope);

      expect(hook).toHaveBeenCalledTimes(1);
    });

    it('prevents re-execution of cleared hooks', () => {
      const scope = createScope();
      setActiveScope(scope);

      const hook = vi.fn();
      onMount(hook);

      setActiveScope(null);

      triggerMountHooks(scope);

      expect(scope.onMount?.length).toBe(0);

      triggerMountHooks(scope);

      expect(hook).toHaveBeenCalledTimes(1);
    });

    it('handles hook registration after mounting', () => {
      const scope = createScope();
      setActiveScope(scope);

      const hook1 = vi.fn();
      onMount(hook1);

      setActiveScope(null);

      triggerMountHooks(scope);

      // Register hook after mounting
      setActiveScope(scope);
      const hook2 = vi.fn();
      onMount(hook2); // Should execute immediately

      setActiveScope(null);

      expect(hook1).toHaveBeenCalledTimes(1);
      expect(hook2).toHaveBeenCalledTimes(1);
    });
  });

  describe('lIFECYCLE constants', () => {
    it('exports lifecycle phase constants', () => {
      expect(LIFECYCLE.mount).toBe('mount');
      expect(LIFECYCLE.update).toBe('update');
      expect(LIFECYCLE.destroy).toBe('destroy');
    });
  });
});
