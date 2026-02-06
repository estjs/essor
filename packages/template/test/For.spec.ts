import { describe, expect, it } from 'vitest';
import { nextTick, signal } from '@estjs/signals';
import { For } from '../src/components/For';
import { insert } from '../src/binding';
import { createTestRoot, mount, unmount } from './test-utils';

/**
 * Helper to get text content excluding comments
 */
function getContentHTML(element: HTMLElement): string {
  const clone = element.cloneNode(true) as HTMLElement;
  const walker = document.createTreeWalker(clone, NodeFilter.SHOW_COMMENT);
  const comments: Comment[] = [];
  while (walker.nextNode()) {
    comments.push(walker.currentNode as Comment);
  }
  comments.forEach(c => c.remove());
  return clone.innerHTML;
}

describe('for Component', () => {
  it('basic insert works', () => {
    const root = createTestRoot();
    const scope = mount(() => {
      const node = document.createElement('span');
      insert(node, 'hello');
      return node;
    }, root);

    expect(root.innerHTML).toBe('<span>hello</span>');
    unmount(scope);
  });

  it('renders a static list', () => {
    const root = createTestRoot();
    const items = ['A', 'B', 'C'];

    const scope = mount(() => {
      return For({
        each: items,
        children: item => {
          const el = document.createElement('div');
          el.textContent = item;
          return el;
        },
      });
    }, root);

    expect(getContentHTML(root)).toBe('<div>A</div><div>B</div><div>C</div>');
    unmount(scope);
  });

  it('reacts to signal changes (add/remove)', async () => {
    const root = createTestRoot();
    const list = signal(['A', 'B']);

    const scope = mount(() => {
      return For({
        each: () => list.value,
        children: item => {
          const el = document.createElement('div');
          el.textContent = item;
          return el;
        },
      });
    }, root);

    expect(getContentHTML(root)).toBe('<div>A</div><div>B</div>');

    // Add item
    list.value = ['A', 'B', 'C'];
    await nextTick();
    expect(getContentHTML(root)).toBe('<div>A</div><div>B</div><div>C</div>');

    // Remove item
    list.value = ['A', 'C'];
    await nextTick();
    expect(getContentHTML(root)).toBe('<div>A</div><div>C</div>');

    unmount(scope);
  });

  it('provides index parameter', () => {
    const root = createTestRoot();
    const items = ['A', 'B', 'C'];

    const scope = mount(() => {
      return For({
        each: items,
        children: (item, index) => {
          const el = document.createElement('div');
          el.textContent = `${index}:${item}`;
          return el;
        },
      });
    }, root);

    expect(getContentHTML(root)).toBe('<div>0:A</div><div>1:B</div><div>2:C</div>');
    unmount(scope);
  });

  it('reuses DOM nodes (keyed by reference)', async () => {
    const root = createTestRoot();
    const list = signal(['A', 'B', 'C']);

    const trackedNodes = new Map<string, HTMLDivElement>();

    const scope = mount(() => {
      return For({
        each: list,
        children: item => {
          const el = document.createElement('div');
          el.textContent = item;
          trackedNodes.set(item, el);
          return el;
        },
      });
    }, root);

    const divA = trackedNodes.get('A');
    const divB = trackedNodes.get('B');
    const divC = trackedNodes.get('C');

    expect(root.children[0]).toBe(divA);
    expect(root.children[1]).toBe(divB);
    expect(root.children[2]).toBe(divC);

    // Reorder
    list.value = ['C', 'A', 'B'];
    await nextTick();

    // Same DOM nodes should be reused in new order
    expect(root.children[0]).toBe(divC);
    expect(root.children[1]).toBe(divA);
    expect(root.children[2]).toBe(divB);

    unmount(scope);
  });

  it('renders fallback for empty list', () => {
    const root = createTestRoot();
    const list = signal<string[]>([]);

    const scope = mount(() => {
      return For({
        each: list,
        children: item => {
          const el = document.createElement('div');
          el.textContent = item;
          return el;
        },
        fallback: () => {
          const el = document.createElement('span');
          el.textContent = 'Empty';
          return el;
        },
      });
    }, root);

    expect(getContentHTML(root)).toBe('<span>Empty</span>');
    unmount(scope);
  });

  it('switches between fallback and list', async () => {
    const root = createTestRoot();
    const list = signal<string[]>([]);

    const scope = mount(() => {
      return For({
        each: list,
        children: item => {
          const el = document.createElement('div');
          el.textContent = item;
          return el;
        },
        fallback: () => {
          const el = document.createElement('span');
          el.textContent = 'Empty';
          return el;
        },
      });
    }, root);

    expect(getContentHTML(root)).toBe('<span>Empty</span>');

    list.value = ['A', 'B'];
    await nextTick();
    expect(getContentHTML(root)).toBe('<div>A</div><div>B</div>');

    list.value = [];
    await nextTick();
    expect(getContentHTML(root)).toBe('<span>Empty</span>');

    unmount(scope);
  });

  it('handles prepend operation', async () => {
    const root = createTestRoot();
    const list = signal(['B', 'C']);

    const trackedNodes = new Map<string, HTMLDivElement>();

    const scope = mount(() => {
      return For({
        each: list,
        children: item => {
          const el = document.createElement('div');
          el.textContent = item;
          trackedNodes.set(item, el);
          return el;
        },
      });
    }, root);

    const divB = trackedNodes.get('B');
    const divC = trackedNodes.get('C');

    list.value = ['A', 'B', 'C'];
    await nextTick();

    // B and C should be reused
    expect(root.children[1]).toBe(divB);
    expect(root.children[2]).toBe(divC);
    expect(getContentHTML(root)).toBe('<div>A</div><div>B</div><div>C</div>');

    unmount(scope);
  });

  it('handles append operation', async () => {
    const root = createTestRoot();
    const list = signal(['A', 'B']);

    const trackedNodes = new Map<string, HTMLDivElement>();

    const scope = mount(() => {
      return For({
        each: list,
        children: item => {
          const el = document.createElement('div');
          el.textContent = item;
          trackedNodes.set(item, el);
          return el;
        },
      });
    }, root);

    const divA = trackedNodes.get('A');
    const divB = trackedNodes.get('B');

    list.value = ['A', 'B', 'C'];
    await nextTick();

    expect(root.children[0]).toBe(divA);
    expect(root.children[1]).toBe(divB);
    expect(getContentHTML(root)).toBe('<div>A</div><div>B</div><div>C</div>');

    unmount(scope);
  });

  it('handles remove from middle', async () => {
    const root = createTestRoot();
    const list = signal(['A', 'B', 'C', 'D']);

    const trackedNodes = new Map<string, HTMLDivElement>();

    const scope = mount(() => {
      return For({
        each: list,
        children: item => {
          const el = document.createElement('div');
          el.textContent = item;
          trackedNodes.set(item, el);
          return el;
        },
      });
    }, root);

    const divA = trackedNodes.get('A');
    const divC = trackedNodes.get('C');
    const divD = trackedNodes.get('D');

    list.value = ['A', 'C', 'D'];
    await nextTick();

    expect(root.children[0]).toBe(divA);
    expect(root.children[1]).toBe(divC);
    expect(root.children[2]).toBe(divD);
    expect(getContentHTML(root)).toBe('<div>A</div><div>C</div><div>D</div>');

    unmount(scope);
  });

  it('handles swap of two items', async () => {
    const root = createTestRoot();
    const list = signal(['A', 'B']);

    const trackedNodes = new Map<string, HTMLDivElement>();

    const scope = mount(() => {
      return For({
        each: list,
        children: item => {
          const el = document.createElement('div');
          el.textContent = item;
          trackedNodes.set(item, el);
          return el;
        },
      });
    }, root);

    const divA = trackedNodes.get('A');
    const divB = trackedNodes.get('B');

    list.value = ['B', 'A'];
    await nextTick();

    expect(root.children[0]).toBe(divB);
    expect(root.children[1]).toBe(divA);

    unmount(scope);
  });

  it('handles reverse', async () => {
    const root = createTestRoot();
    const list = signal(['A', 'B', 'C', 'D']);

    const trackedNodes = new Map<string, HTMLDivElement>();

    const scope = mount(() => {
      return For({
        each: list,
        children: item => {
          const el = document.createElement('div');
          el.textContent = item;
          trackedNodes.set(item, el);
          return el;
        },
      });
    }, root);

    const divA = trackedNodes.get('A');
    const divB = trackedNodes.get('B');
    const divC = trackedNodes.get('C');
    const divD = trackedNodes.get('D');

    list.value = ['D', 'C', 'B', 'A'];
    await nextTick();

    expect(root.children[0]).toBe(divD);
    expect(root.children[1]).toBe(divC);
    expect(root.children[2]).toBe(divB);
    expect(root.children[3]).toBe(divA);

    unmount(scope);
  });

  it('handles duplicate item values', async () => {
    const root = createTestRoot();
    const itemA = { id: 'A' };
    const itemB = { id: 'B' };
    const list = signal([itemA, itemB, itemA]);

    const scope = mount(() => {
      return For({
        each: list,
        children: item => {
          const el = document.createElement('div');
          el.textContent = item.id;
          return el;
        },
      });
    }, root);

    expect(getContentHTML(root)).toBe('<div>A</div><div>B</div><div>A</div>');

    list.value = [itemB, itemA, itemA];
    await nextTick();
    expect(getContentHTML(root)).toBe('<div>B</div><div>A</div><div>A</div>');

    unmount(scope);
  });

  it('cleans up properly on dispose', () => {
    const root = createTestRoot();
    const list = signal(['A', 'B', 'C']);

    const scope = mount(() => {
      return For({
        each: list,
        children: item => {
          const el = document.createElement('div');
          el.textContent = item;
          return el;
        },
      });
    }, root);

    expect(getContentHTML(root)).toBe('<div>A</div><div>B</div><div>C</div>');

    unmount(scope);

    expect(getContentHTML(root)).toBe('');
  });

  it('handles complete replacement of all items', async () => {
    const root = createTestRoot();
    const list = signal(['A', 'B', 'C']);

    const scope = mount(() => {
      return For({
        each: list,
        children: item => {
          const el = document.createElement('div');
          el.textContent = item;
          return el;
        },
      });
    }, root);

    expect(getContentHTML(root)).toBe('<div>A</div><div>B</div><div>C</div>');

    list.value = ['X', 'Y', 'Z'];
    await nextTick();

    expect(getContentHTML(root)).toBe('<div>X</div><div>Y</div><div>Z</div>');

    unmount(scope);
  });

  it('handles rapid consecutive updates', async () => {
    const root = createTestRoot();
    const list = signal(['A']);

    const scope = mount(() => {
      return For({
        each: list,
        children: item => {
          const el = document.createElement('div');
          el.textContent = item;
          return el;
        },
      });
    }, root);

    list.value = ['A', 'B'];
    list.value = ['A', 'B', 'C'];
    list.value = ['B', 'C'];
    await nextTick();

    expect(getContentHTML(root)).toBe('<div>B</div><div>C</div>');

    unmount(scope);
  });
});
