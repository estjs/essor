import { beforeEach, describe, expect, it } from 'vitest';
import { createComponent } from '../src/component';
import { insertNode, isSameNode, normalizeNode, removeNode, replaceNode } from '../src/dom';
import { resetEnvironment } from './test-utils';

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
});
