import { batch, computed, createApp, signal } from 'essor';

function App() {
  const name = signal('Essor');
  const count = signal(0);

  const greeting = computed(() => `Hello, ${name.value || 'anonymous'}`);
  const signature = computed(() => {
    const current = name.value;
    return current
      ? `${current.toUpperCase()} · ${current.length} letters`
      : 'ANONYMOUS · 0 letters';
  });
  const double = computed(() => count.value * 2);
  const parity = computed(() => (count.value % 2 === 0 ? 'even' : 'odd'));

  const addFiveInBatch = () => {
    batch(() => {
      for (let step = 0; step < 5; step++) {
        count.value++;
      }
    });
  };

  return (
    <main data-test="example-root" class="page">
      <h1>Signals Example</h1>
      <p class="note">Signals, computed values, and batch updates.</p>

      <section class="stack">
        <label>
          <span>Name</span>
          <input
            type="text"
            value={name.value}
            placeholder="Type a name"
            oninput={(event) => (name.value = (event.target as HTMLInputElement).value)}
          />
        </label>
        <p data-test="greeting">{greeting.value}</p>
        <p data-test="signature">{signature.value}</p>
      </section>

      <section class="stack">
        <div class="row">
          <button onClick={() => count.value++}>Increment</button>
          <button onClick={addFiveInBatch}>Add 5 in batch</button>
          <button onClick={() => (count.value = 0)}>Reset</button>
        </div>
        <p>
          Count: <strong data-test="count">{count.value}</strong>
        </p>
        <p>
          Double: <strong data-test="double">{double.value}</strong>
        </p>
        <p>
          Parity: <strong data-test="parity">{parity.value}</strong>
        </p>
      </section>
    </main>
  );
}

createApp(App, '#app');
