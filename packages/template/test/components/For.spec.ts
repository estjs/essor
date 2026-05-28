import { effect, signal } from '@estjs/signals';
import { For } from '../../src/components/For';
import { createComponent } from '../../src/component';
import { onCleanup as onCleanupFromTestScope } from '../../src/scope';
import { mount, resetEnvironment, unmount } from '../test-utils';
import type { Scope } from '../../src/scope';

describe('for component', () => {
  let container: HTMLElement;
  let scope: Scope | null = null;

  beforeEach(() => {
    resetEnvironment();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (scope) {
      unmount(scope);
      scope = null;
    }
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  it('toggles fallback correctly', async () => {
    const $items = signal<number[]>([]);

    scope = mount(
      () =>
        For({
          each: $items,
          fallback: () => {
            const empty = document.createElement('p');
            empty.textContent = 'empty';
            return empty;
          },
          children: (item) => {
            const div = document.createElement('div');
            div.textContent = String(item);
            return div;
          },
        }),
      container,
    );

    expect(container.textContent).toBe('empty');

    $items.value = [1, 2, 3];
    await Promise.resolve();
    expect(container.textContent).toBe('123');

    $items.value = [];
    await Promise.resolve();
    expect(container.textContent).toBe('empty');
  });

  it('reorders keyed multi-node rows as a single block', async () => {
    const $items = signal([
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
    ]);

    scope = mount(
      () =>
        For({
          each: $items,
          key: (item) => item.id,
          children: (item) => {
            const head = document.createElement('span');
            head.textContent = `${item.label}h`;
            const tail = document.createElement('span');
            tail.textContent = `${item.label}t`;
            return [head, tail];
          },
        }),
      container,
    );

    const textList = () =>
      Array.from(container.querySelectorAll('span')).map((node) => node.textContent);

    expect(textList()).toEqual(['Ah', 'At', 'Bh', 'Bt', 'Ch', 'Ct']);

    $items.value = [
      { id: 'c', label: 'C' },
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ];
    await Promise.resolve();
    expect(textList()).toEqual(['Ch', 'Ct', 'Ah', 'At', 'Bh', 'Bt']);

    $items.value = [
      { id: 'c', label: 'C' },
      { id: 'b', label: 'B' },
    ];
    await Promise.resolve();
    expect(textList()).toEqual(['Ch', 'Ct', 'Bh', 'Bt']);
  });

  it('passes item index to key functions', async () => {
    const $items = signal([
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ]);
    const keyCalls: Array<[string, number]> = [];

    scope = mount(
      () =>
        For({
          each: $items,
          key: (item, index) => {
            keyCalls.push([item.id, index]);
            return item.id;
          },
          children: (item) => {
            const div = document.createElement('div');
            div.textContent = item.label;
            return div;
          },
        }),
      container,
    );

    expect(keyCalls).toEqual([
      ['a', 0],
      ['b', 1],
    ]);

    keyCalls.length = 0;
    $items.value = [
      { id: 'b', label: 'B' },
      { id: 'a', label: 'A' },
    ];
    await Promise.resolve();

    expect(keyCalls).toEqual([
      ['b', 0],
      ['a', 1],
    ]);
  });

  it('refreshes row content when key is stable but item object changes', async () => {
    // With keyed reconciliation, the same key == same logical row, so the
    // DOM node and its owning scope are preserved across updates. Row
    // content updates happen via reactive bindings inside renderFn —
    // here an `effect()` that reads `item.label` from the latest entry.
    const $items = signal([{ id: 'x', label: 'old' }]);
    let latestItem = $items.value[0];

    scope = mount(
      () =>
        For({
          each: $items,
          key: (item) => item.id,
          children: (item) => {
            const div = document.createElement('div');
            // Track the latest item reference; the effect pulls from it
            // so label changes flow into the DOM without re-rendering.
            latestItem = item;
            effect(() => {
              div.textContent = latestItem.label;
            });
            return div;
          },
        }),
      container,
    );

    expect(container.textContent).toBe('old');

    // Mutate the existing item reference — triggers reactive binding.
    latestItem.label = 'new';
    $items.value = [latestItem];
    await Promise.resolve();

    expect(container.textContent).toBe('new');
  });

  it('recreates keyed rows when the key stays stable but the item identity changes', async () => {
    const $items = signal([{ id: 'x', label: 'old' }]);

    scope = mount(
      () =>
        For({
          each: $items,
          key: (item) => item.id,
          children: (item) => {
            const div = document.createElement('div');
            effect(() => {
              div.textContent = item.label;
            });
            return div;
          },
        }),
      container,
    );

    await Promise.resolve();
    expect(container.textContent).toBe('old');

    $items.value = [{ id: 'x', label: 'new' }];
    await Promise.resolve();

    expect(container.textContent).toBe('new');
  });

  it('refreshes multi-node row content when key is stable but item object changes', async () => {
    // Same contract as the single-node case: reuse nodes, update via effect.
    const $items = signal([{ id: 'x', label: 'old' }]);
    let latestItem = $items.value[0];

    scope = mount(
      () =>
        For({
          each: $items,
          key: (item) => item.id,
          children: (item) => {
            const head = document.createElement('span');
            const tail = document.createElement('span');
            latestItem = item;
            effect(() => {
              head.textContent = `${latestItem.label}-head`;
              tail.textContent = `${latestItem.label}-tail`;
            });
            return [head, tail];
          },
        }),
      container,
    );

    expect(container.textContent).toBe('old-headold-tail');

    latestItem.label = 'new';
    $items.value = [latestItem];
    await Promise.resolve();

    expect(container.textContent).toBe('new-headnew-tail');
  });

  it('updates by index when no key is provided', async () => {
    const $items = signal(['a', 'b']);

    scope = mount(
      () =>
        For({
          each: $items,
          children: (item) => {
            const div = document.createElement('div');
            div.textContent = item;
            return div;
          },
        }),
      container,
    );

    expect(container.textContent).toBe('ab');

    $items.value = ['x', 'y', 'z'];
    await Promise.resolve();
    expect(container.textContent).toBe('xyz');

    $items.value = ['m'];
    await Promise.resolve();
    expect(container.textContent).toBe('m');
  });

  it('cleans up multi-node fallback content when switching to rendered rows', async () => {
    const $items = signal<number[]>([]);

    scope = mount(
      () =>
        For({
          each: $items,
          fallback: () => {
            const first = document.createElement('span');
            first.textContent = 'A';
            const second = document.createElement('span');
            second.textContent = 'B';
            return [first, second];
          },
          children: (item) => {
            const div = document.createElement('div');
            div.textContent = String(item);
            return div;
          },
        }),
      container,
    );

    await Promise.resolve();
    expect(container.textContent).toBe('AB');

    $items.value = [1];
    await Promise.resolve();

    expect(container.textContent).toBe('1');
  });

  it('cleans marker and item ranges on scope dispose', async () => {
    const $items = signal([1, 2]);

    scope = mount(
      () =>
        For({
          each: $items,
          children: (item) => {
            const div = document.createElement('div');
            div.textContent = String(item);
            return div;
          },
        }),
      container,
    );

    await Promise.resolve();
    expect(container.childNodes.length).toBeGreaterThan(0);

    unmount(scope);
    scope = null;

    expect(container.childNodes.length).toBe(0);
  });

  it('cleans all multi-node item ranges on scope dispose', async () => {
    const $items = signal([
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ]);

    scope = mount(
      () =>
        For({
          each: () => $items.value,
          key: (item) => item.id,
          children: (item) => {
            const head = document.createElement('span');
            head.textContent = `${item.label}h`;
            const tail = document.createElement('span');
            tail.textContent = `${item.label}t`;
            return [head, tail];
          },
        }),
      container,
    );

    await Promise.resolve();
    expect(container.querySelectorAll('span').length).toBe(4);

    unmount(scope);
    scope = null;

    expect(container.childNodes.length).toBe(0);
  });
  // it should work with reactive data object update
  it('should work with reactive data object update', async () => {
    const $items = signal([{ id: 'a', label: 'A' }]);

    scope = mount(
      () =>
        For({
          get each() {
            return $items.value;
          },
          key: (item) => item.id,
          children: (item) => {
            const div = document.createElement('div');
            // Use effect to create a reactive binding, like compiled _insert$ does
            effect(() => {
              div.textContent = item.label;
            });
            return div;
          },
        }),
      container,
    );

    await Promise.resolve();
    expect(container.textContent).toBe('A');

    $items.value[0].label = 'C';
    await Promise.resolve();
    expect(container.textContent).toBe('C');
  });

  it('should perfectly simulate benchmark update every 10th row', async () => {
    // 1. Setup the exact same structure as the benchmark
    const data = signal(Array.from({ length: 25 }, (_, i) => ({ id: i, label: `Row ${i}` })));

    let renderCount = 0;

    scope = mount(
      () =>
        For({
          get each() {
            return data.value;
          },
          key: (item: any) => item.id,
          children: (item: any) => {
            renderCount++;
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            // This is exactly what the Babel plugin outputs: _insert$(..., () => props.item.label)
            // It creates a binding for the label property
            // _insert$ internally wraps the function in an effect
            effect(() => {
              td.textContent = item.label;
            });
            tr.appendChild(td);
            return tr;
          },
        }),
      container,
    );

    // Initial mount check
    await Promise.resolve();
    expect(renderCount).toBe(25);
    const rows = container.querySelectorAll('tr');
    expect(rows.length).toBe(25);
    expect(rows[0].textContent).toBe('Row 0');
    expect(rows[10].textContent).toBe('Row 10');

    // 2. Simulate "Update every 10th row"
    for (let i = 0; i < data.value.length; i += 10) {
      // Must mutate via data.value to trigger the proxy!
      data.value[i].label += ' !!!';
    }

    await Promise.resolve();

    // 3. Verify exactly how the dom changes
    const updatedRows = container.querySelectorAll('tr');
    expect(updatedRows[0].textContent).toBe('Row 0 !!!');
    expect(updatedRows[1].textContent).toBe('Row 1');
    expect(updatedRows[10].textContent).toBe('Row 10 !!!');
    expect(updatedRows[20].textContent).toBe('Row 20 !!!');

    // 4. Verify that Row rendering function was NOT run again! (i.e. we correctly reused everything and just re-ran effects)
    expect(renderCount).toBe(25);
  });

  // ---------------------------------------------------------------------------
  // Component children
  //
  // The For renderer added support for rows that return a Component instance
  // (e.g. `<For>{(item) => <Row item={item}/>}</For>` after Babel transform).
  // These tests pin the contract:
  //   1. Initial mount renders the component's DOM in order.
  //   2. Reorder via key reuses the mounted instances (no remount) and the DOM
  //      order matches.
  //   3. Removing a row destroys the component scope so onCleanup runs.
  // ---------------------------------------------------------------------------
  describe('component children', () => {
    it('mounts each row through Component.mount and renders DOM in order', () => {
      const items = signal([1, 2, 3]);
      const Row = (props: { value: number }) => {
        const div = document.createElement('div');
        div.className = 'row';
        div.textContent = `r${props.value}`;
        return div;
      };

      scope = mount(
        () =>
          For({
            each: items,
            key: (v) => v,
            children: (v) => createComponent(Row, { value: v }),
          }),
        container,
      );

      const rows = container.querySelectorAll('.row');
      expect(rows.length).toBe(3);
      expect([...rows].map((n) => n.textContent)).toEqual(['r1', 'r2', 'r3']);
    });

    it('reorder reuses component instances and only moves their DOM', async () => {
      const items = signal([1, 2, 3]);
      const renderCalls: number[] = [];
      const Row = (props: { value: number }) => {
        renderCalls.push(props.value);
        const div = document.createElement('div');
        div.className = 'row';
        div.textContent = `r${props.value}`;
        return div;
      };

      scope = mount(
        () =>
          For({
            each: items,
            key: (v) => v,
            children: (v) => createComponent(Row, { value: v }),
          }),
        container,
      );

      const initialNodes = [...container.querySelectorAll('.row')];
      expect(renderCalls).toEqual([1, 2, 3]);

      items.value = [3, 1, 2];
      await Promise.resolve();

      const afterNodes = [...container.querySelectorAll('.row')];
      expect(afterNodes.map((n) => n.textContent)).toEqual(['r3', 'r1', 'r2']);
      // Same instances reused — no second Row() render call
      expect(renderCalls).toEqual([1, 2, 3]);
      // Node identity preserved (reused, not recreated)
      expect(afterNodes.includes(initialNodes[0])).toBe(true);
      expect(afterNodes.includes(initialNodes[1])).toBe(true);
      expect(afterNodes.includes(initialNodes[2])).toBe(true);
    });

    it('removing a row disposes the row scope so onCleanup runs', async () => {
      const items = signal([1, 2]);
      const cleanups: number[] = [];
      const Row = (props: { value: number }) => {
        // Register a cleanup on the row's scope (the active scope when the
        // component renders is the per-row For scope)
        onCleanupFromTestScope(() => cleanups.push(props.value));
        const div = document.createElement('div');
        div.textContent = `r${props.value}`;
        return div;
      };

      scope = mount(
        () =>
          For({
            each: items,
            key: (v) => v,
            children: (v) => createComponent(Row, { value: v }),
          }),
        container,
      );

      items.value = [2];
      await Promise.resolve();
      expect(cleanups).toEqual([1]);
    });

  });

  // ---------------------------------------------------------------------------
  // Mixed / edge-case children
  //
  // The single-pass `mount` helper accepts arrays of arbitrary depth, mixed
  // Component + Element children, falsy short-circuits, and very large
  // reorders. These tests pin the boundaries.
  // ---------------------------------------------------------------------------
  describe('mixed / edge-case children', () => {
    it('handles nested arrays in children() (recursive walk)', async () => {
      const items = signal([1, 2]);
      scope = mount(
        () =>
          For({
            each: items,
            key: (n) => n,
            children: (n) => {
              // Children returns an array of [Element, Element] — a shape the
              // babel transform produces for compound expressions.
              const a = document.createElement('span');
              a.className = 'a';
              a.textContent = `a${n}`;
              const b = document.createElement('span');
              b.className = 'b';
              b.textContent = `b${n}`;
              return [a, b];
            },
          }),
        container,
      );

      expect([...container.querySelectorAll('span')].map((s) => s.textContent)).toEqual([
        'a1',
        'b1',
        'a2',
        'b2',
      ]);
    });

    it('skips null/false children without inserting nodes', async () => {
      const items = signal([1, 2, 3]);
      scope = mount(
        () =>
          For({
            each: items,
            key: (n) => n,
            children: (n) => {
              if (n === 2) return null as any;
              const div = document.createElement('div');
              div.textContent = String(n);
              return div;
            },
          }),
        container,
      );
      const text = container.textContent ?? '';
      expect(text.includes('1')).toBe(true);
      expect(text.includes('3')).toBe(true);
      // No DOM node was inserted for n=2
      expect(container.querySelectorAll('div').length).toBe(2);
    });

    it('mixes Component and Element rows in the same list', async () => {
      const items = signal([1, 2, 3, 4]);
      const Row = (props: { value: number }) => {
        const div = document.createElement('div');
        div.className = 'cmp';
        div.textContent = `c${props.value}`;
        return div;
      };
      scope = mount(
        () =>
          For({
            each: items,
            key: (n) => n,
            children: (n) =>
              n % 2 === 0
                ? createComponent(Row, { value: n })
                : (() => {
                    const div = document.createElement('div');
                    div.className = 'el';
                    div.textContent = `e${n}`;
                    return div;
                  })(),
          }),
        container,
      );

      const all = [...container.querySelectorAll('div')];
      expect(all.length).toBe(4);
      expect(all.map((d) => d.textContent)).toEqual(['e1', 'c2', 'e3', 'c4']);
      expect(all[0].className).toBe('el');
      expect(all[1].className).toBe('cmp');
    });

    it('handles a large keyed shuffle (50 items) with identity preservation', async () => {
      const initial = Array.from({ length: 50 }, (_, i) => ({ id: i, label: `i${i}` }));
      const items = signal(initial);
      scope = mount(
        () =>
          For({
            each: items,
            key: (it) => it.id,
            children: (it) => {
              const div = document.createElement('div');
              div.setAttribute('data-id', String(it.id));
              div.textContent = it.label;
              return div;
            },
          }),
        container,
      );

      const before = new Map<number, Element>();
      for (const el of container.querySelectorAll('[data-id]')) {
        before.set(Number(el.getAttribute('data-id')), el);
      }
      expect(before.size).toBe(50);

      // Deterministic shuffle: reverse the list.
      items.value = [...initial].reverse();
      await Promise.resolve();

      const after = [...container.querySelectorAll('[data-id]')];
      expect(after.length).toBe(50);
      // Order should now be reversed.
      expect(after.map((el) => Number(el.getAttribute('data-id')))).toEqual(
        Array.from({ length: 50 }, (_, i) => 49 - i),
      );
      // Every element identity is preserved — no remount.
      for (const el of after) {
        const id = Number(el.getAttribute('data-id'));
        expect(el).toBe(before.get(id));
      }
    });

    it('toggles fallback ↔ items, then back, without leaking nodes', async () => {
      const items = signal<number[]>([]);
      scope = mount(
        () =>
          For({
            each: items,
            key: (n) => n,
            fallback: () => {
              const p = document.createElement('p');
              p.textContent = 'empty';
              return p;
            },
            children: (n) => {
              const div = document.createElement('div');
              div.textContent = String(n);
              return div;
            },
          }),
        container,
      );

      expect(container.textContent).toBe('empty');

      items.value = [1, 2];
      await Promise.resolve();
      expect(container.querySelector('p')).toBeNull();
      expect(container.querySelectorAll('div').length).toBe(2);

      items.value = [];
      await Promise.resolve();
      expect(container.textContent).toBe('empty');
      expect(container.querySelectorAll('div').length).toBe(0);

      items.value = [3, 4, 5];
      await Promise.resolve();
      expect(container.querySelector('p')).toBeNull();
      expect(container.querySelectorAll('div').length).toBe(3);
    });

    it('replaces an entry whose key matches but identity differs (re-render path)', async () => {
      // When `key` returns the same value but the item changed by `Object.is`,
      // the entry must be torn down and re-rendered (per the existing fast
      // path in reconcile).
      let mountCount = 0;
      const items = signal([{ id: 1, v: 'a' }]);
      scope = mount(
        () =>
          For({
            each: items,
            key: (it) => it.id,
            children: (it) => {
              mountCount++;
              const div = document.createElement('div');
              div.textContent = it.v;
              return div;
            },
          }),
        container,
      );
      expect(mountCount).toBe(1);
      expect(container.textContent).toBe('a');

      items.value = [{ id: 1, v: 'b' }];
      await Promise.resolve();
      // Same key, different identity → remount.
      expect(mountCount).toBe(2);
      expect(container.textContent).toBe('b');
    });

    it('throws TypeError when children is not a function (after array unwrap)', () => {
      // The babel pipeline unwraps a 1-element function array, but anything
      // else (a raw value, a 2-element array, an empty array) is a misuse
      // and should fail loudly at construction rather than mid-effect.
      expect(() =>
        For({
          each: [1, 2],
          // Plain value — not a function, not an unwrappable array.
          children: 'oops' as any,
        }),
      ).toThrow(TypeError);
    });
  });
});
