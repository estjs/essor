import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signal } from '@estjs/signals';
import { createComponent, isComponent } from '../src/component';
import { onDestroy, onMount, onUpdate } from '../src/lifecycle';
import { COMPONENT_STATE, COMPONENT_TYPE } from '../src/constants';
import { createTestRoot, resetEnvironment } from './test-utils';

describe('component', () => {
  beforeEach(() => {
    resetEnvironment();
  });
  it('syncs getter props to reactiveProps on update', async () => {
    const root = createTestRoot();
    let capturedProps: any = null;

    const TestComp = (props: any) => {
      capturedProps = props;
      const span = document.createElement('span');
      span.textContent = props.item?.label || '';
      return span;
    };

    // First render with initial item
    const item1 = { id: 1, label: 'First' };
    const first = createComponent(TestComp, {
      get item() {
        return item1;
      },
    }) as any;
    await first.mount(root);

    expect(capturedProps.item.label).toBe('First');

    // Update with new item (simulating what happens in benchmark)
    const item2 = { id: 1, label: 'First !!!' };
    const nextProps = {
      get item() {
        return item2;
      },
    };
    first.update(nextProps as any);

    // The getter should now return the new item
    expect(capturedProps.item.label).toBe('First !!!');
  });
  it('handles props with mutated object reference', async () => {
    const root = createTestRoot();
    let capturedLabel = '';

    const TestComp = (props: any) => {
      const span = document.createElement('span');
      // Access props.item.label - this simulates what compiled JSX does
      capturedLabel = props.item?.label || '';
      span.textContent = capturedLabel;
      return span;
    };

    // Create initial item
    const item = { id: 1, label: 'Original' };

    const first = createComponent(TestComp, {
      get item() {
        return item;
      },
    }) as any;
    await first.mount(root);

    expect(capturedLabel).toBe('Original');

    // Mutate the item (like benchmark does)
    item.label = 'Original !!!';

    // Create new component with getter that returns same (mutated) object
    const nextProps = {
      get item() {
        return item;
      },
    };
    first.update(nextProps as any);

    // Force re-access of props to verify getter is updated
    const propsItem = (first as any).reactiveProps.item;
    expect(propsItem.label).toBe('Original !!!');
  });
  // ── createComponent / isComponent ─────────────────────────────────

  describe('createComponent', () => {
    it('returns a Component instance for a function', () => {
      const Comp = () => document.createElement('div');
      const instance = createComponent(Comp);
      expect(isComponent(instance)).toBe(true);
      expect(instance.component).toBe(Comp);
    });

    it('passes through an existing Component instance', () => {
      const first = createComponent(() => document.createElement('div'));
      const second = createComponent(first as any);
      expect(second).toBe(first);
    });

    it('stores the original props reference', () => {
      const props = { id: '42' };
      const instance = createComponent(() => document.createElement('div'), props) as any;
      expect(instance.props).toBe(props);
    });

    it('exposes the COMPONENT_TYPE.NORMAL marker', () => {
      const instance = createComponent(() => document.createElement('div'));
      expect((instance as any)[COMPONENT_TYPE.NORMAL]).toBe(true);
    });

    it('initialises with INITIAL state before mount', () => {
      const instance = createComponent(() => document.createElement('div')) as any;
      expect(instance.state).toBe(COMPONENT_STATE.INITIAL);
      expect(instance.scope).toBeNull();
      expect(instance.renderedNodes).toEqual([]);
      expect(instance.firstChild).toBeUndefined();
    });
  });

  describe('isComponent', () => {
    it('returns true for component instances', () => {
      expect(isComponent(createComponent(() => document.createElement('div')))).toBe(true);
    });

    it('returns false for non-components', () => {
      expect(isComponent(null)).toBe(false);
      expect(isComponent(undefined)).toBe(false);
      expect(isComponent('text')).toBe(false);
      expect(isComponent(42)).toBe(false);
      expect(isComponent(document.createElement('div'))).toBe(false);
      expect(isComponent({})).toBe(false);
    });
  });

  // ── mount ─────────────────────────────────────────────────────────

  describe('mount', () => {
    it('inserts rendered nodes into the parent and sets state', () => {
      const root = createTestRoot();
      const Comp = () => {
        const el = document.createElement('span');
        el.textContent = 'hi';
        return el;
      };
      const instance = createComponent(Comp) as any;
      instance.mount(root);

      expect(root.querySelector('span')?.textContent).toBe('hi');
      expect(instance.state).toBe(COMPONENT_STATE.MOUNTED);
      expect(instance.scope).not.toBeNull();
      expect(instance.renderedNodes.length).toBe(1);
      expect(instance.firstChild).toBe(instance.renderedNodes[0]);
    });

    it('respects beforeNode when inserting', () => {
      const root = createTestRoot();
      const existing = document.createElement('p');
      existing.textContent = 'end';
      root.appendChild(existing);

      const Comp = () => {
        const el = document.createElement('span');
        el.textContent = 'start';
        return el;
      };
      const instance = createComponent(Comp) as any;
      instance.mount(root, existing);

      expect(root.firstChild).toBe(instance.firstChild);
      expect(root.lastChild).toBe(existing);
    });

    it('triggers onMount exactly once', () => {
      const root = createTestRoot();
      const hook = vi.fn();
      const Comp = () => {
        onMount(hook);
        return document.createElement('div');
      };
      const instance = createComponent(Comp) as any;
      instance.mount(root);
      expect(hook).toHaveBeenCalledTimes(1);
    });

    it('supports render-function pattern (function returning function)', () => {
      const root = createTestRoot();
      const Comp = () => () => {
        const el = document.createElement('em');
        el.textContent = 'rf';
        return el;
      };
      const instance = createComponent(Comp) as any;
      instance.mount(root);
      expect(root.querySelector('em')?.textContent).toBe('rf');
    });

    it('unwraps a signal/computed result', () => {
      const root = createTestRoot();
      const el = document.createElement('i');
      el.textContent = 'sig';
      const s = signal(el);
      const Comp = () => s as any;
      const instance = createComponent(Comp) as any;
      instance.mount(root);
      expect(root.querySelector('i')?.textContent).toBe('sig');
    });

    it('remount moves existing nodes to a new parent without re-running the component', () => {
      const rootA = createTestRoot('root-a');
      const rootB = createTestRoot('root-b');
      const factory = vi.fn(() => document.createElement('div'));
      const instance = createComponent(factory) as any;

      instance.mount(rootA);
      const firstScope = instance.scope;
      expect(factory).toHaveBeenCalledTimes(1);

      instance.mount(rootB);

      expect(factory).toHaveBeenCalledTimes(1);
      expect(instance.scope).toBe(firstScope);
      expect(rootA.childNodes.length).toBe(0);
      expect(rootB.childNodes.length).toBe(1);
      expect(instance.state).toBe(COMPONENT_STATE.MOUNTED);
    });
  });

  // ── special props: events & refs ─────────────────────────────────

  describe('special props', () => {
    it('wires DOM event listeners from onXxx props to the root element', () => {
      const root = createTestRoot();
      const handler = vi.fn();
      const Comp = () => document.createElement('button');
      const instance = createComponent(Comp, { onClick: handler } as any) as any;
      instance.mount(root);

      (instance.firstChild as HTMLButtonElement).click();
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('overrides a JSX-bound delegated handler in the `_$<event>` slot (Solid-style)', async () => {
      const root = createTestRoot();
      const internal = vi.fn();
      const parent = vi.fn();
      // Simulate babel-plugin's emit: a button with `_$click = internal` slot,
      // plus the module-init `delegateEvents(['click'])` registration that
      // makes the document walker pick up the slot.
      const { delegateEvents } = await import('../src/events');
      delegateEvents(['click']);

      const Comp = () => {
        const btn = document.createElement('button');
        (btn as any)._$click = internal;
        return btn;
      };
      const instance = createComponent(Comp, { onClick: parent } as any) as any;
      instance.mount(root);

      (instance.firstChild as HTMLButtonElement).click();
      expect(parent).toHaveBeenCalledTimes(1);
      expect(internal).not.toHaveBeenCalled();
    });

    it('restores the JSX-bound slot handler on destroy', async () => {
      const root = createTestRoot();
      const internal = () => {};
      const parent = () => {};
      const { delegateEvents } = await import('../src/events');
      delegateEvents(['click']);

      const Comp = () => {
        const btn = document.createElement('button');
        (btn as any)._$click = internal;
        return btn;
      };
      const instance = createComponent(Comp, { onClick: parent } as any) as any;
      instance.mount(root);

      const btn = instance.firstChild as HTMLButtonElement;
      expect((btn as any)._$click).toBe(parent);

      instance.destroy();
      expect((btn as any)._$click).toBe(internal);
    });

    it('short-circuits the native-path handler when the root element is `disabled`', () => {
      const root = createTestRoot();
      const handler = vi.fn();
      const Comp = () => {
        const btn = document.createElement('button');
        btn.disabled = true;
        return btn;
      };
      const instance = createComponent(Comp, { onClick: handler } as any) as any;
      instance.mount(root);

      // Dispatch directly — jsdom suppresses `.click()` on `disabled` buttons,
      // which would mask the wrapper. dispatchEvent bypasses that suppression.
      (instance.firstChild as HTMLButtonElement).dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
      expect(handler).not.toHaveBeenCalled();
    });

    it('re-overrides the slot across update() and restores the template handler on destroy', async () => {
      const root = createTestRoot();
      const internal = vi.fn();
      const handlerA = vi.fn();
      const handlerB = vi.fn();
      const { delegateEvents } = await import('../src/events');
      delegateEvents(['click']);

      const Comp = () => {
        const btn = document.createElement('button');
        (btn as any)._$click = internal;
        return btn;
      };
      const instance = createComponent(Comp, { onClick: handlerA } as any) as any;
      instance.mount(root);
      const btn = instance.firstChild as HTMLButtonElement;

      // After mount: A overrides the template handler.
      expect((btn as any)._$click).toBe(handlerA);

      // update() releases (restores internal) then re-overrides with B.
      instance.update({ onClick: handlerB } as any);
      expect((btn as any)._$click).toBe(handlerB);

      btn.click();
      expect(handlerB).toHaveBeenCalledTimes(1);
      expect(handlerA).not.toHaveBeenCalled();
      expect(internal).not.toHaveBeenCalled();

      // destroy() restores the template's slot handler — no leaked reference to B.
      instance.destroy();
      expect((btn as any)._$click).toBe(internal);
    });

    it('binds a function ref to the root element on mount', () => {
      const root = createTestRoot();
      const ref = vi.fn();
      const Comp = () => document.createElement('div');
      const instance = createComponent(Comp, { ref } as any) as any;
      instance.mount(root);
      expect(ref).toHaveBeenCalledWith(instance.firstChild);
    });

    it('binds a signal ref to the root element on mount', () => {
      const root = createTestRoot();
      const ref = signal<Element | null>(null);
      const Comp = () => document.createElement('div');
      const instance = createComponent(Comp, { ref } as any) as any;
      instance.mount(root);
      expect(ref.value).toBe(instance.firstChild);
    });

    it('evaluates getter-wrapped ref props', () => {
      const root = createTestRoot();
      const ref = signal<Element | null>(null);
      const props = {} as any;
      Object.defineProperty(props, 'ref', { enumerable: true, get: () => ref });
      const instance = createComponent(() => document.createElement('div'), props) as any;
      instance.mount(root);
      expect(ref.value).toBe(instance.firstChild);
    });

    it('does not evaluate non-special getter props while syncing root props', () => {
      const root = createTestRoot();
      const readLabel = vi.fn(() => 'label');
      const props = {} as any;
      Object.defineProperty(props, 'label', {
        enumerable: true,
        configurable: true,
        get: readLabel,
      });

      const instance = createComponent(() => document.createElement('div'), props) as any;
      instance.mount(root);

      expect(readLabel).not.toHaveBeenCalled();
    });
  });

  // ── reactive props perception ────────────────────────────────────

  describe('reactive props', () => {
    it('preserves getter descriptors so props read the latest value', () => {
      const root = createTestRoot();
      let captured: any;
      const Comp = (props: any) => {
        captured = props;
        return document.createElement('div');
      };

      let source = { label: 'first' };
      const rawProps = {} as any;
      Object.defineProperty(rawProps, 'item', {
        enumerable: true,
        configurable: true,
        get: () => source,
      });

      const instance = createComponent(Comp, rawProps) as any;
      instance.mount(root);
      expect(captured.item.label).toBe('first');

      source = { label: 'second' };
      expect(captured.item.label).toBe('second');
    });

    it('wraps plain-object props so nested mutations trigger reactivity', () => {
      const root = createTestRoot();
      let captured: any;
      const Comp = (props: any) => {
        captured = props;
        return document.createElement('div');
      };

      const obj = { n: 1 };
      const instance = createComponent(Comp, { obj } as any) as any;
      instance.mount(root);

      // Accessing props.obj still returns the original reference, but nested
      // mutations go through the shallow-reactive proxy.
      captured.obj.n = 2;
      expect(captured.obj.n).toBe(2);
    });
  });

  // ── update ───────────────────────────────────────────────────────

  describe('update', () => {
    it('overwrites existing keys and removes stale keys', () => {
      const root = createTestRoot();
      let captured: Record<string, unknown> | undefined;
      const Comp = (props: Record<string, unknown>) => {
        captured = props;
        return document.createElement('div');
      };

      const instance = createComponent(Comp, { id: 'one', extra: 'keep' } as any) as any;
      instance.mount(root);
      expect(captured!.id).toBe('one');
      expect(captured!.extra).toBe('keep');

      instance.update({ id: 'two' } as any);
      expect(captured!.id).toBe('two');
      expect('extra' in (captured as object)).toBe(false);
    });

    it('keeps getter descriptors reactive across updates', () => {
      const root = createTestRoot();
      let captured: any;
      const Comp = (props: any) => {
        captured = props;
        return document.createElement('div');
      };

      let current = { label: 'first' };
      const propsA = {} as any;
      Object.defineProperty(propsA, 'item', {
        enumerable: true,
        configurable: true,
        get: () => current,
      });

      const instance = createComponent(Comp, propsA) as any;
      instance.mount(root);
      expect(captured.item.label).toBe('first');

      current = { label: 'second' };
      const propsB = {} as any;
      Object.defineProperty(propsB, 'item', {
        enumerable: true,
        configurable: true,
        get: () => current,
      });
      instance.update(propsB);
      expect(captured.item.label).toBe('second');

      // A third update swapping the underlying source should still surface.
      current = { label: 'third' };
      instance.update(propsB);
      expect(captured.item.label).toBe('third');
    });

    it('preserves the reactiveProps reference across updates', () => {
      const root = createTestRoot();
      let captured: any;
      const Comp = (props: any) => {
        captured = props;
        return document.createElement('div');
      };
      const instance = createComponent(Comp, { a: 1 } as any) as any;
      instance.mount(root);

      const firstRef = captured;
      instance.update({ a: 2, b: 3 } as any);
      expect(captured).toBe(firstRef);
      expect(captured.a).toBe(2);
      expect(captured.b).toBe(3);
    });

    it('triggers onUpdate hooks in the mounted scope', () => {
      const root = createTestRoot();
      const hook = vi.fn();
      const Comp = (props: { text: string }) => {
        onUpdate(hook);
        const div = document.createElement('div');
        div.textContent = props.text;
        return div;
      };
      const instance = createComponent(Comp, { text: 'A' }) as any;
      instance.mount(root);
      instance.update({ text: 'B' });
      expect(hook).toHaveBeenCalledTimes(1);
    });

    it('is a no-op when the scope has been destroyed', () => {
      const root = createTestRoot();
      const hook = vi.fn();
      const Comp = () => {
        onUpdate(hook);
        return document.createElement('div');
      };
      const instance = createComponent(Comp) as any;
      instance.mount(root);
      instance.destroy();

      expect(() => instance.update({ foo: 1 } as any)).not.toThrow();
      expect(hook).not.toHaveBeenCalled();
    });

    it('binds a new signal ref supplied via update', () => {
      const root = createTestRoot();
      const refA = signal<Element | null>(null);
      const refB = signal<Element | null>(null);
      const instance = createComponent(() => document.createElement('div'), {
        ref: refA,
      } as any) as any;
      instance.mount(root);
      const host = instance.firstChild;
      expect(refA.value).toBe(host);

      instance.update({ ref: refB } as any);
      expect(refB.value).toBe(host);
    });

    it('invokes a newly provided function ref on update', () => {
      const root = createTestRoot();
      const refA = vi.fn();
      const refB = vi.fn();
      const instance = createComponent(() => document.createElement('div'), {
        ref: refA,
      } as any) as any;
      instance.mount(root);
      expect(refA).toHaveBeenCalledWith(instance.firstChild);

      instance.update({ ref: refB } as any);
      expect(refB).toHaveBeenCalledWith(instance.firstChild);
    });

    it('replaces root event handlers on update without leaking previous listeners', () => {
      const root = createTestRoot();
      const handlerA = vi.fn();
      const handlerB = vi.fn();
      const instance = createComponent(() => document.createElement('button'), {
        onClick: handlerA,
      } as any) as any;

      instance.mount(root);
      instance.update({ onClick: handlerB } as any);

      (instance.firstChild as HTMLButtonElement).click();

      expect(handlerA).not.toHaveBeenCalled();
      expect(handlerB).toHaveBeenCalledTimes(1);
    });

    it('restores the previous signal ref when the root ref changes', () => {
      const root = createTestRoot();
      const refA = signal<Element | null>(null);
      const refB = signal<Element | null>(null);
      const instance = createComponent(() => document.createElement('div'), {
        ref: refA,
      } as any) as any;

      instance.mount(root);
      expect(refA.value).toBe(instance.firstChild);

      instance.update({ ref: refB } as any);

      expect(refA.value).toBeNull();
      expect(refB.value).toBe(instance.firstChild);
    });
  });

  // ── forceUpdate ──────────────────────────────────────────────────

  describe('forceUpdate', () => {
    it('destroys and remounts, re-running the component function', () => {
      const root = createTestRoot();
      const factory = vi.fn(() => {
        const el = document.createElement('div');
        el.textContent = 'x';
        return el;
      });
      const instance = createComponent(factory) as any;
      instance.mount(root);
      const firstScope = instance.scope;

      instance.forceUpdate();

      expect(factory).toHaveBeenCalledTimes(2);
      expect(instance.scope).not.toBe(firstScope);
      expect(firstScope.isDestroyed).toBe(true);
      expect(root.childNodes.length).toBe(1);
    });

    it('preserves reactiveProps descriptors across forceUpdate', () => {
      const root = createTestRoot();
      let capturedProps: any = null;

      const TestComp = (props: any) => {
        capturedProps = props;
        const span = document.createElement('span');
        span.textContent = props.name || '';
        return span;
      };

      const instance = createComponent(TestComp, { name: 'initial' }) as any;
      instance.mount(root);

      expect(capturedProps.name).toBe('initial');

      // Now forceUpdate
      instance.forceUpdate();

      // The props should still be preserved
      expect(capturedProps).toBe(instance.reactiveProps);
      expect(capturedProps.name).toBe('initial');
    });

    it('does nothing when never mounted', () => {
      const factory = vi.fn(() => document.createElement('div'));
      const instance = createComponent(factory) as any;
      expect(() => instance.forceUpdate()).not.toThrow();
      expect(factory).not.toHaveBeenCalled();
    });
  });

  // ── destroy ──────────────────────────────────────────────────────

  describe('destroy', () => {
    it('removes rendered nodes and clears bookkeeping', () => {
      const root = createTestRoot();
      const instance = createComponent(() => document.createElement('div')) as any;
      instance.mount(root);
      expect(root.childNodes.length).toBe(1);

      instance.destroy();

      expect(root.childNodes.length).toBe(0);
      expect(instance.scope).toBeNull();
      expect(instance.renderedNodes).toEqual([]);
      expect(instance.firstChild).toBeUndefined();
    });

    it('runs onDestroy exactly once even when called repeatedly', () => {
      const root = createTestRoot();
      const hook = vi.fn();
      const Comp = () => {
        onDestroy(hook);
        return document.createElement('div');
      };
      const instance = createComponent(Comp) as any;
      instance.mount(root);
      instance.destroy();
      instance.destroy();
      expect(hook).toHaveBeenCalledTimes(1);
    });

    it('is a no-op when never mounted', () => {
      const instance = createComponent(() => document.createElement('div')) as any;
      expect(() => instance.destroy()).not.toThrow();
    });
  });
});
