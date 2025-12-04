import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createComponent } from '../src/component';
import { insertNode, normalizeNode, removeNode, replaceNode } from '../src/utils';
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
