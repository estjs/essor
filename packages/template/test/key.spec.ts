import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createComponent } from '../src/component';
import {
  getComponentKey,
  getKeyOrFallback,
  getNodeKey,
  isSameNodeType,
  normalizeKey,
  setNodeKey,
  validateKeys,
} from '../src/key';
import { createTestRoot, resetEnvironment } from './test-utils';

describe('key system', () => {
  beforeEach(() => {
    resetEnvironment();
  });

  describe('normalizeKey', () => {
    it('returns undefined for null', () => {
      expect(normalizeKey(null)).toBeUndefined();
    });

    it('returns undefined for undefined', () => {
      expect(normalizeKey(undefined)).toBeUndefined();
    });

    it('returns string as-is for normal length', () => {
      expect(normalizeKey('my-key')).toBe('my-key');
      expect(normalizeKey('')).toBe('');
      expect(normalizeKey('a')).toBe('a');
    });

    it('truncates very long strings', () => {
      const longKey = 'a'.repeat(1500);
      const result = normalizeKey(longKey);
      expect(result).toBeDefined();
      expect(result!.length).toBeLessThan(longKey.length);
    });

    it('converts numbers to strings', () => {
      expect(normalizeKey(42)).toBe('42');
      expect(normalizeKey(0)).toBe('0');
      expect(normalizeKey(-1)).toBe('-1');
      expect(normalizeKey(3.14)).toBe('3.14');
    });

    it('handles NaN in dev mode', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(normalizeKey(Number.NaN)).toBeUndefined();
      warnSpy.mockRestore();
    });

    it('handles Infinity in dev mode', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(normalizeKey(Infinity)).toBeUndefined();
      expect(normalizeKey(-Infinity)).toBeUndefined();
      warnSpy.mockRestore();
    });

    it('normalizes global symbols', () => {
      const sym = Symbol.for('global-key');
      expect(normalizeKey(sym)).toBe('_s.global-key');
    });

    it('normalizes local symbols with description', () => {
      const sym = Symbol('local-key');
      expect(normalizeKey(sym)).toBe('_s.local-key');
    });

    it('normalizes symbols without description', () => {
      const sym = Symbol();
      const result = normalizeKey(sym);
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('converts objects to string', () => {
      expect(normalizeKey({})).toBe('[object Object]');
      expect(normalizeKey({ toString: () => 'custom' })).toBe('custom');
    });

    it('converts booleans to string', () => {
      expect(normalizeKey(true)).toBe('true');
      expect(normalizeKey(false)).toBeUndefined();
    });
  });

  describe('setNodeKey / getNodeKey', () => {
    it('sets and gets key on DOM element', () => {
      const el = document.createElement('div');
      setNodeKey(el, 'test-key');
      expect(getNodeKey(el)).toBe('test-key');
    });

    it('sets and gets key on text node', () => {
      const text = document.createTextNode('hello');
      setNodeKey(text, 'text-key');
      expect(getNodeKey(text)).toBe('text-key');
    });

    it('normalizes key when setting', () => {
      const el = document.createElement('div');
      setNodeKey(el, 123);
      expect(getNodeKey(el)).toBe('123');
    });

    it('removes key when set to undefined', () => {
      const el = document.createElement('div');
      setNodeKey(el, 'initial');
      expect(getNodeKey(el)).toBe('initial');

      setNodeKey(el, undefined);
      expect(getNodeKey(el)).toBeUndefined();
    });

    it('removes key when set to null', () => {
      const el = document.createElement('div');
      setNodeKey(el, 'initial');
      setNodeKey(el, null as any);
      expect(getNodeKey(el)).toBeUndefined();
    });

    it('returns undefined for null node', () => {
      expect(getNodeKey(null as any)).toBeUndefined();
    });

    it('skips setting key on component nodes', () => {
      const Comp = () => document.createElement('div');
      const instance = createComponent(Comp);
      // Should not throw
      expect(() => setNodeKey(instance, 'key')).not.toThrow();
    });

    it('gets key from component nodes', () => {
      const Comp = () => document.createElement('div');
      const instance = createComponent(Comp, { key: 'comp-key' });
      expect(getNodeKey(instance)).toBe('comp-key');
    });

    it('skips setting key on document node', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      setNodeKey(document as any, 'key');
      warnSpy.mockRestore();
    });
  });

  describe('getKeyOrFallback', () => {
    it('returns existing key if present', () => {
      const el = document.createElement('div');
      setNodeKey(el, 'existing');
      expect(getKeyOrFallback(el, 5)).toBe('existing');
    });

    it('returns fallback key if no key present', () => {
      const el = document.createElement('div');
      expect(getKeyOrFallback(el, 5)).toBe('.5');
      expect(getKeyOrFallback(el, 0)).toBe('.0');
    });

    it('fallback key starts with dot', () => {
      const el = document.createElement('div');
      const fallback = getKeyOrFallback(el, 10);
      expect(fallback[0]).toBe('.');
    });
  });

  describe('getComponentKey', () => {
    it('generates key for named function', () => {
      function MyComponent() {
        return document.createElement('div');
      }
      const key = getComponentKey(MyComponent);
      expect(key).toContain('MyComponent');
    });

    it('generates key for anonymous function', () => {
      const AnonymousComp = function () {
        return document.createElement('div');
      };
      Object.defineProperty(AnonymousComp, 'name', { value: '' });
      const key = getComponentKey(AnonymousComp);
      expect(key).toContain('anonymous');
    });

    it('caches key for same function', () => {
      function CachedComp() {
        return document.createElement('div');
      }
      const key1 = getComponentKey(CachedComp);
      const key2 = getComponentKey(CachedComp);
      expect(key1).toBe(key2);
    });

    it('generates different keys for different functions', () => {
      function Comp1() {
        return document.createElement('div');
      }
      function Comp2() {
        return document.createElement('span');
      }
      const key1 = getComponentKey(Comp1);
      const key2 = getComponentKey(Comp2);
      expect(key1).not.toBe(key2);
    });
  });

  describe('isSameNodeType', () => {
    it('returns true for same element type', () => {
      const div1 = document.createElement('div');
      const div2 = document.createElement('div');
      expect(isSameNodeType(div1, div2)).toBe(true);
    });

    it('returns false for different element types', () => {
      const div = document.createElement('div');
      const span = document.createElement('span');
      expect(isSameNodeType(div, span)).toBe(false);
    });

    it('returns true for text nodes', () => {
      const text1 = document.createTextNode('a');
      const text2 = document.createTextNode('b');
      expect(isSameNodeType(text1, text2)).toBe(true);
    });

    it('returns false for text vs element', () => {
      const text = document.createTextNode('text');
      const div = document.createElement('div');
      expect(isSameNodeType(text, div)).toBe(false);
    });

    it('returns true for same component type', () => {
      const Comp = () => document.createElement('div');
      const inst1 = createComponent(Comp);
      const inst2 = createComponent(Comp);
      expect(isSameNodeType(inst1, inst2)).toBe(true);
    });

    it('returns false for different component types', () => {
      const Comp1 = () => document.createElement('div');
      const Comp2 = () => document.createElement('span');
      const inst1 = createComponent(Comp1);
      const inst2 = createComponent(Comp2);
      expect(isSameNodeType(inst1, inst2)).toBe(false);
    });

    it('returns false for component vs DOM node', () => {
      const Comp = () => document.createElement('div');
      const inst = createComponent(Comp);
      const div = document.createElement('div');
      expect(isSameNodeType(inst, div)).toBe(false);
      expect(isSameNodeType(div, inst)).toBe(false);
    });

    it('returns true for comment nodes', () => {
      const comment1 = document.createComment('a');
      const comment2 = document.createComment('b');
      expect(isSameNodeType(comment1, comment2)).toBe(true);
    });
  });

  describe('validateKeys', () => {
    it('does not error for unique keys', () => {
      const root = createTestRoot();
      const child1 = document.createElement('div');
      const child2 = document.createElement('span');
      setNodeKey(child1, 'a');
      setNodeKey(child2, 'b');

      expect(() => validateKeys([child1, child2], root)).not.toThrow();
    });

    it('errors for duplicate keys', () => {
      const root = createTestRoot();
      const child1 = document.createElement('div');
      const child2 = document.createElement('span');
      setNodeKey(child1, 'same');
      setNodeKey(child2, 'same');

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      validateKeys([child1, child2], root);
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it('skips fallback keys in duplicate check', () => {
      const root = createTestRoot();
      const child1 = document.createElement('div');
      const child2 = document.createElement('span');
      // No keys set, will use fallback

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      validateKeys([child1, child2], root);
      expect(errorSpy).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it('handles empty children array', () => {
      const root = createTestRoot();
      expect(() => validateKeys([], root)).not.toThrow();
    });

    it('handles single child', () => {
      const root = createTestRoot();
      const child = document.createElement('div');
      setNodeKey(child, 'only');
      expect(() => validateKeys([child], root)).not.toThrow();
    });

    it('includes parent tag in error message', () => {
      const root = createTestRoot();
      root.id = 'test-root';
      const child1 = document.createElement('div');
      const child2 = document.createElement('span');
      setNodeKey(child1, 'dup');
      setNodeKey(child2, 'dup');

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      validateKeys([child1, child2], root);
      expect(errorSpy.mock.calls[0][0]).toContain('div');
      errorSpy.mockRestore();
    });
  });
});
