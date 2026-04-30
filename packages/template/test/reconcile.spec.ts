import { beforeEach, describe, expect, it } from 'vitest';
import { getSequence, reconcileArrays } from '../src/reconcile';
import { resetEnvironment } from './test-utils';

function createNode(label: string): HTMLSpanElement {
  const node = document.createElement('span');
  node.textContent = label;
  return node;
}

function textContent(parent: Element): string[] {
  return Array.from(parent.childNodes).map((node) => node.textContent ?? '');
}

describe('reconcile arrays', () => {
  beforeEach(() => {
    resetEnvironment();
  });

  it('inserts new nodes before a valid anchor when old nodes are empty', () => {
    const parent = document.createElement('div');
    const anchor = createNode('anchor');
    parent.appendChild(anchor);

    const next = [createNode('a'), createNode('b')];

    const result = reconcileArrays(parent, [], next, anchor);

    expect(result).toBe(next);
    expect(textContent(parent)).toEqual(['a', 'b', 'anchor']);
  });

  it('removes all old nodes when the next list is empty', () => {
    const parent = document.createElement('div');
    const oldNodes = [createNode('a'), createNode('b')];
    oldNodes.forEach((node) => parent.appendChild(node));

    const result = reconcileArrays(parent, oldNodes, []);

    expect(result).toEqual([]);
    expect(parent.childNodes).toHaveLength(0);
  });

  it('handles prepend, append, and reorder cases', () => {
    const parent = document.createElement('div');
    const a = createNode('a');
    const b = createNode('b');
    const c = createNode('c');
    parent.append(a, b, c);

    const d = createNode('d');
    const result = reconcileArrays(parent, [a, b, c], [c, a, b, d]);

    expect(result).toEqual([c, a, b, d]);
    expect(textContent(parent)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('removes extra stale nodes after matching all remaining next nodes', () => {
    const parent = document.createElement('div');
    const a = createNode('a');
    const b = createNode('b');
    const c = createNode('c');
    const d = createNode('d');
    parent.append(a, b, c, d);

    const result = reconcileArrays(parent, [a, b, c, d], [a, c]);

    expect(result).toEqual([a, c]);
    expect(textContent(parent)).toEqual(['a', 'c']);
  });

  it('falls back to appending when the anchor does not belong to the parent', () => {
    const parent = document.createElement('div');
    const strayAnchor = document.createElement('em');
    parent.appendChild(createNode('existing'));

    reconcileArrays(parent, [], [createNode('x'), createNode('y')], strayAnchor);

    expect(textContent(parent)).toEqual(['existing', 'x', 'y']);
  });

  it('computes stable LIS indices for sparse arrays with zero placeholders', () => {
    expect(getSequence(Int32Array.from([0, 2, 0, 3]))).toEqual([0, 1, 3]);
  });

  it('computes LIS indices when a later value replaces the current tail', () => {
    expect(getSequence(Int32Array.from([2, 5, 3]))).toEqual([0, 2]);
  });
});
