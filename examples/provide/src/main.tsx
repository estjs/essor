import { createApp, inject, provide, reactive } from 'essor';

const ThemeKey = Symbol('theme');
const CounterKey = Symbol('counter');

function Consumer({ slot }: { slot: 'root' | 'nested' }) {
  const theme = inject<{ name: string }>(ThemeKey, { name: 'missing' })!;
  const counter = inject<{ count: number }>(CounterKey, reactive({ count: -1 }))!;

  return (
    <div class="box stack">
      <h2>{slot === 'root' ? 'Root consumer' : 'Nested consumer'}</h2>
      <p>
        Theme: <strong data-test={`${slot}-theme`}>{theme.name}</strong>
      </p>
      <p>
        Shared count: <strong data-test={`${slot}-count`}>{counter.count}</strong>
      </p>
    </div>
  );
}

function NestedScope() {
  return <Consumer slot="nested" />;
}

function App() {
  const counter = reactive({ count: 0 });

  provide(CounterKey, counter);
  provide(ThemeKey, { name: 'ocean' });

  return (
    <main data-test="example-root" class="page">
      <h1>Provide Example</h1>
      <p class="note">Provide once, read the same state in multiple components.</p>

      <section class="stack">
        <div class="row">
          <button onClick={() => counter.count++}>Increment shared count</button>
        </div>
        <Consumer slot="root" />
        <NestedScope />
      </section>
    </main>
  );
}

createApp(App, '#app');
