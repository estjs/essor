import { createApp } from 'essor';

const DEMO_VERSION = '2026.04';

function App() {
  let $count = 0;

  return (
    <main data-test="example-root" class="page">
      <h1>HMR Example</h1>
      <p class="note" data-test="hmr-note">
        State survives hot updates while the module content refreshes.
      </p>

      <section class="stack">
        <h2>Stateful Counter</h2>
        <div class="row">
          <button onClick={() => $count--}>Decrement</button>
          <button onClick={() => $count++}>Increment</button>
        </div>
        <p data-test="hmr-count">{$count}</p>
      </section>

      <section class="stack">
        <h2>Module Inspector</h2>
        <p data-test="hmr-version">Version: {DEMO_VERSION}</p>
      </section>
    </main>
  );
}

createApp(App, '#app');
