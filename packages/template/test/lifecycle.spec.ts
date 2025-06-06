import {
  cleanupLifecycle,
  createLifecycleContext,
  onDestroyed,
  onMounted,
  onUpdated,
  registerLifecycleHook,
  triggerLifecycleHook,
} from '../src/lifecycle';
import { createContext, setActiveContext } from '../src/context';

describe('lifecycle System', () => {
  // Reset active context before each test
  beforeEach(() => {
    // @ts-ignore - Setting to null is valid for tests but TypeScript doesn't like it
    setActiveContext(null);
  });

  describe('createLifecycleContext', () => {
    it('should create a lifecycle context with all required hooks', () => {
      const lifecycleContext = createLifecycleContext();

      expect(lifecycleContext).toBeDefined();
      expect(lifecycleContext.mounted).toBeInstanceOf(Set);
      expect(lifecycleContext.destroyed).toBeInstanceOf(Set);
      expect(lifecycleContext.updated).toBeInstanceOf(Set);

      expect(lifecycleContext.mounted.size).toBe(0);
      expect(lifecycleContext.destroyed.size).toBe(0);
      expect(lifecycleContext.updated.size).toBe(0);
    });
  });

  describe('registerLifecycleHook', () => {
    it('should register a lifecycle hook in the active context', () => {
      const context = createContext();
      setActiveContext(context);

      const mockHook = vi.fn();
      registerLifecycleHook('mounted', mockHook);

      expect(context.mounted.has(mockHook)).toBe(true);
      expect(context.mounted.size).toBe(1);
    });

    it('should not register hook if no active context', () => {
      // Ensure no active context
      // @ts-ignore - Setting to null is valid for tests
      setActiveContext(null);

      // Mock console.error to avoid polluting test output
      const originalError = console.error;
      console.error = vi.fn();

      const mockHook = vi.fn();
      registerLifecycleHook('mounted', mockHook);

      // Verify error was output
      expect(console.error).toHaveBeenCalled();

      // Restore console.error
      console.error = originalError;
    });

    it('should not register hook if invalid lifecycle type', () => {
      const context = createContext();
      setActiveContext(context);

      // Mock console.error to avoid polluting test output
      const originalError = console.error;
      console.error = vi.fn();

      const mockHook = vi.fn();
      // @ts-ignore - Intentionally passing invalid type
      registerLifecycleHook('invalid', mockHook);

      // Verify error was output
      expect(console.error).toHaveBeenCalled();

      // Restore console.error
      console.error = originalError;
    });

    it('should immediately call hook if registering mounted hook in mounted component', () => {
      const context = createContext();
      context.isMounted = true; // Simulate component already mounted
      setActiveContext(context);

      const mockHook = vi.fn();
      registerLifecycleHook('mounted', mockHook);

      // Verify hook was immediately called
      expect(mockHook).toHaveBeenCalled();
      // Verify hook was not added to the mounted collection
      expect(context.mounted.has(mockHook)).toBe(false);
    });

    it('should handle errors in immediate mounted hook execution', () => {
      const context = createContext();
      context.isMounted = true;
      setActiveContext(context);

      // Mock console.error to avoid polluting test output
      const originalError = console.error;
      console.error = vi.fn();

      const mockHook = vi.fn().mockImplementation(() => {
        throw new Error('Test error');
      });

      registerLifecycleHook('mounted', mockHook);

      // Verify error was caught and output
      expect(console.error).toHaveBeenCalled();
      // Restore console.error
      console.error = originalError;
    });
  });

  describe('triggerLifecycleHook', () => {
    it('should trigger all hooks of specified type', () => {
      const context = createContext();
      setActiveContext(context);

      const mockHook1 = vi.fn();
      const mockHook2 = vi.fn();

      context.mounted.add(mockHook1);
      context.mounted.add(mockHook2);

      triggerLifecycleHook('mounted');

      expect(mockHook1).toHaveBeenCalled();
      expect(mockHook2).toHaveBeenCalled();
    });

    it('should not trigger hooks if no active context', () => {
      // Ensure no active context
      // @ts-ignore - Setting to null is valid for tests
      setActiveContext(null);

      // Mock console.error to avoid polluting test output
      const originalError = console.error;
      console.error = vi.fn();

      triggerLifecycleHook('mounted');

      // Verify error was output
      expect(console.error).toHaveBeenCalled();

      // Restore console.error
      console.error = originalError;
    });

    it('should do nothing if no hooks of specified type', () => {
      const context = createContext();
      setActiveContext(context);

      // Ensure mounted hooks collection is empty
      context.mounted.clear();

      // Should not throw error
      expect(() => triggerLifecycleHook('mounted')).not.toThrow();
    });

    it('should continue execution if one hook throws error', () => {
      const context = createContext();
      setActiveContext(context);

      // Define hooks: first normal, second throws error, third normal
      const mockHook1 = vi.fn();
      const mockHook2 = vi.fn().mockImplementation(() => {
        throw new Error('Test error');
      });
      const mockHook3 = vi.fn();

      context.mounted.add(mockHook1);
      context.mounted.add(mockHook2);
      context.mounted.add(mockHook3);

      // Mock console.error to avoid polluting test output
      const originalError = console.error;
      console.error = vi.fn();

      // Trigger lifecycle hook
      triggerLifecycleHook('mounted');

      // Verify all hooks were called
      expect(mockHook1).toHaveBeenCalled();
      expect(mockHook2).toHaveBeenCalled();
      expect(mockHook3).toHaveBeenCalled();

      // Verify error was caught and output
      expect(console.error).toHaveBeenCalled();

      // Restore console.error and __DEV__
      console.error = originalError;
    });
  });

  describe('lifecycle Helper Functions', () => {
    it('should register onMount hook', () => {
      const context = createContext();
      setActiveContext(context);

      const mockHook = vi.fn();
      onMounted(mockHook);

      expect(context.mounted.has(mockHook)).toBe(true);
    });

    it('should register onDestroyed hook', () => {
      const context = createContext();
      setActiveContext(context);

      const mockHook = vi.fn();
      onDestroyed(mockHook);

      expect(context.destroyed.has(mockHook)).toBe(true);
    });

    it('should register onUpdated hook', () => {
      const context = createContext();
      setActiveContext(context);

      const mockHook = vi.fn();
      onUpdated(mockHook);

      expect(context.updated.has(mockHook)).toBe(true);
    });
  });

  describe('cleanupLifecycle', () => {
    it('should clear all lifecycle hooks from specified context', () => {
      const context = createContext();

      // Add some lifecycle hooks
      const mockMountedHook = vi.fn();
      const mockDestroyedHook = vi.fn();
      const mockUpdatedHook = vi.fn();

      context.mounted.add(mockMountedHook);
      context.destroyed.add(mockDestroyedHook);
      context.updated.add(mockUpdatedHook);

      // Clean up lifecycle
      cleanupLifecycle(context);

      // Verify all hook collections were cleared
      expect(context.mounted.size).toBe(0);
      expect(context.destroyed.size).toBe(0);
      expect(context.updated.size).toBe(0);
    });

    it('should clear all lifecycle hooks from active context if no context specified', () => {
      const context = createContext();
      setActiveContext(context);

      // Add some lifecycle hooks
      const mockMountedHook = vi.fn();
      const mockDestroyedHook = vi.fn();
      const mockUpdatedHook = vi.fn();

      context.mounted.add(mockMountedHook);
      context.destroyed.add(mockDestroyedHook);
      context.updated.add(mockUpdatedHook);

      // Clean up lifecycle
      cleanupLifecycle();

      // Verify all hook collections were cleared
      expect(context.mounted.size).toBe(0);
      expect(context.destroyed.size).toBe(0);
      expect(context.updated.size).toBe(0);
    });

    it('should do nothing if no context specified and no active context', () => {
      // Ensure no active context
      // @ts-ignore - Setting to null is valid for tests
      setActiveContext(null);

      // Should not throw error
      expect(() => cleanupLifecycle()).not.toThrow();
    });
  });
});
