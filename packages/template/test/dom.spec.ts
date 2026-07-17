import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signal } from '@estjs/signals';
import * as templateRuntime from '../src/index';
import { createComponent } from '../src/component';
import { For } from '../src/components/For';
import { Suspense } from '../src/components/Suspense';
import {
  child,
  insert,
  insertNode,
  insertTextContent,
  next,
  normalizeNode,
  nthChild,
  removeNode,
  replaceNode,
} from '../src/dom';
import { beginHydration, endHydration, getRenderedElement } from '../src/hydration';
import { onDestroy, onMount } from '../src/lifecycle';
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
    endHydration();
  });

  afterEach(() => {
    endHydration();
  });

  it('exports the compiler whole-text writer', () => {
    expect((templateRuntime as Record<string, unknown>).insertTextContent).toBeTypeOf('function');
  });

  it('adopts the unique matching SSR Text for whole-text hydration', () => {
    const root = document.createElement('div');
    root.innerHTML = '<title data-hk="0">server title</title>';
    const parent = root.firstElementChild as HTMLTitleElement;
    const ssrText = parent.firstChild as Text;
    beginHydration(root);
    expect(getRenderedElement('<title></title>')()).toBe(parent);
    const context = createContext(null);
    pushContextStack(context);

    try {
      const rendered = insertTextContent(parent, () => 'server title');

      expect(rendered).toBe(ssrText);
      expect(parent.childNodes).toHaveLength(1);
      expect(parent.firstChild).toBe(ssrText);
    } finally {
      popContextStack();
      cleanupContext(context);
    }
  });

  it('replaces every stale child when whole-text hydration does not match exactly', () => {
    const root = document.createElement('div');
    root.innerHTML = '<style data-hk="0">fresh</style>';
    const parent = root.firstElementChild as HTMLStyleElement;
    const staleText = parent.firstChild as Text;
    const staleComment = document.createComment('stale marker');
    parent.appendChild(staleComment);
    beginHydration(root);
    expect(getRenderedElement('<style></style>')()).toBe(parent);
    const context = createContext(null);
    pushContextStack(context);

    try {
      const rendered = insertTextContent(parent, () => 'fresh');

      expect(parent.childNodes).toHaveLength(1);
      expect(parent.firstChild).toBe(rendered);
      expect(rendered.data).toBe('fresh');
      expect(staleText.isConnected).toBe(false);
      expect(staleComment.isConnected).toBe(false);
    } finally {
      popContextStack();
      cleanupContext(context);
    }
  });

  it('normalizes nested text values and updates the same Text node reactively', () => {
    const parent = document.createElement('textarea');
    const value = signal<unknown>(['A', 1, [null, false, 'B']]);
    const context = createContext(null);
    pushContextStack(context);

    try {
      const rendered = insertTextContent(parent, () => value.value);

      expect(rendered.data).toBe('A1B');
      expect(parent.firstChild).toBe(rendered);

      value.value = ['C', true, 0, undefined];

      expect(parent.firstChild).toBe(rendered);
      expect(rendered.data).toBe('Ctrue0');
      expect(parent.childNodes).toHaveLength(1);
    } finally {
      popContextStack();
      cleanupContext(context);
    }
  });

  it('stops whole-text updates and removes the owned Text during scope cleanup', () => {
    const parent = document.createElement('title');
    const value = signal('first');
    const context = createContext(null);
    pushContextStack(context);
    const rendered = insertTextContent(parent, () => value.value);
    popContextStack();

    cleanupContext(context);
    value.value = 'late';

    expect(rendered.isConnected).toBe(false);
    expect(parent.childNodes).toHaveLength(0);
    expect(rendered.data).toBe('first');
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

  it('normalizes primitives into text nodes and preserves existing nodes', () => {
    const existing = document.createElement('button');
    const textNode = document.createTextNode('raw-text');
    const fromString = normalizeNode('hello');
    const fromFalsy = normalizeNode(false);

    expect(normalizeNode(existing)).toBe(existing);
    expect(normalizeNode(textNode)).toBe(textNode);
    expect(fromString.nodeType).toBe(Node.TEXT_NODE);
    expect(fromString.textContent).toBe('hello');
    expect(fromFalsy.nodeType).toBe(Node.TEXT_NODE);
    expect(fromFalsy.textContent).toBe('');
  });

  it('passes Component instances through normalizeNode unchanged', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const comp = createComponent(() => document.createElement('div'));
    const result = normalizeNode(comp);

    // Component instances must NOT be converted to text
    expect(result).toBe(comp);
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('normalizes plain objects into text nodes and emits a warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const obj = { foo: 'bar' };
    const node = normalizeNode(obj);

    expect(node.nodeType).toBe(Node.TEXT_NODE);
    expect(node.textContent).toBe(String(obj));
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain('plain object');

    warnSpy.mockRestore();
  });

  it('normalizes nested objects and arrays as text nodes', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const nested = { a: { b: 1 } };
    const node = normalizeNode(nested);
    expect(node.nodeType).toBe(Node.TEXT_NODE);
    expect(node.textContent).toBe(String(nested));

    warnSpy.mockRestore();
  });

  it('normalizes objects with custom toString', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const custom = { toString: () => 'custom-value' };
    const node = normalizeNode(custom);
    expect(node.nodeType).toBe(Node.TEXT_NODE);
    expect(node.textContent).toBe('custom-value');

    warnSpy.mockRestore();
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
    it('replaces an empty owned hydration range without claiming a preceding static sibling', () => {
      const root = createTestRoot();
      root.dataset.hk = '7';
      const staticSibling = document.createElement('span');
      staticSibling.textContent = 'static';
      const start = document.createComment('@essor:start:c:7:0');
      const rightBoundary = document.createComment('7-0');
      root.append(staticSibling, start, rightBoundary);
      beginHydration(root);

      const clientNode = document.createElement('span');
      clientNode.textContent = 'client';
      insert(root, () => clientNode, rightBoundary, start);

      expect(root.firstChild).toBe(staticSibling);
      expect(staticSibling.isConnected).toBe(true);
      expect(start.isConnected).toBe(false);
      expect(rightBoundary.parentNode).toBe(root);
      expect([...root.childNodes]).toEqual([staticSibling, clientNode, rightBoundary]);
    });

    it('adopts a truly empty owned hydration range by consuming only its start', () => {
      const root = createTestRoot();
      root.dataset.hk = '7';
      const staticSibling = document.createElement('span');
      const start = document.createComment('@essor:start:c:7:0');
      const rightBoundary = document.createComment('7-0');
      root.append(staticSibling, start, rightBoundary);
      beginHydration(root);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const rendered = insert(root, () => [], rightBoundary, start);

      try {
        expect(rendered).toEqual([]);
        expect(warnSpy).not.toHaveBeenCalled();
        expect(start.isConnected).toBe(false);
        expect([...root.childNodes]).toEqual([staticSibling, rightBoundary]);
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('clears a wrong-root owned hydration range before an anchored element', () => {
      const root = createTestRoot();
      root.dataset.hk = '7';
      const staticSibling = document.createElement('p');
      const start = document.createComment('@essor:start:e:7:0');
      const staleRoot = document.createElement('section');
      const rightBoundary = document.createElement('form');
      rightBoundary.dataset.hkIdx = '7-0';
      root.append(staticSibling, start, staleRoot, rightBoundary);
      beginHydration(root);

      const clientRoot = document.createElement('article');
      insert(root, () => clientRoot, rightBoundary, start);

      expect(root.firstChild).toBe(staticSibling);
      expect(staticSibling.isConnected).toBe(true);
      expect(start.isConnected).toBe(false);
      expect(staleRoot.isConnected).toBe(false);
      expect(rightBoundary.parentNode).toBe(root);
      expect([...root.childNodes]).toEqual([staticSibling, clientRoot, rightBoundary]);
    });

    it('clears every stale node after a partial match in a parent-tail range', () => {
      const root = createTestRoot();
      root.dataset.hk = '7';
      const staticSibling = document.createElement('header');
      const start = document.createComment('@essor:start:t:7:0');
      const staleRoot = document.createElement('aside');
      const staleTail = document.createElement('em');
      root.append(staticSibling, start, staleRoot, staleTail);
      beginHydration(root);

      const clientRoot = document.createElement('main');
      const clientTail = document.createElement('em');
      insert(root, () => [clientRoot, clientTail], undefined, start);

      expect(root.firstChild).toBe(staticSibling);
      expect(staticSibling.isConnected).toBe(true);
      expect(start.isConnected).toBe(false);
      expect(staleRoot.isConnected).toBe(false);
      expect(staleTail.isConnected).toBe(false);
      expect([...root.childNodes]).toEqual([staticSibling, clientRoot, clientTail]);
    });

    it('adopts an exact owned hydration range and removes only its start marker', () => {
      const root = createTestRoot();
      root.dataset.hk = '7';
      const staticSibling = document.createElement('header');
      const start = document.createComment('@essor:start:c:7:0');
      const ssrNode = document.createElement('strong');
      const rightBoundary = document.createComment('7-0');
      root.append(staticSibling, start, ssrNode, rightBoundary);
      beginHydration(root);

      const expectedNode = document.createElement('strong');
      const rendered = insert(root, () => expectedNode, rightBoundary, start);

      expect(rendered).toEqual([ssrNode]);
      expect(root.firstChild).toBe(staticSibling);
      expect(start.isConnected).toBe(false);
      expect(expectedNode.isConnected).toBe(false);
      expect(rightBoundary.parentNode).toBe(root);
      expect([...root.childNodes]).toEqual([staticSibling, ssrNode, rightBoundary]);
    });

    it('adopts an exact component range without detaching its SSR root', () => {
      const root = createTestRoot();
      root.dataset.hk = '7';
      const staticSibling = document.createElement('header');
      const start = document.createComment('@essor:start:c:7:0');
      const ssrRoot = document.createElement('strong');
      ssrRoot.dataset.hk = '0';
      ssrRoot.textContent = 'content';
      const rightBoundary = document.createComment('7-0');
      root.append(staticSibling, start, ssrRoot, rightBoundary);
      beginHydration(root);

      const removeSpy = vi.spyOn(ssrRoot, 'remove');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const component = createComponent(() => getRenderedElement('<strong>content</strong>')());
      const rendered = insert(root, component, rightBoundary, start);

      try {
        expect(removeSpy).not.toHaveBeenCalled();
        expect(warnSpy).not.toHaveBeenCalled();
        expect(rendered).toEqual([component]);
        expect(start.isConnected).toBe(false);
        expect([...root.childNodes]).toEqual([staticSibling, ssrRoot, rightBoundary]);
      } finally {
        removeSpy.mockRestore();
        warnSpy.mockRestore();
        component.destroy();
      }
    });

    it('adopts exact primitive component text without replacing the SSR Text node', () => {
      const root = createTestRoot();
      root.dataset.hk = '7';
      const staticSibling = document.createElement('header');
      const start = document.createComment('@essor:start:c:7:0');
      const ssrText = document.createTextNode('content');
      const rightBoundary = document.createComment('7-0');
      root.append(staticSibling, start, ssrText, rightBoundary);
      beginHydration(root);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const component = createComponent(() => 'content' as any);
      const rendered = insert(root, component, rightBoundary, start);

      try {
        expect(rendered).toEqual([component]);
        expect(component.renderedNodes).toEqual([ssrText]);
        expect(ssrText.isConnected).toBe(true);
        expect(start.isConnected).toBe(false);
        expect(warnSpy).not.toHaveBeenCalled();
        expect([...root.childNodes]).toEqual([staticSibling, ssrText, rightBoundary]);
      } finally {
        warnSpy.mockRestore();
        component.destroy();
      }
    });

    it('keeps an exact hydrated synchronous Suspense child between its client boundaries', () => {
      const root = createTestRoot();
      root.dataset.hk = '7';
      const staticSibling = document.createElement('header');
      const start = document.createComment('@essor:start:c:7:0');
      const ssrChild = document.createElement('strong');
      ssrChild.dataset.hk = '0';
      ssrChild.textContent = 'content';
      const rightBoundary = document.createComment('7-0');
      root.append(staticSibling, start, ssrChild, rightBoundary);
      beginHydration(root);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const component = createComponent(Suspense as any, {
        children: getRenderedElement('<strong>content</strong>'),
      });
      const rendered = insert(root, component, rightBoundary, start);

      try {
        expect(rendered).toEqual([component]);
        expect(component.renderedNodes).toHaveLength(3);
        expect(component.renderedNodes[1]).toBe(ssrChild);
        expect(ssrChild.isConnected).toBe(true);
        expect(start.isConnected).toBe(false);
        expect(warnSpy).not.toHaveBeenCalled();
        expect([...root.childNodes]).toEqual([
          staticSibling,
          component.renderedNodes[0],
          ssrChild,
          component.renderedNodes[2],
          rightBoundary,
        ]);
        expect((component.renderedNodes[0] as Comment).data).toBe('suspense');
        expect((component.renderedNodes[2] as Comment).data).toBe('/suspense');
      } finally {
        warnSpy.mockRestore();
        component.destroy();
      }
    });

    it('adopts an exact For range without disconnecting or reinserting SSR rows', () => {
      const root = createTestRoot();
      root.dataset.hk = '7';
      const staticSibling = document.createElement('li');
      staticSibling.textContent = 'static';
      const start = document.createComment('@essor:start:t:7:0');
      const ssrRow = document.createElement('li');
      ssrRow.dataset.hk = '0';
      ssrRow.textContent = 'row';
      root.append(staticSibling, start, ssrRow);
      beginHydration(root);

      const removeSpy = vi.spyOn(ssrRow, 'remove');
      const insertSpy = vi.spyOn(root, 'insertBefore');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const component = createComponent(For as any, {
        each: ['row'],
        children: () => getRenderedElement('<li>row</li>')(),
        key: (item: string) => item,
      });
      const rendered = insert(root, component, undefined, start);

      try {
        expect(removeSpy).not.toHaveBeenCalled();
        expect(insertSpy.mock.calls.some(([node]) => node === ssrRow)).toBe(false);
        expect(warnSpy).not.toHaveBeenCalled();
        expect(rendered).toEqual([component]);
        expect(start.isConnected).toBe(false);
        expect([...root.children]).toEqual([staticSibling, ssrRow]);
      } finally {
        removeSpy.mockRestore();
        insertSpy.mockRestore();
        warnSpy.mockRestore();
        component.destroy();
      }
    });

    it('updates and cleans an exact hydrated primitive For row through its SSR Text node', () => {
      const root = createTestRoot();
      root.dataset.hk = '7';
      const staticSibling = document.createElement('span');
      staticSibling.textContent = 'static';
      const start = document.createComment('@essor:start:c:7:0');
      const ssrText = document.createTextNode('one');
      const rightBoundary = document.createComment('7-0');
      root.append(staticSibling, start, ssrText, rightBoundary);
      beginHydration(root);

      const rows = signal(['one']);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const component = createComponent(For as any, {
        each: rows,
        children: (item: string) => item,
        key: (item: string) => item,
      });
      insert(root, component, rightBoundary, start);

      try {
        expect(component.renderedNodes[0]).toBe(ssrText);
        expect(ssrText.isConnected).toBe(true);
        expect(warnSpy).not.toHaveBeenCalled();

        rows.value = ['two'];

        expect(ssrText.isConnected).toBe(false);
        expect(root.textContent).toBe('statictwo');

        component.destroy();
        expect(root.textContent).toBe('static');
        expect([...root.childNodes]).toEqual([staticSibling, rightBoundary]);
      } finally {
        warnSpy.mockRestore();
        component.destroy();
      }
    });

    it('keeps a component CSR root detached until an empty owned range is cleared', () => {
      const root = createTestRoot();
      root.dataset.hk = '7';
      const staticSibling = document.createElement('header');
      const start = document.createComment('@essor:start:c:7:0');
      const rightBoundary = document.createComment('7-0');
      root.append(staticSibling, start, rightBoundary);
      beginHydration(root);

      const factory = getRenderedElement('<article>client</article>');
      let clientRoot: Element | undefined;
      let clientRemoveSpy: ReturnType<typeof vi.spyOn> | undefined;
      const component = createComponent(() => {
        clientRoot = factory();
        clientRemoveSpy = vi.spyOn(clientRoot, 'remove');
        return clientRoot;
      });
      const rendered = insert(root, component, rightBoundary, start);

      try {
        expect(clientRemoveSpy).toBeDefined();
        expect(clientRemoveSpy).not.toHaveBeenCalled();
        expect(rendered).toEqual([component]);
        expect(start.isConnected).toBe(false);
        expect([...root.childNodes]).toEqual([staticSibling, clientRoot, rightBoundary]);
      } finally {
        clientRemoveSpy?.mockRestore();
        component.destroy();
      }
    });

    it('mounts an empty component only once when a partial owned range falls back to CSR', () => {
      const root = createTestRoot();
      root.dataset.hk = '7';
      const staticSibling = document.createElement('header');
      const start = document.createComment('@essor:start:c:7:0');
      const staleNode = document.createElement('i');
      const rightBoundary = document.createComment('7-0');
      root.append(staticSibling, start, staleNode, rightBoundary);
      beginHydration(root);

      let renderCount = 0;
      let mountCount = 0;
      let destroyCount = 0;
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const component = createComponent(() => {
        renderCount++;
        onMount(() => mountCount++);
        onDestroy(() => destroyCount++);
        return [];
      });
      const rendered = insert(root, component, rightBoundary, start);

      try {
        expect(rendered).toEqual([component]);
        expect(renderCount).toBe(1);
        expect(mountCount).toBe(1);
        expect(warnSpy).toHaveBeenCalledOnce();
        expect(staleNode.isConnected).toBe(false);
        expect([...root.childNodes]).toEqual([staticSibling, rightBoundary]);

        component.destroy();
        expect(destroyCount).toBe(1);
      } finally {
        warnSpy.mockRestore();
        component.destroy();
      }
    });

    it('rerenders an adopted component root as CSR after a partial range mismatch', () => {
      const root = createTestRoot();
      root.dataset.hk = '7';
      const staticSibling = document.createElement('header');
      const start = document.createComment('@essor:start:t:7:0');
      const ssrRoot = document.createElement('section');
      ssrRoot.dataset.hk = '0';
      const staleTail = document.createElement('em');
      root.append(staticSibling, start, ssrRoot, staleTail);
      beginHydration(root);

      const roots: Element[] = [];
      const factory = getRenderedElement('<section>client</section>');
      const component = createComponent(() => {
        const renderedRoot = factory();
        roots.push(renderedRoot);
        return renderedRoot;
      });
      const rendered = insert(root, component, undefined, start);

      try {
        expect(roots).toHaveLength(2);
        expect(roots[0]).toBe(ssrRoot);
        expect(roots[1]).not.toBe(ssrRoot);
        expect(ssrRoot.isConnected).toBe(false);
        expect(staleTail.isConnected).toBe(false);
        expect(rendered).toEqual([component]);
        expect([...root.childNodes]).toEqual([staticSibling, roots[1]]);
      } finally {
        component.destroy();
      }
    });

    it('does not consume an adjacent component hydration key during partial mismatch CSR fallback', () => {
      const root = createTestRoot();
      root.dataset.hk = '7';
      const firstStart = document.createComment('@essor:start:c:7:0');
      const firstSSR = document.createElement('section');
      firstSSR.dataset.hk = '0';
      firstSSR.textContent = 'first';
      const staleTail = document.createElement('em');
      staleTail.textContent = 'tail';
      const firstBoundary = document.createComment('7-0');
      const secondStart = document.createComment('@essor:start:c:7:1');
      const secondSSR = document.createElement('section');
      secondSSR.dataset.hk = '1';
      secondSSR.textContent = 'second';
      const secondBoundary = document.createComment('7-1');
      root.append(
        firstStart,
        firstSSR,
        staleTail,
        firstBoundary,
        secondStart,
        secondSSR,
        secondBoundary,
      );
      beginHydration(root);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const firstFactory = getRenderedElement('<section>first</section>');
      const secondFactory = getRenderedElement('<section>second</section>');
      const firstComponent = createComponent(() => firstFactory());
      const secondComponent = createComponent(() => secondFactory());

      insert(root, firstComponent, firstBoundary, firstStart);
      insert(root, secondComponent, secondBoundary, secondStart);

      try {
        expect(firstComponent.renderedNodes[0]).not.toBe(firstSSR);
        expect(firstComponent.renderedNodes[0]).not.toBe(secondSSR);
        expect(firstComponent.renderedNodes[0].textContent).toBe('first');
        expect(secondComponent.renderedNodes[0]).toBe(secondSSR);
        expect(secondSSR.isConnected).toBe(true);
        expect(firstSSR.isConnected).toBe(false);
        expect(staleTail.isConnected).toBe(false);
        expect(warnSpy).toHaveBeenCalledOnce();
        expect([...root.childNodes]).toEqual([
          firstComponent.renderedNodes[0],
          firstBoundary,
          secondSSR,
          secondBoundary,
        ]);
      } finally {
        warnSpy.mockRestore();
        firstComponent.destroy();
        secondComponent.destroy();
      }
    });

    it('keeps legacy conservative mismatch cleanup when no owned start is provided', () => {
      const root = createTestRoot();
      const staticSibling = document.createElement('span');
      const matchedTail = document.createElement('em');
      root.append(staticSibling, matchedTail);
      beginHydration(root);

      const clientRoot = document.createElement('main');
      const clientTail = document.createElement('em');
      insert(root, () => [clientRoot, clientTail]);

      expect(root.firstChild).toBe(staticSibling);
      expect(staticSibling.isConnected).toBe(true);
      expect(matchedTail.isConnected).toBe(false);
      expect([...root.childNodes]).toEqual([staticSibling, clientRoot, clientTail]);
    });

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

    it('renders a plain object as text content without throwing', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const context = createContext(null);
      const root = createTestRoot();
      pushContextStack(context);

      const obj = { message: 'hello' };
      expect(() => insert(root, obj as any)).not.toThrow();
      popContextStack();

      expect(root.textContent).toBe(String(obj));
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
      cleanupContext(context);
    });

    it('renders a reactive object factory as text content', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const context = createContext(null);
      const root = createTestRoot();
      pushContextStack(context);

      insert(root, () => ({ key: 'value' }));
      popContextStack();

      expect(root.textContent).toBe(String({ key: 'value' }));
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
      cleanupContext(context);
    });

    it('updates primitive reactive text in place without replacing the Text node', () => {
      const context = createContext(null);
      const root = createTestRoot();
      const value = signal('one');
      pushContextStack(context);

      insert(root, () => value.value);
      popContextStack();

      const firstNode = root.firstChild;
      expect(firstNode?.nodeType).toBe(Node.TEXT_NODE);
      expect(firstNode?.textContent).toBe('one');

      value.value = 'two';

      expect(root.firstChild).toBe(firstNode);
      expect(firstNode?.textContent).toBe('two');

      cleanupContext(context);
    });

    it('replaces explicit Text nodes instead of patching their text into the old node', () => {
      const context = createContext(null);
      const root = createTestRoot();
      const useSecond = signal(false);
      const first = document.createTextNode('first');
      const second = document.createTextNode('second');
      pushContextStack(context);

      insert(root, () => (useSecond.value ? second : first));
      popContextStack();

      expect(root.firstChild).toBe(first);

      useSecond.value = true;

      expect(root.firstChild).toBe(second);
      expect(root.firstChild?.textContent).toBe('second');

      cleanupContext(context);
    });

    it('renders an object with custom toString via insert', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const context = createContext(null);
      const root = createTestRoot();
      pushContextStack(context);

      const obj = { toString: () => 'custom-render' };
      insert(root, obj as any);
      popContextStack();

      expect(root.textContent).toBe('custom-render');

      warnSpy.mockRestore();
      cleanupContext(context);
    });

    // own-03: insert() returns a LIVE array; anchors derived from it must
    // track reactive root replacements instead of a stale first-run snapshot.
    it('reflects reactive root replacement in the returned array (OWN-03)', () => {
      const root = createTestRoot();
      const which = signal<'a' | 'b'>('a');
      const elA = document.createElement('div');
      elA.id = 'a';
      const elB = document.createElement('section');
      elB.id = 'b';

      const scope = createContext(null);
      pushContextStack(scope);
      const nodes = insert(root, () => (which.value === 'a' ? elA : elB))!;
      popContextStack();

      expect(nodes[0]).toBe(elA);

      which.value = 'b';
      // Same array reference, updated contents.
      expect(nodes[0]).toBe(elB);
      expect(nodes).toHaveLength(1);

      cleanupContext(scope);
    });

    it('insertNode anchored on a Component uses the CURRENT first node (OWN-03)', () => {
      const root = createTestRoot();
      const which = signal(true);
      const Child = () => () => () => {
        const el = document.createElement(which.value ? 'p' : 'h1');
        return el;
      };

      const comp = createComponent(Child, {});
      comp.mount(root);
      which.value = false; // root replaced

      const extra = document.createElement('em');
      insertNode(root, extra, comp as any);
      // The new node must land before the CURRENT root (h1), i.e. still inside
      // the container and before comp's first node.
      expect(extra.nextSibling).toBe(comp.firstChild);

      comp.destroy();
    });

    it('expands a DocumentFragment into its children (no empty-shell tracking)', () => {
      const root = createTestRoot();
      const frag = document.createDocumentFragment();
      const x = document.createElement('i');
      const y = document.createElement('b');
      frag.append(x, y);

      const scope = createContext(null);
      pushContextStack(scope);
      const nodes = insert(root, frag)!;
      popContextStack();

      expect(nodes).toEqual([x, y]);
      expect(root.contains(x)).toBe(true);
      expect(root.contains(y)).toBe(true);

      cleanupContext(scope);
      expect(root.contains(x)).toBe(false);
      expect(root.contains(y)).toBe(false);
    });
  });
});
