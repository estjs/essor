import { beforeEach, describe, expect, it } from 'vitest';
import { createComponent } from '../src/component';
import {
  child,
  insert,
  insertNode,
  isSameNode,
  next,
  normalizeNode,
  nthChild,
  removeNode,
  replaceNode,
} from '../src/dom';
import {
  cleanupContext,
  createContext,
  createTestRoot,
  popContextStack,
  pushContextStack,
  resetEnvironment,
} from './test-utils';

describe('dom helpers', () => {
  beforeEach(() => {
    resetEnvironment();
  });

  it('removes native nodes from their parent', () => {
    const parent = document.createElement('div');
    const child = document.createElement('span');
    parent.appendChild(child);

    removeNode(child);

    expect(parent.childNodes).toHaveLength(0);
  });

  it('destroys component nodes when removing them', () => {
    const parent = document.createElement('div');
    const instance = createComponent(() => {
      const node = document.createElement('span');
      node.textContent = 'component';
      return node;
    });

    instance.mount(parent);
    expect(parent.textContent).toBe('component');

    removeNode(instance);

    expect(parent.textContent).toBe('');
    expect(instance.renderedNodes).toHaveLength(0);
  });

  it('inserts components before anchors and replaces old nodes', () => {
    const parent = document.createElement('div');
    const anchor = document.createElement('p');
    anchor.textContent = 'anchor';
    parent.appendChild(anchor);

    const instance = createComponent(() => {
      const node = document.createElement('span');
      node.textContent = 'component';
      return node;
    });

    insertNode(parent, instance, anchor);
    expect(parent.innerHTML).toBe('<span>component</span><p>anchor</p>');

    const replacement = document.createElement('strong');
    replacement.textContent = 'replacement';
    replaceNode(parent, replacement, instance);

    expect(parent.innerHTML).toBe('<strong>replacement</strong><p>anchor</p>');
  });

  it('compares keyed elements, keyed components, and primitives correctly', () => {
    const elA = document.createElement('div');
    const elB = document.createElement('div');
    const elC = document.createElement('div');
    elA.setAttribute('key', 'a');
    elB.setAttribute('key', 'a');
    elC.setAttribute('key', 'b');

    const Comp = () => document.createElement('div');
    const OtherComp = () => document.createElement('div');
    const compA = createComponent(Comp, { key: 'row' });
    const compB = createComponent(Comp, { key: 'row' });
    const compC = createComponent(OtherComp, { key: 'row' });

    expect(isSameNode(elA, elB)).toBe(true);
    expect(isSameNode(elA, elC)).toBe(false);
    expect(isSameNode(compA, compB)).toBe(true);
    expect(isSameNode(compA, compC)).toBe(false);
    expect(isSameNode('text', 'text')).toBe(true);
    expect(isSameNode('text', 'other')).toBe(false);
  });

  it('normalizes primitives into text nodes and preserves existing nodes', () => {
    const existing = document.createElement('button');
    const fromString = normalizeNode('hello');
    const fromFalsy = normalizeNode(false);

    expect(normalizeNode(existing)).toBe(existing);
    expect(fromString.nodeType).toBe(Node.TEXT_NODE);
    expect(fromString.textContent).toBe('hello');
    expect(fromFalsy.nodeType).toBe(Node.TEXT_NODE);
    expect(fromFalsy.textContent).toBe('');
  });

  describe('tree traversal', () => {
    it('child returns first child or null', () => {
      const node = document.createElement('div');
      expect(child(null)).toBeNull();
      expect(child(node)).toBeNull();
      const first = document.createElement('span');
      node.appendChild(first);
      expect(child(node)).toBe(first);
    });

    it('next returns sibling correctly', () => {
      expect(next(null)).toBeNull();
      const parent = document.createElement('div');
      const n1 = document.createElement('span');
      const n2 = document.createElement('a');
      const n3 = document.createElement('p');
      parent.appendChild(n1);
      parent.appendChild(n2);
      parent.appendChild(n3);

      expect(next(n1)).toBe(n2);
      expect(next(n1, 2)).toBe(n3);
      expect(next(n3)).toBeNull();
    });

    it('nthChild returns correctly', () => {
      expect(nthChild(null, 1)).toBeNull();
      const parent = document.createElement('div');
      expect(nthChild(parent, -1)).toBeNull();
      const n1 = document.createElement('span');
      const n2 = document.createElement('a');
      const n3 = document.createElement('p');
      parent.appendChild(n1);
      parent.appendChild(n2);
      parent.appendChild(n3);

      expect(nthChild(parent, 0)).toBe(n1);
      expect(nthChild(parent, 1)).toBe(n2);
      expect(nthChild(parent, 2)).toBe(n3);
      expect(nthChild(parent, 3)).toBeNull();
      expect(nthChild(n1, 1)).toBeNull();
    });
  });

  describe('insert', () => {
    it('inserts reactive nodes and cleans on teardown', () => {
      const context = createContext(null);
      const root = createTestRoot();
      pushContextStack(context);

      insert(root, () => document.createTextNode('content'));
      popContextStack();

      expect(root.textContent).toBe('content');
      cleanupContext(context);
    });

    it('supports inserting static nodes', () => {
      const context = createContext(null);
      const root = createTestRoot();
      pushContextStack(context);

      const span = document.createElement('span');
      span.textContent = 'static';
      insert(root, span);
      popContextStack();

      expect(root.textContent).toBe('static');
    });

    it('supports inserting static strings', () => {
      const context = createContext(null);
      const root = createTestRoot();
      pushContextStack(context);

      insert(root, 'Hello World');
      popContextStack();

      expect(root.textContent).toBe('Hello World');
    });

    it('handles insert when no active context exists', () => {
      const root = createTestRoot();
      expect(() => insert(root, document.createTextNode('no-context'))).not.toThrow();
      expect(root.textContent).toBe('no-context');
    });

    it('ignores insert when parent is null', () => {
      const context = createContext(null);
      pushContextStack(context);
      expect(() => insert(null as any, document.createTextNode('test'))).not.toThrow();
      popContextStack();
    });

    it('inserts nodes with before reference', () => {
      const context = createContext(null);
      const root = createTestRoot();
      pushContextStack(context);

      const first = document.createTextNode('first');
      const second = document.createTextNode('second');
      root.appendChild(second);

      insert(root, first, second);
      popContextStack();

      expect(root.textContent).toBe('firstsecond');
    });
  });
});
