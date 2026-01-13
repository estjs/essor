import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createComponent } from '../src/component';
import { setNodeKey } from '../src/key';
import {
  getFirstDOMNode,
  insertNode,
  isSameNode,
  normalizeNode,
  omitProps,
  removeNode,
  replaceNode,
  shallowCompare,
} from '../src/';
import { createTestRoot, resetEnvironment } from './test-utils';

describe('node-operations', () => {
  beforeEach(() => {
    resetEnvironment();
  });

  describe('insertNode', () => {
    it('inserts DOM nodes', () => {
      const root = createTestRoot();
      const node = document.createElement('div');
      insertNode(root, node);
      expect(root.contains(node)).toBe(true);
    });

    it('inserts node before reference node', () => {
      const root = createTestRoot();
      const first = document.createElement('div');
      const second = document.createElement('span');
      root.appendChild(second);

      insertNode(root, first, second);
      expect(root.firstChild).toBe(first);
      expect(root.lastChild).toBe(second);
    });

    it('mounts component nodes', () => {
      const root = createTestRoot();
      const Comp = () => document.createElement('p');
      const instance = createComponent(Comp);

      insertNode(root, instance);
      expect(root.querySelector('p')).toBeTruthy();
    });

    it('handles null parent gracefully', () => {
      const node = document.createElement('div');
      expect(() => insertNode(null as any, node)).not.toThrow();
    });

    it('handles null node gracefully', () => {
      const root = createTestRoot();
      expect(() => insertNode(root, null as any)).not.toThrow();
    });

    it('handles insertion errors gracefully', () => {
      const root = createTestRoot();
      const node = document.createElement('div');
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Create a scenario that might cause an error
      const invalidBefore = document.createElement('span');
      insertNode(root, node, invalidBefore);

      consoleSpy.mockRestore();
    });
  });

  describe('removeNode', () => {
    it('removes DOM nodes', () => {
      const root = createTestRoot();
      const node = document.createElement('div');
      root.appendChild(node);

      removeNode(node);
      expect(root.contains(node)).toBe(false);
    });

    it('destroys component nodes', async () => {
      const root = createTestRoot();
      const Comp = () => document.createElement('p');
      const instance = createComponent(Comp);
      instance.destroy = vi.fn(instance.destroy.bind(instance));

      insertNode(root, instance);
      await removeNode(instance);
      expect((instance.destroy as any).mock.calls.length).toBe(1);
    });

    it('handles null node gracefully', () => {
      expect(() => removeNode(null as any)).not.toThrow();
    });

    it('handles node without parent gracefully', () => {
      const node = document.createElement('div');
      expect(() => removeNode(node)).not.toThrow();
    });

    it('handles removal errors gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const node = document.createElement('div');
      removeNode(node);
      consoleSpy.mockRestore();
    });
  });

  describe('replaceNode', () => {
    it('replaces nodes without duplication', () => {
      const root = createTestRoot();
      const first = document.createElement('span');
      const second = document.createElement('span');
      first.textContent = 'a';
      second.textContent = 'b';

      insertNode(root, first);
      replaceNode(root, second, first);

      expect(root.children).toHaveLength(1);
      expect(root.children[0].textContent).toBe('b');
    });

    it('handles null old node gracefully', () => {
      const root = createTestRoot();
      const node = document.createElement('div');
      expect(() => replaceNode(root, null as any, node)).not.toThrow();
    });

    it('handles null new node gracefully', () => {
      const root = createTestRoot();
      const node = document.createElement('div');
      root.appendChild(node);
      expect(() => replaceNode(root, node, null as any)).not.toThrow();
    });

    it('handles same node gracefully', () => {
      const root = createTestRoot();
      const node = document.createElement('div');
      root.appendChild(node);

      replaceNode(root, node, node);
      expect(root.contains(node)).toBe(true);
    });

    it('handles node without parent gracefully', () => {
      const root = createTestRoot();
      const oldNode = document.createElement('div');
      const newNode = document.createElement('span');

      expect(() => replaceNode(root, oldNode, newNode)).not.toThrow();
    });

    it('handles replace errors gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const root = createTestRoot();
      const node = document.createElement('div');
      replaceNode(root, node, document.createElement('span'));
      consoleSpy.mockRestore();
    });
  });

  describe('normalizeNode', () => {
    it('normalizes primitive values into text nodes', () => {
      const text = normalizeNode('hello');
      expect(text).toBeInstanceOf(Text);
      expect((text as Text).textContent).toBe('hello');
    });

    it('normalizes null to empty text node', () => {
      const empty = normalizeNode(null);
      expect(empty).toBeInstanceOf(Text);
      expect(empty.textContent).toBe('');
    });

    it('normalizes undefined to empty text node', () => {
      const empty = normalizeNode(undefined);
      expect(empty).toBeInstanceOf(Text);
      expect(empty.textContent).toBe('');
    });

    it('normalizes numbers to text nodes', () => {
      const num = normalizeNode(42);
      expect(num).toBeInstanceOf(Text);
      expect(num.textContent).toBe('42');
    });

    it('normalizes booleans to text nodes', () => {
      const bool = normalizeNode(true);
      expect(bool).toBeInstanceOf(Text);
      expect(bool.textContent).toBe('true');
    });

    it('returns Node instances as-is', () => {
      const el = document.createElement('div');
      const result = normalizeNode(el);
      expect(result).toBe(el);
    });

    it('uses memoization cache for text nodes', () => {
      const text1 = normalizeNode('cached');
      const text2 = normalizeNode('cached');
      expect(text1.textContent).toBe(text2.textContent);
      expect(text1).not.toBe(text2); // Should be clones
    });

    it('handles cache size limit', () => {
      // Create many unique text nodes to exceed cache
      for (let i = 0; i < 150; i++) {
        normalizeNode(`unique-${i}`);
      }
      // Should still work without errors
      const result = normalizeNode('after-limit');
      expect(result).toBeInstanceOf(Text);
    });
  });
});

