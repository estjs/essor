import { beforeEach, describe, expect, it } from 'vitest';
import { patchNodes } from '../src/patch';
import { setNodeKey } from '../src/key';
import { createComponent } from '../src/component';
import { createTestRoot, resetEnvironment } from './test-utils';

const createDiv = (text: string, key: string) => {
  const el = document.createElement('div');
  el.textContent = text;
  setNodeKey(el, key);
  return el;
};

describe('patchNodes', () => {
  beforeEach(() => {
    resetEnvironment();
  });

  it('mounts new nodes when there are no existing children', () => {
    const root = createTestRoot();
    const nextChildren = [createDiv('A', 'a'), createDiv('B', 'b')];

    const result = patchNodes(root, [], nextChildren, null);

    expect(result).toHaveLength(2);
    expect(root.children[0].textContent).toBe('A');
    expect(root.children[1].textContent).toBe('B');
  });

  it('respects anchor position when mounting new nodes', () => {
    const root = createTestRoot();
    const anchor = document.createElement('div');
    anchor.textContent = 'anchor';
    root.appendChild(anchor);

    patchNodes(root, [], [createDiv('A', 'a')], anchor);

    expect(root.firstChild?.textContent).toBe('A');
    expect(root.lastChild?.textContent).toBe('anchor');
  });

  it('updates text nodes in place', () => {
    const root = createTestRoot();
    const textA = document.createTextNode('A');
    const textB = document.createTextNode('B');

    const mounted = patchNodes(root, [], [textA], null);
    const patched = patchNodes(root, mounted, [textB], null);

    expect(patched[0]).toBe(textA);
    expect(root.textContent).toBe('B');
  });

  it('reorders keyed children with minimal DOM operations', () => {
    const root = createTestRoot();
    const initial = [createDiv('1', 'one'), createDiv('2', 'two'), createDiv('3', 'three')];
    const mounted = patchNodes(root, [], initial, null);

    const reordered = [createDiv('3', 'three'), createDiv('1', 'one'), createDiv('2', 'two')];
    const patched = patchNodes(root, mounted, reordered, null);

    expect(patched.map(node => (node as HTMLElement).textContent)).toEqual(['3', '1', '2']);
    expect(root.children[0].textContent).toBe('3');
  });

  it('removes old children when new list is shorter', () => {
    const root = createTestRoot();
    const initial = [createDiv('1', 'one'), createDiv('2', 'two')];
    const mounted = patchNodes(root, [], initial, null);

    const shorter = [createDiv('2', 'two')];
    const patched = patchNodes(root, mounted, shorter, null);

    expect(patched).toHaveLength(1);
    expect(root.children).toHaveLength(1);
    expect(root.children[0].textContent).toBe('2');
  });

  it('unmounts all nodes when new children are empty', () => {
    const root = createTestRoot();
    const initial = [createDiv('1', 'one')];
    const mounted = patchNodes(root, [], initial, null);
    const patched = patchNodes(root, mounted, [], null);

    expect(patched).toHaveLength(0);
    expect(root.children).toHaveLength(0);
  });

  it('updates component instances while preserving DOM nodes', async () => {
    const root = createTestRoot();
    const Comp = (props: any) => {
      const span = document.createElement('span');
      span.textContent = props.label;
      return span;
    };

    const first = createComponent(Comp, { key: 'c', label: 'one' });
    const second = createComponent(Comp, { key: 'c', label: 'two' });

    const mounted = patchNodes(root, [], [first], null);
    const patched = patchNodes(root, mounted, [second], null);

    expect(patched[0]).toBe(first);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect((first.firstChild as HTMLElement).textContent).toBe('one'); // Content updates are async/reactive
    expect(first.firstChild).toBe(first.firstChild);
    expect(first.props?.label).toBe('two');
  });
});
