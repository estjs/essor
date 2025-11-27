import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LIFECYCLE,
  cleanupLifecycle,
  onDestroy,
  onMount,
  onUpdate,
  registerLifecycleHook,
  triggerLifecycleHook,
} from '../src/lifecycle';
import { createContext, popContextStack, pushContextStack } from '../src/context';
import { resetEnvironment } from './test-utils';

describe('lifecycle management', () => {
  beforeEach(() => {
    resetEnvironment();
  });

  describe('registerLifecycleHook', () => {
    it('registers and triggers lifecycle hooks', async () => {
      const context = createContext(null);
      pushContextStack(context);

      const hook = vi.fn();
      registerLifecycleHook('mount', hook);
      await triggerLifecycleHook('mount');

      expect(hook).toHaveBeenCalled();
      popContextStack();
    });

    it('registers mount hook', () => {
      const context = createContext(null);
      pushContextStack(context);

      const hook = vi.fn();
      registerLifecycleHook(LIFECYCLE.mount, hook);

      expect(context.mount.has(hook)).toBe(true);
      popContextStack();
    });

    it('registers update hook', () => {
      const context = createContext(null);
      pushContextStack(context);

      const hook = vi.fn();
      registerLifecycleHook(LIFECYCLE.update, hook);

      expect(context.update.has(hook)).toBe(true);
      popContextStack();
    });

    it('registers destroy hook', () => {
      const context = createContext(null);
      pushContextStack(context);

      const hook = vi.fn();
      registerLifecycleHook(LIFECYCLE.destroy, hook);

      expect(context.destroy.has(hook)).toBe(true);
      popContextStack();
    });

    it('executes mount hook immediately if context is already mount', () => {
      const context = createContext(null);
      context.isMount = true;
      pushContextStack(context);

      const hook = vi.fn();
      registerLifecycleHook(LIFECYCLE.mount, hook);

      expect(hook).toHaveBeenCalled();
      popContextStack();
    });

    it('handles errors in immediately executed mount hooks', () => {
      const context = createContext(null);
      context.isMount = true;
      pushContextStack(context);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
      const hook = vi.fn(() => {
        throw new Error('Hook error');
      });

      registerLifecycleHook(LIFECYCLE.mount, hook);
      expect(hook).toHaveBeenCalled();

      consoleSpy.mockRestore();
      popContextStack();
    });

    it('logs error when registering hook outside context', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

      const hook = vi.fn();
      registerLifecycleHook(LIFECYCLE.mount, hook);

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('logs error for invalid lifecycle type', () => {
      const context = createContext(null);
      pushContextStack(context);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
      const hook = vi.fn();

      registerLifecycleHook('invalid' as any, hook);

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
      popContextStack();
    });
  });

  describe('triggerLifecycleHook', () => {
    it('triggers all registered hooks', async () => {
      const context = createContext(null);
      pushContextStack(context);

      const hook1 = vi.fn();
      const hook2 = vi.fn();
      registerLifecycleHook(LIFECYCLE.mount, hook1);
      registerLifecycleHook(LIFECYCLE.mount, hook2);

      await triggerLifecycleHook(LIFECYCLE.mount);

      expect(hook1).toHaveBeenCalled();
      expect(hook2).toHaveBeenCalled();
      popContextStack();
    });

    it('early returns when no hooks exist', async () => {
      const context = createContext(null);
      pushContextStack(context);

      await expect(triggerLifecycleHook(LIFECYCLE.mount)).resolves.toBeUndefined();
      popContextStack();
    });

    it('logs error when triggering outside context', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

      await triggerLifecycleHook(LIFECYCLE.mount);

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('handles synchronous hooks', async () => {
      const context = createContext(null);
      pushContextStack(context);

      const hook = vi.fn();
      registerLifecycleHook(LIFECYCLE.mount, hook);

      await triggerLifecycleHook(LIFECYCLE.mount);

      expect(hook).toHaveBeenCalled();
      popContextStack();
    });

    it('handles asynchronous hooks', async () => {
      const context = createContext(null);
      pushContextStack(context);

      const hook = vi.fn(async () => {
        await new Promise<void>(resolve => setTimeout(resolve, 10));
      });
      registerLifecycleHook(LIFECYCLE.mount, hook);

      await triggerLifecycleHook(LIFECYCLE.mount);

      expect(hook).toHaveBeenCalled();
      popContextStack();
    });

    it('handles hook errors gracefully', async () => {
      const context = createContext(null);
      pushContextStack(context);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
      const errorHook = vi.fn(() => {
        throw new Error('Hook error');
      });
      const successHook = vi.fn();

      registerLifecycleHook(LIFECYCLE.mount, errorHook);
      registerLifecycleHook(LIFECYCLE.mount, successHook);

      await triggerLifecycleHook(LIFECYCLE.mount);

      expect(errorHook).toHaveBeenCalled();
      expect(successHook).toHaveBeenCalled();

      consoleSpy.mockRestore();
      popContextStack();
    });

    it('handles async hook errors gracefully', async () => {
      const context = createContext(null);
      pushContextStack(context);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
      const errorHook = vi.fn(async () => {
        throw new Error('Async hook error');
      });

      registerLifecycleHook(LIFECYCLE.mount, errorHook);

      await triggerLifecycleHook(LIFECYCLE.mount);

      expect(errorHook).toHaveBeenCalled();

      consoleSpy.mockRestore();
      popContextStack();
    });

    it('handles hook timeout in development mode', async () => {
      const originalDev = (globalThis as any).__DEV__;
      (globalThis as any).__DEV__ = true;

      const context = createContext(null);
      pushContextStack(context);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
      const slowHook = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 4000));
      });

      registerLifecycleHook(LIFECYCLE.mount, slowHook);

      await triggerLifecycleHook(LIFECYCLE.mount);

      expect(slowHook).toHaveBeenCalled();

      consoleSpy.mockRestore();
      popContextStack();
      (globalThis as any).__DEV__ = originalDev;
    }, 5000);
  });

  describe('lifecycle helper functions', () => {
    it('supports onMount helper', async () => {
      const context = createContext(null);
      pushContextStack(context);

      const mount = vi.fn();
      onMount(mount);

      await triggerLifecycleHook(LIFECYCLE.mount);

      expect(mount).toHaveBeenCalled();
      popContextStack();
    });

    it('supports onUpdate helper', async () => {
      const context = createContext(null);
      pushContextStack(context);

      const update = vi.fn();
      onUpdate(update);

      await triggerLifecycleHook(LIFECYCLE.update);

      expect(update).toHaveBeenCalled();
      popContextStack();
    });

    it('supports onDestroy helper', async () => {
      const context = createContext(null);
      pushContextStack(context);

      const destroy = vi.fn();
      onDestroy(destroy);

      await triggerLifecycleHook(LIFECYCLE.destroy);

      expect(destroy).toHaveBeenCalled();
      popContextStack();
    });

    it('supports all lifecycle helpers together', async () => {
      const context = createContext(null);
      pushContextStack(context);

      const mount = vi.fn();
      const update = vi.fn();
      const destroy = vi.fn();

      onMount(mount);
      onUpdate(update);
      onDestroy(destroy);

      await triggerLifecycleHook(LIFECYCLE.mount);
      await triggerLifecycleHook(LIFECYCLE.update);
      await triggerLifecycleHook(LIFECYCLE.destroy);

      expect(mount).toHaveBeenCalled();
      expect(update).toHaveBeenCalled();
      expect(destroy).toHaveBeenCalled();

      popContextStack();
    });
  });

  describe('cleanupLifecycle', () => {
    it('clears all lifecycle hooks', () => {
      const context = createContext(null);
      pushContextStack(context);

      onMount(vi.fn());
      onUpdate(vi.fn());
      onDestroy(vi.fn());

      expect(context.mount.size).toBeGreaterThan(0);
      expect(context.update.size).toBeGreaterThan(0);
      expect(context.destroy.size).toBeGreaterThan(0);

      cleanupLifecycle(context);

      expect(context.mount.size).toBe(0);
      expect(context.update.size).toBe(0);
      expect(context.destroy.size).toBe(0);

      popContextStack();
    });

    it('uses active context when no context provided', () => {
      const context = createContext(null);
      pushContextStack(context);

      onMount(vi.fn());

      expect(context.mount.size).toBeGreaterThan(0);

      cleanupLifecycle();

      expect(context.mount.size).toBe(0);

      popContextStack();
    });

    it('handles cleanup without active context', () => {
      expect(() => cleanupLifecycle()).not.toThrow();
    });

    it('handles cleanup with partial lifecycle hooks', () => {
      const context = createContext(null);
      pushContextStack(context);

      onMount(vi.fn());
      // Only mount hook registered

      cleanupLifecycle(context);

      expect(context.mount.size).toBe(0);
      expect(context.update.size).toBe(0);
      expect(context.destroy.size).toBe(0);

      popContextStack();
    });
  });

  describe('edge cases', () => {
    it('handles multiple hooks of same type', async () => {
      const context = createContext(null);
      pushContextStack(context);

      const hooks = [vi.fn(), vi.fn(), vi.fn()];
      hooks.forEach(hook => registerLifecycleHook(LIFECYCLE.mount, hook));

      await triggerLifecycleHook(LIFECYCLE.mount);

      hooks.forEach(hook => expect(hook).toHaveBeenCalled());
      popContextStack();
    });

    it('handles hook that returns non-promise value', async () => {
      const context = createContext(null);
      pushContextStack(context);

      const hook = vi.fn(() => {
        // Hook should not return a value
      });
      registerLifecycleHook(LIFECYCLE.mount, hook);

      await triggerLifecycleHook(LIFECYCLE.mount);

      expect(hook).toHaveBeenCalled();
      popContextStack();
    });

    it('handles empty hook set', async () => {
      const context = createContext(null);
      pushContextStack(context);

      await expect(triggerLifecycleHook(LIFECYCLE.mount)).resolves.toBeUndefined();
      popContextStack();
    });

    it('preserves hook execution order', async () => {
      const context = createContext(null);
      pushContextStack(context);

      const order: number[] = [];
      const hook1 = vi.fn(() => {
        order.push(1);
      });
      const hook2 = vi.fn(() => {
        order.push(2);
      });
      const hook3 = vi.fn(() => {
        order.push(3);
      });

      registerLifecycleHook(LIFECYCLE.mount, hook1);
      registerLifecycleHook(LIFECYCLE.mount, hook2);
      registerLifecycleHook(LIFECYCLE.mount, hook3);

      await triggerLifecycleHook(LIFECYCLE.mount);

      expect(order).toEqual([1, 2, 3]);
      popContextStack();
    });
  });
});