describe('omitProps', () => {
  it('should exclude specified properties from proxy', () => {
    const obj = { a: 1, b: 2, c: 3 };
    const result = omitProps(obj, ['b']);

    expect(result.a).toBe(1);
    expect(result.b).toBeUndefined();
    expect(result.c).toBe(3);
  });

  it('should filter excluded keys from ownKeys', () => {
    const obj = { a: 1, b: 2, c: 3 };
    const result = omitProps(obj, ['b']);

    const keys = Object.keys(result);
    expect(keys).toContain('a');
    expect(keys).toContain('c');
    expect(keys).not.toContain('b');
  });

  it('should return undefined for getOwnPropertyDescriptor on excluded keys', () => {
    const obj = { a: 1, b: 2 };
    const result = omitProps(obj, ['b']);

    const descriptor = Object.getOwnPropertyDescriptor(result, 'b');
    expect(descriptor).toBeUndefined();
  });

  it('should return false for "in" operator on excluded keys', () => {
    const obj = { a: 1, b: 2 };
    const result = omitProps(obj, ['b']);

    expect('a' in result).toBe(true);
    expect('b' in result).toBe(false);
  });

  it('should handle multiple excluded keys', () => {
    const obj = { a: 1, b: 2, c: 3, d: 4 };
    const result = omitProps(obj, ['b', 'd']);

    expect(result.a).toBe(1);
    expect(result.b).toBeUndefined();
    expect(result.c).toBe(3);
    expect(result.d).toBeUndefined();
  });
});

describe('getFirstDOMNode', () => {
  beforeEach(() => {
    resetEnvironment();
  });

  it('should return undefined for null node', () => {
    expect(getFirstDOMNode(null as any)).toBeUndefined();
  });

  it('should return undefined for undefined node', () => {
    expect(getFirstDOMNode(undefined as any)).toBeUndefined();
  });

  it('should return firstChild for component node', () => {
    const Comp = () => document.createElement('div');
    const instance = createComponent(Comp);
    const root = createTestRoot();
    instance.mount(root);

    const firstNode = getFirstDOMNode(instance);
    expect(firstNode).toBe(instance.firstChild);
  });

  it('should return undefined for primitive values', () => {
    expect(getFirstDOMNode('text' as any)).toBeUndefined();
    expect(getFirstDOMNode(123 as any)).toBeUndefined();
    expect(getFirstDOMNode(true as any)).toBeUndefined();
  });

  it('should return the node itself for DOM nodes', () => {
    const node = document.createElement('div');
    expect(getFirstDOMNode(node)).toBe(node);
  });
});

