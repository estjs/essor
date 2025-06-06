import {
  type Context,
  cleanupContext,
  createContext,
  destroyContext,
  findParentContext,
  getActiveContext,
  popContextStack,
  pushContextStack,
  setActiveContext,
} from '../src/context';
import { inject, provide } from '../src/provide';

describe('context', () => {
  beforeEach(() => {
    destroyContext(getActiveContext() as Context);
    setActiveContext(null);
    popContextStack();
  });
  afterEach(() => {
    destroyContext(getActiveContext() as Context);
    setActiveContext(null);
    popContextStack();
  });

  // Testing only the most basic functionality
  describe(' minimal test', () => {
    it('should create a context', () => {
      const context = createContext();
      expect(context).toBeDefined();
    });

    it('should handle active context', () => {
      const context = createContext();
      setActiveContext(context);
      expect(getActiveContext()).toBe(context);
    });

    it('should handle context stack', () => {
      const context1 = createContext();
      const context2 = createContext();

      pushContextStack(context1);
      expect(getActiveContext()).toBe(context1);

      pushContextStack(context2);
      expect(getActiveContext()).toBe(context2);

      popContextStack();
      expect(getActiveContext()).toBe(context1);
    });

    it('should handle provide/inject', () => {
      const context = createContext();
      setActiveContext(context);

      provide('key', 'value');
      expect(inject('key')).toBe('value');
    });

    it('should handle parent-child relationship', () => {
      const parent = createContext();
      const child = createContext(parent);

      expect(parent.children.has(child)).toBe(true);
      expect(child.parent).toBe(parent);
    });

    it('should clean up context', () => {
      const context = createContext();
      cleanupContext(context);
      expect(context.isDestroyed).toBe(true);
    });

    it('should handle cleanup functions', () => {
      const context = createContext();
      const fn = vi.fn();
      context.cleanup.add(fn);

      cleanupContext(context);
      expect(fn).toHaveBeenCalled();
    });
  });

  // Basic tests
  describe(' basic', () => {
    it('should create a context with default properties', () => {
      const context = createContext();
      expect(context).toBeDefined();
      expect(context.isMounted).toBe(false);
      expect(context.isDestroyed).toBe(false);
      expect(context.mounted).toBeInstanceOf(Set);
      expect(context.updated).toBeInstanceOf(Set);
      expect(context.destroyed).toBeInstanceOf(Set);
      expect(context.provides).toBeInstanceOf(Map);
      expect(context.cleanup).toBeInstanceOf(Set);
      expect(context.deps).toBeInstanceOf(Map);
      expect(context.componentEffect).toBeInstanceOf(Set);
      expect(context.parent).toBeNull();
      expect(context.children).toBeInstanceOf(Set);
    });

    it('should create a context with parent', () => {
      const parent = createContext();
      const child = createContext(parent);

      expect(parent.children.has(child)).toBe(true);
      expect(child.parent).toBe(parent);
    });
  });

  // Active context management tests
  describe(' active context', () => {
    it('should inherit provides from parent context', () => {
      const parent = createContext();
      setActiveContext(parent);
      provide('parentKey', 'parentValue');

      const child = createContext(parent);
      setActiveContext(child);

      expect(inject('parentKey')).toBe('parentValue');
    });

    it('should get and set active context', () => {
      const context = createContext();

      setActiveContext(context);
      expect(getActiveContext()).toBe(context);

      setActiveContext(null);
      expect(getActiveContext()).toBeNull();
    });

    it('should manage context stack correctly', () => {
      const context1 = createContext();
      const context2 = createContext();

      pushContextStack(context1);
      pushContextStack(context2);

      expect(getActiveContext()).toBe(context2);
      popContextStack();
      expect(getActiveContext()).toBe(context1);
      popContextStack();
      expect(getActiveContext()).toBeNull();
    });
  });

  // Parent context lookup tests
  describe(' parent finding', () => {
    it('should return active context when available', () => {
      const context = createContext();
      setActiveContext(context);

      expect(findParentContext()).toBe(context);
    });

    it('should find first non-destroyed context from stack when no active context', () => {
      const context1 = createContext();
      const context2 = createContext();

      // Push contexts to stack
      pushContextStack(context1);
      pushContextStack(context2);

      // Remove active context but leave contexts in stack
      setActiveContext(null);

      // Should find top context from stack
      expect(findParentContext()).toStrictEqual(context2);

      // If top context is destroyed, should find next valid one
      context2.isDestroyed = true;
      expect(findParentContext()).toStrictEqual(context1);

      // If all contexts are destroyed, should return null
      context1.isDestroyed = true;
      expect(findParentContext()).toBeNull();
    });

    it('should return null when no contexts are available', () => {
      setActiveContext(null);
      popContextStack();

      expect(findParentContext()).toBeNull();
    });
  });

  // Error handling tests
  describe(' error handling', () => {
    it('should log error when providing outside of context', () => {
      const errorSpy = vi.spyOn(console, 'error');
      setActiveContext(null);

      provide('testKey', 'testValue');

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('provide must be called within a template'),
      );
      errorSpy.mockRestore();
    });

    it('should log error when injecting outside of context', () => {
      const errorSpy = vi.spyOn(console, 'error');
      setActiveContext(null);

      inject('testKey');

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('inject must be called within a template'),
      );
      errorSpy.mockRestore();
    });
  });
  // Destruction tests
  describe(' destroy test', () => {
    beforeEach(() => {
      destroyContext(getActiveContext() as Context);
      setActiveContext(null);
      popContextStack();
    });

    afterEach(() => {
      destroyContext(getActiveContext() as Context);
      setActiveContext(null);
      popContextStack();
    });

    it('should destroy a context', () => {
      const context = createContext();
      destroyContext(context);
      expect(context.isDestroyed).toBe(true);
    });

    it('should destroy a simple parent-child relationship', () => {
      const parent = createContext();
      const child = createContext(parent);

      destroyContext(parent);

      expect(parent.isDestroyed).toBe(true);
      expect(child.isDestroyed).toBe(true);
    });

    it('should cleanup all children when destroying parent', () => {
      const parent = createContext();
      const child1 = createContext(parent);
      const child2 = createContext(parent);

      const spyCleanup1 = vi.fn();
      const spyCleanup2 = vi.fn();

      child1.cleanup.add(spyCleanup1);
      child2.cleanup.add(spyCleanup2);

      destroyContext(parent);

      expect(spyCleanup1).toHaveBeenCalled();
      expect(spyCleanup2).toHaveBeenCalled();
    });
  });

  // Destruction tests
  describe(' destroying', () => {
    it('should destroy context and all children', () => {
      const parent = createContext();
      const child1 = createContext(parent);
      const child2 = createContext(parent);

      destroyContext(parent);

      expect(parent.isDestroyed).toBe(true);
      expect(child1.isDestroyed).toBe(true);
      expect(child2.isDestroyed).toBe(true);
    });

    it('should not throw if destroying null or already destroyed context', () => {
      expect(() => destroyContext(null as any)).not.toThrow();

      const context = createContext();
      context.isDestroyed = true;
      expect(() => destroyContext(context)).not.toThrow();
    });
  });

  // Cleanup tests
  describe(' cleanup', () => {
    it('should clean up context fields', () => {
      const context = createContext();
      const parentCtx = createContext();
      const child = createContext(parentCtx);
      context.children.add(child);

      // Add items to context collections
      context.mounted.add(() => {});
      context.updated.add(() => {});
      context.destroyed.add(() => {});
      context.cleanup.add(() => {});
      context.deps.set('key', new Set([() => {}]));
      context.componentEffect.add(() => {});

      // Add inject cache
      setActiveContext(context);
      inject('testKey', 'defaultValue');

      cleanupContext(context);

      // Verify all collections are cleared
      expect(context.mounted.size).toBe(0);
      expect(context.updated.size).toBe(0);
      expect(context.destroyed.size).toBe(0);
      expect(context.cleanup.size).toBe(0);
      expect(context.deps.size).toBe(0);
      expect(context.componentEffect.size).toBe(0);
      expect(context.children.size).toBe(0);
      expect(context.isDestroyed).toBe(true);
    });

    it('should call all cleanup functions when cleaning up context', () => {
      const context = createContext();
      const cleanupFn1 = vi.fn();
      const cleanupFn2 = vi.fn();
      context.cleanup.add(cleanupFn1);
      context.cleanup.add(cleanupFn2);

      cleanupContext(context);

      expect(cleanupFn1).toHaveBeenCalled();
      expect(cleanupFn2).toHaveBeenCalled();
    });

    it('should break parent-child relationship during cleanup', () => {
      const parent = createContext();
      const child = createContext(parent);

      cleanupContext(child);

      expect(parent.children.has(child)).toBe(false);
      expect(child.parent).toBeNull();
    });

    it('should handle error in cleanup function', () => {
      const context = createContext();
      const errorCleanup = () => {
        throw new Error('Cleanup error');
      };
      context.cleanup.add(errorCleanup);

      const errorSpy = vi.spyOn(console, 'error');

      cleanupContext(context);

      expect(errorSpy).toHaveBeenCalled();
      expect(context.isDestroyed).toBe(true);
      errorSpy.mockRestore();
    });
  });
});
