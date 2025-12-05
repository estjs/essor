import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createContext,
  destroyContext,
  findParentContext,
  getActiveContext,
  popContextStack,
  pushContextStack,
  withContext,
} from '../src/context';
import { inject, provide } from '../src/provide';
import { resetEnvironment } from './test-utils';

describe('context system', () => {
  beforeEach(() => {
    resetEnvironment();
    while (getActiveContext()) {
      popContextStack();
    }
  });

  it('manages context stack correctly', () => {
    const parent = createContext(null);
    const child = createContext(parent);

    pushContextStack(parent);
    expect(getActiveContext()).toBe(parent);

    const result = withContext(child, () => {
      expect(getActiveContext()).toBe(child);
      return 42;
    });

    expect(result).toBe(42);
    expect(getActiveContext()).toBe(parent);

    popContextStack();
    expect(getActiveContext()).toBeNull();
  });

  it('provides and injects values through hierarchy', () => {
    const root = createContext(null);
    pushContextStack(root);
    provide('token', 'value');

    const child = createContext(root);
    withContext(child, () => {
      expect(inject('token')).toBe('value');
      expect(inject('missing', 'fallback')).toBe('fallback');
    });

    popContextStack();
  });

  it('supports symbol injection keys', () => {
    const key = Symbol('inject');
    const root = createContext(null);
    pushContextStack(root);
    provide(key, 99);
    expect(inject(key)).toBe(99);
    popContextStack();
  });

  it('destroys context and clears resources', () => {
    const root = createContext(null);
    pushContextStack(root);

    const cleanupSpy = vi.fn();
    root.cleanup.add(cleanupSpy);
    provide('token', 'value');

    const child = createContext(root);
    pushContextStack(child);
    expect(findParentContext()).toBe(child);
    popContextStack();
    expect(findParentContext()).toBe(root);

    popContextStack(); // Pop root from stack before destroying

    destroyContext(root);

    expect(root.isDestroy).toBe(true);
    expect(cleanupSpy).toHaveBeenCalled();
    expect(root.provides.size).toBe(0);
  });

  it('handles provide/inject calls without active context gracefully', () => {
    expect(() => provide('no-context', 1)).not.toThrow();
    expect(inject('missing', 'default')).toBe('default');
  });
});