describe('isSameNode', () => {
  beforeEach(() => {
    resetEnvironment();
  });

  it('should return false for nodes with different keys', () => {
    const a = document.createElement('div');
    const b = document.createElement('div');
    setNodeKey(a, 'key1');
    setNodeKey(b, 'key2');

    expect(isSameNode(a, b)).toBe(false);
  });

  it('should return true for same component type', () => {
    const Comp = () => document.createElement('div');
    const instance1 = createComponent(Comp);
    const instance2 = createComponent(Comp);

    expect(isSameNode(instance1, instance2)).toBe(true);
  });

  it('should return false for different component types', () => {
    const Comp1 = () => document.createElement('div');
    const Comp2 = () => document.createElement('span');
    const instance1 = createComponent(Comp1);
    const instance2 = createComponent(Comp2);

    expect(isSameNode(instance1, instance2)).toBe(false);
  });

  it('should return false when one is component and other is not', () => {
    const Comp = () => document.createElement('div');
    const instance = createComponent(Comp);
    const node = document.createElement('div');

    expect(isSameNode(instance, node)).toBe(false);
  });

  it('should return true for same primitive values', () => {
    expect(isSameNode('text' as any, 'text' as any)).toBe(true);
    expect(isSameNode(123 as any, 123 as any)).toBe(true);
  });

  it('should return false for different primitive values', () => {
    expect(isSameNode('text1' as any, 'text2' as any)).toBe(false);
  });

  it('should return false for nodes with different nodeType', () => {
    const element = document.createElement('div');
    const text = document.createTextNode('text');

    expect(isSameNode(element, text)).toBe(false);
  });

  it('should return false for elements with different tagName', () => {
    const div = document.createElement('div');
    const span = document.createElement('span');

    expect(isSameNode(div, span)).toBe(false);
  });

  it('should return true for elements with same tagName', () => {
    const div1 = document.createElement('div');
    const div2 = document.createElement('div');

    expect(isSameNode(div1, div2)).toBe(true);
  });

  it('should return true for text nodes with same nodeType', () => {
    const text1 = document.createTextNode('a');
    const text2 = document.createTextNode('b');

    expect(isSameNode(text1, text2)).toBe(true);
  });
});

describe('shallowCompare', () => {
  it('should return true for same reference', () => {
    const obj = { a: 1 };
    expect(shallowCompare(obj, obj)).toBe(true);
  });

  it('should return false for null/undefined comparisons', () => {
    expect(shallowCompare(null, { a: 1 })).toBe(false);
    expect(shallowCompare({ a: 1 }, null)).toBe(false);
    expect(shallowCompare(undefined, { a: 1 })).toBe(false);
  });

  it('should return false for array vs object', () => {
    expect(shallowCompare([1, 2], { 0: 1, 1: 2 })).toBe(false);
  });

  it('should return true for objects with same properties', () => {
    const a = { x: 1, y: 2 };
    const b = { x: 1, y: 2 };
    expect(shallowCompare(a, b)).toBe(true);
  });

  it('should return false for objects with different values', () => {
    const a = { x: 1, y: 2 };
    const b = { x: 1, y: 3 };
    expect(shallowCompare(a, b)).toBe(false);
  });

  it('should return false when second object has extra keys', () => {
    const a = { x: 1 };
    const b = { x: 1, y: 2 };
    expect(shallowCompare(a, b)).toBe(false);
  });

  it('should return true for arrays with same values', () => {
    const a = [1, 2, 3];
    const b = [1, 2, 3];
    expect(shallowCompare(a, b)).toBe(true);
  });

  it('should return false for arrays with different values', () => {
    const a = [1, 2, 3];
    const b = [1, 2, 4];
    expect(shallowCompare(a, b)).toBe(false);
  });
});
