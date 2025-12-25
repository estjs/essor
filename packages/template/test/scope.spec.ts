import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type Scope,
  createScope,
  disposeScope,
  getActiveScope,
  onCleanup,
  runWithScope,
  setActiveScope,
} from '../src/scope';
import { inject, provide } from '../src';
import { registerDestroyHook, registerMountHook, triggerMountHooks } from '../src/lifecycle';

describe('scope System', () => {
  beforeEach(() => {
    setActiveScope(null);
  });

  describe('createScope', () => {
    it('should create a scope with a unique ID', () => {
      const scope1 = createScope();
      const scope2 = createScope();
      expect(scope1.id).not.toBe(scope2.id);
      expect(scope1.id).toBeTypeOf('number');
    });

    it('should create a root scope when no parent is provided and no active scope exists', () => {
      const scope = createScope();
      expect(scope.parent).toBeNull();
    });

    it('should inherit parent from active scope implicitly', () => {
      const parent = createScope();
      let child: Scope;

      runWithScope(parent, () => {
        child = createScope();
        expect(child.parent).toBe(parent);
      });
    });

    it('should accept explicit parent', () => {
      const parent = createScope();
      const child = createScope(parent);
      expect(child.parent).toBe(parent);
    });

    it("should add child to parent's children set", () => {
      const parent = createScope();
      const child = createScope(parent);

      expect(parent.children).toBeInstanceOf(Set);
      expect(parent.children?.has(child)).toBe(true);
    });
  });

  describe('active Scope Management', () => {
    it('should get and set active scope', () => {
      const scope = createScope();
      expect(getActiveScope()).toBeNull();

      setActiveScope(scope);
      expect(getActiveScope()).toBe(scope);

      setActiveScope(null);
      expect(getActiveScope()).toBeNull();
    });
  });

  describe('runWithScope', () => {
    it('should set active scope during execution', () => {
      const scope = createScope();

      runWithScope(scope, () => {
        expect(getActiveScope()).toBe(scope);
      });

      expect(getActiveScope()).toBeNull();
    });

    it('should restore previous active scope', () => {
      const outer = createScope();
      const inner = createScope();

      setActiveScope(outer);

      runWithScope(inner, () => {
        expect(getActiveScope()).toBe(inner);
      });

      expect(getActiveScope()).toBe(outer);
    });

    it('should return the value from the callback', () => {
      const scope = createScope();
      const result = runWithScope(scope, () => 'test-value');
      expect(result).toBe('test-value');
    });

    it('should restore scope even if callback throws', () => {
      const outer = createScope();
      const inner = createScope();

      setActiveScope(outer);

      expect(() => {
        runWithScope(inner, () => {
          throw new Error('test error');
        });
      }).toThrow('test error');

      expect(getActiveScope()).toBe(outer);
    });

    it('should handle nested calls correctly', () => {
      const scope1 = createScope();
      const scope2 = createScope();
      const scope3 = createScope();

      runWithScope(scope1, () => {
        expect(getActiveScope()).toBe(scope1);

        runWithScope(scope2, () => {
          expect(getActiveScope()).toBe(scope2);

          runWithScope(scope3, () => {
            expect(getActiveScope()).toBe(scope3);
          });

          expect(getActiveScope()).toBe(scope2);
        });

        expect(getActiveScope()).toBe(scope1);
      });

      expect(getActiveScope()).toBeNull();
    });
  });

  describe('cleanup & Disposal', () => {
    it('should register cleanup callbacks via onCleanup', () => {
      const scope = createScope();
      const cleanup = vi.fn();

      runWithScope(scope, () => {
        onCleanup(cleanup);
      });

      expect(scope.cleanup?.has(cleanup)).toBe(true);
      expect(cleanup).not.toHaveBeenCalled();
    });

    it('should call cleanup callbacks when disposed', () => {
      const scope = createScope();
      const cleanup1 = vi.fn();
      const cleanup2 = vi.fn();

      runWithScope(scope, () => {
        onCleanup(cleanup1);
        onCleanup(cleanup2);
      });

      disposeScope(scope);

      expect(cleanup1).toHaveBeenCalledTimes(1);
      expect(cleanup2).toHaveBeenCalledTimes(1);
      expect(scope.isDestroyed).toBe(true);
    });

    it('should be safe to call disposeScope multiple times (idempotent)', () => {
      const scope = createScope();
      const cleanup = vi.fn();

      runWithScope(scope, () => {
        onCleanup(cleanup);
      });

      disposeScope(scope);
      disposeScope(scope);

      expect(cleanup).toHaveBeenCalledTimes(1);
    });

    it('should remove itself from parent when disposed', () => {
      const parent = createScope();
      const child = createScope(parent);

      expect(parent.children?.has(child)).toBe(true);

      disposeScope(child);

      expect(parent.children?.has(child)).toBe(false);
    });

    it('should recursively dispose children', () => {
      const parent = createScope();
      const child = createScope(parent);
      const grandchild = createScope(child);

      const parentCleanup = vi.fn();
      const childCleanup = vi.fn();
      const grandchildCleanup = vi.fn();

      runWithScope(parent, () => onCleanup(parentCleanup));
      runWithScope(child, () => onCleanup(childCleanup));
      runWithScope(grandchild, () => onCleanup(grandchildCleanup));

      disposeScope(parent);

      expect(grandchildCleanup).toHaveBeenCalled();
      expect(childCleanup).toHaveBeenCalled();
      expect(parentCleanup).toHaveBeenCalled();

      expect(grandchild.isDestroyed).toBe(true);
      expect(child.isDestroyed).toBe(true);
      expect(parent.isDestroyed).toBe(true);
    });

    it('should clear all internal collections', () => {
      const scope = createScope();

      runWithScope(scope, () => {
        provide('key', 'value');
        onCleanup(() => {});
        registerMountHook(() => {});
      });

      expect(scope.provides?.size).toBeGreaterThan(0);
      expect(scope.cleanup?.size).toBeGreaterThan(0);

      disposeScope(scope);

      expect(scope.provides?.size ?? 0).toBe(0);
      // Checking implementation: scope.provides?.clear(); scope.cleanup?.clear();
      // It clears the Set/Map content.
      expect(scope.provides?.size ?? 0).toBe(0);
      expect(scope.cleanup?.size ?? 0).toBe(0);
      expect(scope.children?.size ?? 0).toBe(0);
    });

    it('should handle errors in cleanup functions gracefully', () => {
      const scope = createScope();
      const errorCleanup = vi.fn(() => {
        throw new Error('cleanup error');
      });
      const successCleanup = vi.fn();

      // Mock console.error to avoid noise in test output
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      runWithScope(scope, () => {
        onCleanup(errorCleanup);
        onCleanup(successCleanup);
      });

      expect(() => disposeScope(scope)).not.toThrow();

      expect(errorCleanup).toHaveBeenCalled();
      expect(successCleanup).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('provide / Inject Integration', () => {
    it('should provide and inject values within the same scope', () => {
      const scope = createScope();
      const key = Symbol('test');
      const value = { foo: 'bar' };

      runWithScope(scope, () => {
        provide(key, value);
        expect(inject(key)).toBe(value);
      });
    });

    it('should inject values from parent scope', () => {
      const parent = createScope();
      const child = createScope(parent);
      const key = Symbol('test');
      const value = 'inherited';

      runWithScope(parent, () => {
        provide(key, value);
      });

      runWithScope(child, () => {
        expect(inject(key)).toBe(value);
      });
    });

    it('should shadow values in child scope', () => {
      const parent = createScope();
      const child = createScope(parent);
      const key = Symbol('test');
      const parentValue = 'parent';
      const childValue = 'child';

      runWithScope(parent, () => {
        provide(key, parentValue);
      });

      runWithScope(child, () => {
        provide(key, childValue);
        expect(inject(key)).toBe(childValue);
      });

      // Parent should remain unchanged
      runWithScope(parent, () => {
        expect(inject(key)).toBe(parentValue);
      });
    });

    it('should return default value if key not found', () => {
      const scope = createScope();
      const key = Symbol('test');
      const defaultValue = 'default';

      runWithScope(scope, () => {
        expect(inject(key, defaultValue)).toBe(defaultValue);
      });
    });

    it('should return undefined if key not found and no default provided', () => {
      const scope = createScope();
      const key = Symbol('test');

      runWithScope(scope, () => {
        expect(inject(key)).toBeUndefined();
      });
    });
  });

  describe('lifecycle Hooks Integration', () => {
    it('should execute destroy hooks on disposal', () => {
      const scope = createScope();
      const destroyHook = vi.fn();

      runWithScope(scope, () => {
        registerDestroyHook(destroyHook);
      });

      disposeScope(scope);
      expect(destroyHook).toHaveBeenCalledTimes(1);
    });

    it('should execute mount hooks when triggered', () => {
      const scope = createScope();
      const mountHook = vi.fn();

      runWithScope(scope, () => {
        registerMountHook(mountHook);
      });

      expect(mountHook).not.toHaveBeenCalled();

      triggerMountHooks(scope);
      expect(mountHook).toHaveBeenCalledTimes(1);
      expect(scope.isMounted).toBe(true);
    });

    it('should execute mount hook immediately if scope is already mounted', () => {
      const scope = createScope();
      triggerMountHooks(scope);

      const mountHook = vi.fn();
      runWithScope(scope, () => {
        registerMountHook(mountHook);
      });

      expect(mountHook).toHaveBeenCalledTimes(1);
    });
  });
});
