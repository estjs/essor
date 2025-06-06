import {
  type Context,
  cleanupContext,
  createContext,
  destroyContext,
  getActiveContext,
  popContextStack,
  setActiveContext,
} from '../src/context';
import { inject, provide } from '../src/provide';

describe('provide', () => {
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

  // Basic provide/inject tests
  describe(' basic', () => {
    it('should provide and inject string keys', () => {
      const context = createContext();
      setActiveContext(context);

      provide('testKey', 'testValue');
      expect(inject('testKey')).toBe('testValue');
    });

    it('should provide and inject number keys', () => {
      const context = createContext();
      setActiveContext(context);

      provide(123, 'numValue');
      expect(inject(123)).toBe('numValue');
    });

    it('should provide and inject symbol keys', () => {
      const symbolKey = Symbol('test');
      const context = createContext();
      setActiveContext(context);

      provide(symbolKey, 'symbolValue');
      expect(inject(symbolKey)).toBe('symbolValue');
    });

    it('should return default value when key not found', () => {
      const context = createContext();
      setActiveContext(context);

      const defaultValue = 'default';
      expect(inject('nonExistentKey', defaultValue)).toBe(defaultValue);
    });
  });

  // Advanced provide/inject tests
  describe(' advanced', () => {
    it('should resolve injection through parent chain', () => {
      const grandparent = createContext();
      const parent = createContext(grandparent);
      const child = createContext(parent);

      setActiveContext(grandparent);
      provide('ancestorKey', 'ancestorValue');

      setActiveContext(child);
      expect(inject('ancestorKey')).toBe('ancestorValue');
    });

    it('should cache injection results', () => {
      const parent = createContext();
      setActiveContext(parent);
      provide('cachedKey', 'cachedValue');

      const child = createContext(parent);
      setActiveContext(child);

      // First access should cache the value
      expect(inject('cachedKey')).toBe('cachedValue');

      // Modify the parent's provided value
      setActiveContext(parent);
      provide('cachedKey', 'newValue');

      // Child should still see the cached value when we use it again
      setActiveContext(child);
      expect(inject('cachedKey')).toBe('cachedValue');
    });

    it('should clear injection cache when context is destroyed', () => {
      const context = createContext();
      setActiveContext(context);

      provide('testKey', 'testValue');
      expect(inject('testKey')).toBe('testValue');

      // Destroy context, which should clear cache
      cleanupContext(context);

      // Create a new context
      const newContext = createContext();
      setActiveContext(newContext);

      // Should return default value since there's no provider
      expect(inject('testKey', 'default')).toBe('default');
    });
  });
});
