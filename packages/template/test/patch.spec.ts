import { beforeEach, describe, expect, it } from 'vitest';
import { createComponent } from '../src/component';
import { getSequence, patch, patchChildren, transferKey } from '../src/patch';
import { getNodeKey, setNodeKey } from '../src/key';
import { createTestRoot, resetEnvironment } from './test-utils';

describe('patch', () => {
  beforeEach(() => {
    resetEnvironment();
  });

  describe('transferKey', () => {
    it('transfers key from old node to new node', () => {
      const oldNode = document.createElement('div');
      const newNode = document.createElement('div');
      setNodeKey(oldNode, 'test-key');

      transferKey(oldNode, newNode);

      expect(getNodeKey(newNode)).toBe('test-key');
    });

    it('does not transfer key if new node already has one', () => {
      const oldNode = document.createElement('div');
      const newNode = document.createElement('div');
      setNodeKey(oldNode, 'old-key');
      setNodeKey(newNode, 'new-key');

      transferKey(oldNode, newNode);

      expect(getNodeKey(newNode)).toBe('new-key');
    });

    it('does nothing if old node has no key', () => {
      const oldNode = document.createElement('div');
      const newNode = document.createElement('div');

      transferKey(oldNode, newNode);

      expect(getNodeKey(newNode)).toBeUndefined();
    });

    it('skips component nodes', () => {
      const oldNode = document.createElement('div');
      const Comp = () => document.createElement('span');
      const componentNode = createComponent(Comp);
      setNodeKey(oldNode, 'test-key');

      // Should not throw when component is involved
      expect(() => transferKey(oldNode, componentNode)).not.toThrow();
      expect(() => transferKey(componentNode, oldNode)).not.toThrow();
    });
  });

  describe('patch function', () => {
    it('returns old node when same reference', () => {
      const root = createTestRoot();
      const node = document.createElement('div');
      root.appendChild(node);

      const result = patch(root, node, node);

      expect(result).toBe(node);
    });

    it('returns old node for equal nodes', () => {
      const root = createTestRoot();
      const oldNode = document.createElement('div');
      oldNode.id = 'test';
      const newNode = document.createElement('div');
      newNode.id = 'test';
      root.appendChild(oldNode);

      const result = patch(root, oldNode, newNode);

      expect(result).toBe(oldNode);
    });

    it('patches attributes on same tag elements', () => {
      const root = createTestRoot();
      const oldNode = document.createElement('div');
      oldNode.id = 'old-id';
      oldNode.className = 'old-class';
      const newNode = document.createElement('div');
      newNode.id = 'new-id';
      newNode.dataset.test = 'value';
      root.appendChild(oldNode);

      const result = patch(root, oldNode, newNode);

      expect(result).toBe(oldNode);
      expect(oldNode.id).toBe('new-id');
      expect(oldNode.hasAttribute('class')).toBe(false);
      expect(oldNode.dataset.test).toBe('value');
    });

    it('removes attributes not in new node', () => {
      const root = createTestRoot();
      const oldNode = document.createElement('div');
      oldNode.dataset.remove = 'yes';
      oldNode.dataset.keep = 'keep';
      const newNode = document.createElement('div');
      newNode.dataset.keep = 'keep';
      root.appendChild(oldNode);

      patch(root, oldNode, newNode);

      expect(Object.hasOwn(oldNode.dataset, 'remove')).toBe(false);
      expect(oldNode.dataset.keep).toBe('keep');
    });

    it('patches text node content', () => {
      const root = createTestRoot();
      const oldText = document.createTextNode('old text');
      const newText = document.createTextNode('new text');
      root.appendChild(oldText);

      const result = patch(root, oldText, newText);

      expect(result).toBe(oldText);
      expect(oldText.textContent).toBe('new text');
    });

    it('returns old text node when content is same', () => {
      const root = createTestRoot();
      const oldText = document.createTextNode('same');
      const newText = document.createTextNode('same');
      root.appendChild(oldText);

      const result = patch(root, oldText, newText);

      expect(result).toBe(oldText);
    });

    it('replaces nodes with different tags', () => {
      const root = createTestRoot();
      const oldNode = document.createElement('div');
      const newNode = document.createElement('span');
      root.appendChild(oldNode);

      const result = patch(root, oldNode, newNode);

      expect(result).toBe(newNode);
      expect(root.contains(newNode)).toBe(true);
      expect(root.contains(oldNode)).toBe(false);
    });

    it('replaces text node with element', () => {
      const root = createTestRoot();
      const oldText = document.createTextNode('text');
      const newNode = document.createElement('div');
      root.appendChild(oldText);

      const result = patch(root, oldText, newNode);

      expect(result).toBe(newNode);
      expect(root.contains(newNode)).toBe(true);
    });

    it('replaces element with text node', () => {
      const root = createTestRoot();
      const oldNode = document.createElement('div');
      const newText = document.createTextNode('text');
      root.appendChild(oldNode);

      const result = patch(root, oldNode, newText);

      expect(result).toBe(newText);
      expect(root.contains(newText)).toBe(true);
    });

    it('handles component update with same type', () => {
      const root = createTestRoot();
      const Comp = () => document.createElement('span');
      const oldInstance = createComponent(Comp);
      const newInstance = createComponent(Comp);

      oldInstance.mount(root);

      const result = patch(root, oldInstance, newInstance);

      // Component update should return the new instance after update
      expect(result).toBeDefined();
    });

    it('replaces component with different type', () => {
      const root = createTestRoot();
      const Comp1 = () => document.createElement('div');
      const Comp2 = () => document.createElement('span');
      const oldInstance = createComponent(Comp1);
      const newInstance = createComponent(Comp2);

      oldInstance.mount(root);

      const result = patch(root, oldInstance, newInstance);

      expect(result).toBe(newInstance);
    });
  });

  describe('patchChildren', () => {
    it('returns empty array when both old and new are empty', () => {
      const root = createTestRoot();

      const result = patchChildren(root, [], []);

      expect(result).toEqual([]);
    });

    it('mounts all new children when old is empty', () => {
      const root = createTestRoot();
      const child1 = document.createElement('div');
      const child2 = document.createElement('span');

      patchChildren(root, [], [child1, child2]);

      expect(root.children).toHaveLength(2);
      expect(root.children[0]).toBe(child1);
      expect(root.children[1]).toBe(child2);
    });

    it('mounts with anchor node', () => {
      const root = createTestRoot();
      const anchor = document.createElement('div');
      root.appendChild(anchor);
      const newChild = document.createElement('span');

      patchChildren(root, [], [newChild], anchor);

      expect(root.firstChild).toBe(newChild);
      expect(root.lastChild).toBe(anchor);
    });

    it('removes all old children when new is empty', () => {
      const root = createTestRoot();
      const child1 = document.createElement('div');
      const child2 = document.createElement('span');
      root.appendChild(child1);
      root.appendChild(child2);

      patchChildren(root, [child1, child2], []);

      expect(root.children).toHaveLength(0);
    });

    it('patches single child in place', () => {
      const root = createTestRoot();
      const oldChild = document.createElement('div');
      oldChild.id = 'old';
      const newChild = document.createElement('div');
      newChild.id = 'new';
      root.appendChild(oldChild);

      const result = patchChildren(root, [oldChild], [newChild]);

      expect(result[0]).toBe(oldChild);
      expect(oldChild.id).toBe('new');
    });

    it('replaces single child when types differ', () => {
      const root = createTestRoot();
      const oldChild = document.createElement('div');
      const newChild = document.createElement('span');
      root.appendChild(oldChild);

      const result = patchChildren(root, [oldChild], [newChild]);

      expect(result[0]).toBe(newChild);
      expect(root.contains(oldChild)).toBe(false);
      expect(root.contains(newChild)).toBe(true);
    });

    it('patches two children in same order', () => {
      const root = createTestRoot();
      const old1 = document.createElement('div');
      old1.id = 'a';
      const old2 = document.createElement('div');
      old2.id = 'b';
      const new1 = document.createElement('div');
      new1.id = 'a-updated';
      const new2 = document.createElement('div');
      new2.id = 'b-updated';
      root.appendChild(old1);
      root.appendChild(old2);

      const result = patchChildren(root, [old1, old2], [new1, new2]);

      expect(result[0]).toBe(old1);
      expect(result[1]).toBe(old2);
      expect(old1.id).toBe('a-updated');
      expect(old2.id).toBe('b-updated');
    });

    it('swaps two children', () => {
      const root = createTestRoot();
      const old1 = document.createElement('div');
      const old2 = document.createElement('span');
      root.appendChild(old1);
      root.appendChild(old2);
      setNodeKey(old1, 'a');
      setNodeKey(old2, 'b');

      const new1 = document.createElement('span');
      setNodeKey(new1, 'b');
      const new2 = document.createElement('div');
      setNodeKey(new2, 'a');

      const result = patchChildren(root, [old1, old2], [new1, new2]);

      expect(result[0]).toBe(old2);
      expect(result[1]).toBe(old1);
      // Verify DOM order
      expect(root.children[0]).toBe(old2);
      expect(root.children[1]).toBe(old1);
    });

    it('handles adding children to existing list', () => {
      const root = createTestRoot();
      const existing = document.createElement('div');
      setNodeKey(existing, 'a');
      root.appendChild(existing);

      const keep = document.createElement('div');
      setNodeKey(keep, 'a');
      const add = document.createElement('span');
      setNodeKey(add, 'b');

      patchChildren(root, [existing], [keep, add]);

      expect(root.children).toHaveLength(2);
    });

    it('handles removing children from list', () => {
      const root = createTestRoot();
      const keep = document.createElement('div');
      setNodeKey(keep, 'a');
      const remove = document.createElement('span');
      setNodeKey(remove, 'b');
      root.appendChild(keep);
      root.appendChild(remove);

      const keepNew = document.createElement('div');
      setNodeKey(keepNew, 'a');

      patchChildren(root, [keep, remove], [keepNew]);

      expect(root.children).toHaveLength(1);
      expect(root.children[0]).toBe(keep);
    });

    it('handles reordering multiple children', () => {
      const root = createTestRoot();
      const items: Element[] = [];
      for (let i = 0; i < 5; i++) {
        const el = document.createElement('div');
        setNodeKey(el, `key-${i}`);
        el.textContent = `item-${i}`;
        items.push(el);
        root.appendChild(el);
      }

      // Reverse order
      const reversed = items.slice().reverse();
      const newItems = reversed.map(item => {
        const el = document.createElement('div');
        setNodeKey(el, getNodeKey(item));
        return el;
      });

      patchChildren(root, items, newItems);

      // Verify DOM order matches reversed order
      for (let i = 0; i < 5; i++) {
        expect(root.children[i]).toBe(items[4 - i]);
      }
    });

    it('handles mixed add/remove/reorder', () => {
      const root = createTestRoot();
      const a = document.createElement('div');
      setNodeKey(a, 'a');
      const b = document.createElement('div');
      setNodeKey(b, 'b');
      const c = document.createElement('div');
      setNodeKey(c, 'c');
      root.appendChild(a);
      root.appendChild(b);
      root.appendChild(c);

      // New order: c, d (new), a (b removed)
      const cNew = document.createElement('div');
      setNodeKey(cNew, 'c');
      const d = document.createElement('div');
      setNodeKey(d, 'd');
      const aNew = document.createElement('div');
      setNodeKey(aNew, 'a');

      const result = patchChildren(root, [a, b, c], [cNew, d, aNew]);

      expect(result).toHaveLength(3);
      expect(root.children).toHaveLength(3);
      expect(getNodeKey(root.children[0])).toBe('c');
      expect(getNodeKey(root.children[1])).toBe('d');
      expect(getNodeKey(root.children[2])).toBe('a');
    });
  });

  describe('getSequence (LIS)', () => {
    it('returns empty array for empty input', () => {
      expect(getSequence([])).toEqual([]);
    });

    it('returns single element for single non-zero input', () => {
      expect(getSequence([5])).toEqual([0]);
    });

    it('returns empty array for single zero input', () => {
      expect(getSequence([0])).toEqual([]);
    });

    it('handles already sorted array', () => {
      const result = getSequence([1, 2, 3, 4, 5]);
      expect(result).toEqual([0, 1, 2, 3, 4]);
    });

    it('handles reverse sorted array', () => {
      const result = getSequence([5, 4, 3, 2, 1]);
      // LIS of reversed array is length 1
      expect(result).toHaveLength(1);
    });

    it('handles mixed sequence', () => {
      // [2, 1, 5, 3, 6, 4, 8, 9, 7]
      // LIS could be [2, 3, 4, 8, 9] -> indices [0, 3, 5, 6, 7]
      // or [1, 3, 4, 8, 9] -> indices [1, 3, 5, 6, 7]
      // or [2, 5, 6, 8, 9] -> indices [0, 2, 4, 6, 7]
      const result = getSequence([2, 1, 5, 3, 6, 4, 8, 9, 7]);
      expect(result.length).toBeGreaterThanOrEqual(5);
    });

    it('handles zeros (unmapped elements)', () => {
      const result = getSequence([0, 2, 0, 3, 0, 4]);
      // Should only consider non-zero elements: 2, 3, 4 at indices 1, 3, 5
      expect(result).toEqual([1, 3, 5]);
    });

    it('handles Int32Array input', () => {
      const arr = new Int32Array([1, 3, 2, 4]);
      const result = getSequence(arr);
      // LIS: [1, 2, 4] at indices [0, 2, 3] or [1, 3, 4] at [0, 1, 3]
      expect(result.length).toBe(3);
    });

    it('handles duplicate values', () => {
      const result = getSequence([1, 2, 2, 3]);
      // LIS should be of length 3
      expect(result.length).toBe(3);
    });

    it('handles large array', () => {
      const arr: number[] = [];
      for (let i = 0; i < 100; i++) {
        arr.push(Math.floor(Math.random() * 100) + 1);
      }
      const result = getSequence(arr);

      // Verify it's increasing
      for (let i = 1; i < result.length; i++) {
        expect(arr[result[i]]).toBeGreaterThan(arr[result[i - 1]]);
      }
    });

    it('handles all zeros', () => {
      expect(getSequence([0, 0, 0])).toEqual([]);
    });

    it('handles single non-zero among zeros', () => {
      expect(getSequence([0, 5, 0])).toEqual([1]);
    });
  });

  describe('edge cases', () => {
    it('handles patching with null-like children in array', () => {
      const root = createTestRoot();
      const child1 = document.createElement('div');
      const child2 = document.createElement('span');
      root.appendChild(child1);
      root.appendChild(child2);

      const newChildren = [child1, child2];

      // Should not throw
      expect(() => patchChildren(root, [child1, child2], newChildren)).not.toThrow();
    });

    it('handles component and DOM mixed children', () => {
      const root = createTestRoot();
      const domNode = document.createElement('div');
      const Comp = () => document.createElement('span');
      const compInstance = createComponent(Comp);

      root.appendChild(domNode);
      compInstance.mount(root);

      const newDom = document.createElement('div');
      const newComp = createComponent(Comp);

      expect(() => patchChildren(root, [domNode, compInstance], [newDom, newComp])).not.toThrow();
    });

    it('preserves parent-child relationship after patch', () => {
      const root = createTestRoot();
      const child = document.createElement('div');
      const grandChild = document.createElement('span');
      child.appendChild(grandChild);
      root.appendChild(child);

      const newChild = document.createElement('div');
      newChild.id = 'updated';

      patch(root, child, newChild);

      expect(child.contains(grandChild)).toBe(true);
      expect(root.contains(child)).toBe(true);
    });

    it('handles rapid consecutive patches', () => {
      const root = createTestRoot();
      const items: Element[] = [];

      // Create initial items
      for (let i = 0; i < 10; i++) {
        const el = document.createElement('div');
        setNodeKey(el, `key-${i}`);
        items.push(el);
      }

      patchChildren(root, [], items);

      // Multiple rapid updates
      for (let round = 0; round < 5; round++) {
        const shuffled = items.slice().sort(() => Math.random() - 0.5);
        const newItems = shuffled.map(item => {
          const el = document.createElement('div');
          setNodeKey(el, getNodeKey(item));
          return el;
        });
        patchChildren(root, items, newItems);
      }

      expect(root.children).toHaveLength(10);
    });

    it('handles empty text node patching', () => {
      const root = createTestRoot();
      const oldText = document.createTextNode('');
      const newText = document.createTextNode('content');
      root.appendChild(oldText);

      patch(root, oldText, newText);

      expect(oldText.textContent).toBe('content');
    });

    it('handles attribute with special characters', () => {
      const root = createTestRoot();
      const oldNode = document.createElement('div');
      const newNode = document.createElement('div');
      newNode.dataset.json = '{"key":"value"}';
      newNode.dataset.html = '<script>alert("xss")</script>';
      root.appendChild(oldNode);

      patch(root, oldNode, newNode);

      expect(oldNode.dataset.json).toBe('{"key":"value"}');
      expect(oldNode.dataset.html).toBe('<script>alert("xss")</script>');
    });
  });
  describe(' LIS algorithm correctness', () => {
    /**
     * Helper function to verify that the returned indices form a valid increasing subsequence
     */
    function isValidIncreasingSubsequence(arr: number[], indices: number[]): boolean {
      if (indices.length === 0) return true;

      // Check indices are in bounds and in order
      for (let i = 0; i < indices.length; i++) {
        if (indices[i] < 0 || indices[i] >= arr.length) {
          return false;
        }
        if (i > 0 && indices[i] <= indices[i - 1]) {
          return false;
        }
      }

      // Check values form an increasing sequence (and skip zeros)
      for (let i = 0; i < indices.length; i++) {
        const value = arr[indices[i]];
        if (value === 0) {
          return false; // Should not include zero values
        }
        if (i > 0 && arr[indices[i]] <= arr[indices[i - 1]]) {
          return false;
        }
      }

      return true;
    }

    /**
     * Helper function to compute the length of the longest increasing subsequence
     * using a naive O(n^2) algorithm for verification
     */
    function naiveLISLength(arr: number[]): number {
      const nonZeroIndices: number[] = [];
      for (const [i, element] of arr.entries()) {
        if (element !== 0) {
          nonZeroIndices.push(i);
        }
      }

      if (nonZeroIndices.length === 0) return 0;

      const dp: number[] = new Array(nonZeroIndices.length).fill(1);

      for (let i = 1; i < nonZeroIndices.length; i++) {
        for (let j = 0; j < i; j++) {
          if (arr[nonZeroIndices[j]] < arr[nonZeroIndices[i]]) {
            dp[i] = Math.max(dp[i], dp[j] + 1);
          }
        }
      }

      return Math.max(...dp);
    }

    it('should return valid increasing subsequence for random arrays', () => {
      // Test with various array patterns
      const testArrays = [
        [5, 2, 8, 6, 3, 6, 9, 7],
        [10, 9, 2, 5, 3, 7, 101, 18],
        [0, 1, 0, 3, 0, 2, 3],
        [1, 3, 6, 7, 9, 4, 10, 5, 6],
        [5, 4, 3, 2, 1],
        [1, 2, 3, 4, 5],
        [],
        [42],
        [0, 0, 0],
        [1, 1, 1, 1],
      ];

      testArrays.forEach(arr => {
        const result = getSequence(arr);

        // Property 1: Result should be a valid increasing subsequence
        expect(isValidIncreasingSubsequence(arr, result)).toBe(true);

        // Property 2: Result length should match the optimal LIS length
        const expectedLength = naiveLISLength(arr);
        expect(result.length).toBe(expectedLength);
      });
    });

    it('should handle arrays with Int32Array input', () => {
      const testArrays = [
        [5, 2, 8, 6, 3, 6, 9, 7],
        [10, 9, 2, 5, 3, 7, 101, 18],
        [1, 3, 6, 7, 9, 4, 10, 5, 6],
        [],
        [42],
      ];

      testArrays.forEach(arr => {
        const int32Arr = new Int32Array(arr);
        const result = getSequence(int32Arr);

        // Should produce same result as regular array
        const regularResult = getSequence(arr);
        expect(result).toEqual(regularResult);

        // Should still be valid
        expect(isValidIncreasingSubsequence(arr, result)).toBe(true);
      });
    });

    it('should correctly ignore zero values (unmapped elements)', () => {
      const testArrays = [
        [0, 2, 0, 3, 0, 4],
        [1, 0, 2, 0, 3],
        [0, 0, 1, 0, 2, 0],
        [0, 5, 0, 3, 0, 7, 0],
        [0, 0, 0],
      ];

      testArrays.forEach(arr => {
        const result = getSequence(arr);

        // No index in result should point to a zero value
        for (const idx of result) {
          expect(arr[idx]).not.toBe(0);
        }

        // Should still be valid increasing subsequence
        expect(isValidIncreasingSubsequence(arr, result)).toBe(true);
      });
    });

    it('should handle edge case: empty array', () => {
      const result = getSequence([]);
      expect(result).toEqual([]);
    });

    it('should handle edge case: single element arrays', () => {
      const testCases = [
        { value: 0, expected: [] },
        { value: 1, expected: [0] },
        { value: 42, expected: [0] },
        { value: 100, expected: [0] },
      ];

      testCases.forEach(({ value, expected }) => {
        const result = getSequence([value]);
        expect(result).toEqual(expected);
      });
    });

    it('should handle arrays with all zeros', () => {
      const testArrays = [[0], [0, 0], [0, 0, 0], [0, 0, 0, 0, 0], new Array(10).fill(0)];

      testArrays.forEach(arr => {
        const result = getSequence(arr);
        // All zeros should result in empty sequence
        expect(result).toEqual([]);
      });
    });

    it('should handle already sorted arrays', () => {
      const testArrays = [[1, 2, 3, 4, 5], [1, 3, 5, 7, 9], [10, 20, 30, 40], [1], [1, 2], []];

      testArrays.forEach(arr => {
        const result = getSequence(arr);

        // For strictly increasing array, LIS should be the entire array
        expect(result.length).toBe(arr.length);

        // Indices should be [0, 1, 2, ..., n-1]
        const expectedIndices = Array.from({ length: arr.length }, (_, i) => i);
        expect(result).toEqual(expectedIndices);
      });
    });

    it('should handle reverse sorted arrays', () => {
      const testArrays = [
        [5, 4, 3, 2, 1],
        [10, 9, 8, 7, 6, 5],
        [100, 50, 25, 10],
        [3, 2, 1],
        [2, 1],
      ];

      testArrays.forEach(arr => {
        const result = getSequence(arr);

        // For strictly decreasing array, LIS length should be 1
        expect(result.length).toBe(1);

        // Should be a valid subsequence
        expect(isValidIncreasingSubsequence(arr, result)).toBe(true);
      });
    });

    it('should handle arrays with duplicate values', () => {
      const testArrays = [
        [1, 2, 2, 3],
        [5, 5, 5, 5],
        [1, 1, 2, 2, 3, 3],
        [10, 5, 10, 5, 10],
        [1, 2, 1, 2, 1, 2],
      ];

      testArrays.forEach(arr => {
        const result = getSequence(arr);

        // Should be valid increasing subsequence (strictly increasing)
        expect(isValidIncreasingSubsequence(arr, result)).toBe(true);

        // Verify length matches optimal
        const expectedLength = naiveLISLength(arr);
        expect(result.length).toBe(expectedLength);
      });
    });

    it('should handle mixed patterns with zeros', () => {
      const testCases = [
        {
          increasing: [1, 2, 3],
          zeros: [0, 0],
          random: [5, 2, 8],
        },
        {
          increasing: [10, 20, 30],
          zeros: [0],
          random: [15, 25],
        },
        {
          increasing: [1, 3, 5],
          zeros: [0, 0, 0],
          random: [2, 4, 6],
        },
      ];

      testCases.forEach(({ increasing, zeros, random }) => {
        // Interleave the arrays
        const arr = [...increasing, ...zeros, ...random];
        const result = getSequence(arr);

        // Should be valid
        expect(isValidIncreasingSubsequence(arr, result)).toBe(true);

        // Should not include any zeros
        for (const idx of result) {
          expect(arr[idx]).not.toBe(0);
        }
      });
    });

    it('should be deterministic for the same input', () => {
      const testArrays = [
        [5, 2, 8, 6, 3, 6, 9, 7],
        [10, 9, 2, 5, 3, 7, 101, 18],
        [1, 3, 6, 7, 9, 4, 10, 5, 6],
        [0, 1, 0, 3, 0, 2, 3],
      ];

      testArrays.forEach(arr => {
        const result1 = getSequence(arr);
        const result2 = getSequence(arr);

        // Same input should produce same output
        expect(result1).toEqual(result2);
      });
    });

    it('should handle large arrays efficiently', () => {
      // Generate some larger test arrays
      const testArrays = [
        Array.from({ length: 100 }, (_, i) => i % 50),
        Array.from({ length: 150 }, (_, i) => 150 - i),
        Array.from({ length: 200 }, (_, i) => (i * 7) % 100),
      ];

      testArrays.forEach(arr => {
        const startTime = performance.now();
        const result = getSequence(arr);
        const endTime = performance.now();

        // Should complete in reasonable time (< 100ms for arrays up to 200 elements)
        expect(endTime - startTime).toBeLessThan(100);

        // Should still be valid
        expect(isValidIncreasingSubsequence(arr, result)).toBe(true);
      });
    });
  });
});
