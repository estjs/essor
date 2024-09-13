import { describe, expect, it, vi } from 'vitest';
import { getKey, mapKeys, patchChildren } from '../src/patch';
import { ComponentNode } from '../src';

// Mock 浏览器 API 和相关函数
vi.mock('./utils', () => ({
  insertChild: vi.fn(),
  removeChild: vi.fn(),
  replaceChild: vi.fn(),
}));

vi.mock('./template', () => ({
  isJsxElement: vi.fn(),
}));

describe('patchChildren', () => {
  it('should clear parent when nextChildren is empty and childrenMap has elements', () => {
    const parent = document.createElement('div');
    const child = document.createElement('p');
    parent.appendChild(child);

    const childrenMap = new Map<string, Node>([['1', child]]);
    const nextChildren: Node[] = [];

    const result = patchChildren(parent, childrenMap, nextChildren, null);

    expect(parent.innerHTML).toBe('');
    expect(result.size).toBe(0);
  });

  it('should insert new children when parent has no existing children', () => {
    const parent = document.createElement('div');
    const newChild = document.createElement('span');
    const nextChildren = [newChild];

    const result = patchChildren(parent, new Map(), nextChildren, null);

    expect(result.size).toBe(1);
    expect(result.get('_$0$')).toBe(newChild);
  });

  it('should replace existing child with new one', () => {
    const parent = document.createElement('div');
    const oldChild = document.createElement('span');
    const newChild = document.createElement('div');
    parent.appendChild(oldChild);

    const childrenMap = new Map<string, Node>([['_$0$', oldChild]]);
    const nextChildren = [newChild];

    const result = patchChildren(parent, childrenMap, nextChildren, null);

    expect(result.size).toBe(1);
    expect(result.get('_$0$')).toBe(newChild);
  });
});

describe('mapKeys', () => {
  it('should generate map with keys based on index', () => {
    const childA = document.createElement('div');
    const childB = document.createElement('p');
    const children = [childA, childB];

    const result = mapKeys(children);

    expect(result.get('_$0$')).toBe(childA);
    expect(result.get('_$1$')).toBe(childB);
  });
});

describe('getKey', () => {
  it('should return index-based key if no jsx key is present', () => {
    const node = document.createElement('div');
    const key = getKey(node, 1);

    expect(key).toBe('_$1$');
  });

  it('should return jsx key if present', () => {
    //@ts-ignore
    const jsxElement = new ComponentNode('', {}, 123);

    const key = getKey(jsxElement, 1);

    expect(key).toBe('123');
  });
});
