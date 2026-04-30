import { effect, signal } from '@estjs/signals';
import { For } from '../../src/components/For';
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
});
