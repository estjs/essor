import { beforeEach, describe, expect, it } from 'vitest';
import { getKey, mapKeys, patch, patchChildren } from '../src/patch';
import { TemplateNode } from '../src/templateNode';
import { ComponentNode } from '../src/componentNode';
import { h } from '../src/jsxRenderer';

describe('patch', () => {
  beforeEach(() => {
    // Clear any side effects between tests if necessary
  });

  describe('patchChildren', () => {
    it('should clear all children when nextChildren is empty', () => {
      const parent = document.createElement('div');
      const child1 = h('span');
      const child2 = h('p');
      child1.mount(parent);
      child2.mount(parent);
      const childrenMap = new Map([
        ['key1', child1],
        ['key2', child2],
      ]);
      const nextChildren: any[] = [];
      const before = null;

      const result = patchChildren(parent, childrenMap, nextChildren, before);

      expect(result.size).toBe(0);
      expect(parent.childNodes.length).toBe(0);
    });

    it('should patch and insert new children', () => {
      const parent = document.createElement('div');
      const childrenMap = new Map([['key1', h('span')]]);
      const nextChildren = [h('p'), h('div')];
      const before = null;

      const result = patchChildren(parent, childrenMap, nextChildren, before);

      expect(result.size).toBe(2);
      expect(parent.childNodes.length).toBe(2);
      expect(parent.childNodes[0].nodeName).toBe('P');
      expect(parent.childNodes[1].nodeName).toBe('DIV');
    });

    it('should handle replacing children', () => {
      const parent = document.createElement('div');
      const span = h('span');
      const p = h('p');
      span.mount(parent);
      p.mount(parent);
      const childrenMap = new Map([
        ['key1', span],
        ['key2', p],
      ]);
      const div = h('div');
      const a = h('a');
      const nextChildren = [div, a];
      const before = null;

      const result = patchChildren(parent, childrenMap, nextChildren, before);

      expect(result.size).toBe(2);
      expect(parent.childNodes.length).toBe(2);
      expect(parent.childNodes[0].nodeName).toBe('DIV');
      expect(parent.childNodes[1].nodeName).toBe('A');
    });
  });

  describe('patch', () => {
    it('should return the same node if node and next are identical', () => {
      const parent = document.createElement('div');
      const node = h('span');
      const next = node;

      const result = patch(parent, node, next);

      expect(result).toBe(node);
    });

    it('should inherit node if both are JSX elements with the same template', () => {
      const parent = document.createElement('div');
      const template = document.createElement('template');
      const node = new TemplateNode(template);
      const next = new TemplateNode(template);

      const result = patch(parent, node, next);

      expect(result).toBe(next);
    });

    it('should update text content if both are Text nodes', () => {
      const parent = document.createElement('div');
      const node = h('div', { children: 'old' });
      const next = h('div', { children: 'new' });
      node.mount(parent);

      const result = patch(parent, node, next);

      expect(result).toBe(next);
      expect(parent.textContent).toBe('new');
    });

    it('should replace child if nodes are different', () => {
      const parent = document.createElement('div');
      const node = h('span');
      node.mount(parent);
      const next = h('div');

      const result = patch(parent, node, next);

      expect(result).toBe(next);
      expect(parent.childNodes[0].nodeName).toBe('DIV');
    });
  });

  describe('mapKeys', () => {
    it('should map children to a Map with keys', () => {
      const children = [document.createElement('div'), document.createElement('span')];

      const result = mapKeys(children);

      expect(result.size).toBe(2);
      expect(result.get('_$0$')).toBe(children[0]);
      expect(result.get('_$1$')).toBe(children[1]);
    });
  });

  describe('getKey', () => {
    it('should return JSX key if available', () => {
      const node = new ComponentNode(() => {}, { key: 'testKey' });

      const result = getKey(node, 0);

      expect(result).toBe('testKey');
    });

    it('should return index-based key if not a JSX element', () => {
      const node = document.createElement('div');

      const result = getKey(node, 5);

      expect(result).toBe('_$5$');
    });
  });
});
