import { For, createApp } from 'essor';

interface Item {
  id: number;
  label: string;
}

/**
 * Module-level monotonic counter used to stamp each row element exactly once,
 * at DOM-node creation time (via the `ref` callback). If a node is reused by
 * the keyed <For> reconciler, its stamp survives; if a node is recreated
 * (like every row of the `.map()` list), it receives a fresh, larger stamp.
 */
let mountCounter = 0;

function stampMountedAt(el: HTMLElement) {
  el.dataset.mountedAt = String(++mountCounter);
}

function App() {
  const $items: Item[] = [
    { id: 1, label: 'Alpha' },
    { id: 2, label: 'Beta' },
    { id: 3, label: 'Gamma' },
    { id: 4, label: 'Delta' },
  ];
  let nextId = 5;

  const add = () => {
    $items.push({ id: nextId, label: `Item ${nextId}` });
    nextId++;
  };

  const prepend = () => {
    $items.unshift({ id: nextId, label: `Item ${nextId}` });
    nextId++;
  };

  const remove = () => {
    $items.pop();
  };

  /**
   * Replace every item with a NEW object (same id, refreshed label).
   * NOTE: <For> matches rows by key(item) but ALSO checks object identity
   * (Object.is) — a same-key/new-identity item is deliberately re-rendered
   * so its row scope re-runs with the new data. So on "Refresh labels" BOTH
   * lists rebuild their rows. The lists differ on REORDERS of the same
   * objects: watch the stamps stay put under Shuffle in both, but <For>
   * additionally gives per-row scopes, keyed LIS moves, and a fallback.
   */
  const refresh = () => {
    const next = $items.map((item) => ({ id: item.id, label: `${item.label}*` }));
    $items.splice(0, $items.length, ...next);
  };

  const shuffle = () => {
    if ($items.length < 2) return;
    const current = $items.slice();
    let next = current;
    // Fisher–Yates, retried until the order actually changes so a single
    // click always produces a visible reorder.
    do {
      next = [...current];
      for (let i = next.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
      }
    } while (next.every((item, index) => item === current[index]));
    $items.splice(0, $items.length, ...next);
  };

  return (
    <main data-test="example-root" class="page">
      <h1>For List Example</h1>
      <p class="note">
        Keyed <code>&lt;For&gt;</code> reuses DOM nodes on reorder; plain <code>.map()</code>{' '}
        rebuilds every row. Each row is stamped with <code>data-mounted-at</code> when its DOM node
        is created.
      </p>

      <section class="row">
        <button data-test="add" onClick={add}>
          Add
        </button>
        <button data-test="prepend" onClick={prepend}>
          Prepend
        </button>
        <button data-test="remove" onClick={remove}>
          Remove
        </button>
        <button data-test="shuffle" onClick={shuffle}>
          Shuffle
        </button>
        <button data-test="refresh" onClick={refresh}>
          Refresh labels
        </button>
      </section>

      <section class="columns" style={{ display: 'flex', gap: '2rem' }}>
        <div class="stack">
          <h2>
            Keyed <code>&lt;For&gt;</code>
          </h2>
          <ul data-test="for-list">
            <For
              each={$items}
              key={(item) => item.id}
              fallback={() => <li data-test="for-empty">No items</li>}>
              {(item) => (
                <li data-test="for-row" ref={stampMountedAt}>
                  {item.label}
                </li>
              )}
            </For>
          </ul>
        </div>

        <div class="stack">
          <h2>
            Plain <code>.map()</code>
          </h2>
          <ul data-test="map-list">
            {$items.map((item) => (
              <li data-test="map-row" ref={stampMountedAt}>
                {item.label}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}

createApp(App, '#app');
