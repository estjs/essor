import { computed, hydrate, onMount } from 'essor';

type View = 'overview' | 'logs';

function App() {
  let $hydrated = false;
  let $view = 'overview' as View;
  let $draft = '';

  const preview = computed(() => $draft.trim() || 'No draft yet');
  const status = computed(() => ($hydrated ? 'hydrated client' : 'server shell'));

  onMount(() => {
    $hydrated = true;
  });

  return (
    <main data-test="example-root" class="page">
      <h1>Hydrate Example</h1>
      <p class="note">A static shell becomes interactive after hydration.</p>

      <section class="stack">
        <p>
          Status:{' '}
          <strong data-test="hydration-status">
            <span>{status.value}</span>
          </strong>
        </p>
        <p>
          Preview:{' '}
          <strong data-test="draft-preview">
            <span>{preview.value}</span>
          </strong>
        </p>

        <div class="row">
          <button aria-pressed={$view === 'overview'} onClick={() => ($view = 'overview')}>
            Show overview
          </button>
          <button aria-pressed={$view === 'logs'} onClick={() => ($view = 'logs')}>
            Show logs
          </button>
          <button onClick={() => ($draft = 'Ship the client bundle')}>Load note</button>
          <button onClick={() => ($draft = '')}>Clear note</button>
        </div>

        <section class="stack" data-test="overview-view" hidden={$view !== 'overview'}>
          <h2>Overview</h2>
          <p>The server and client render the same shell.</p>
        </section>

        <section class="stack" data-test="logs-view" hidden={$view !== 'logs'}>
          <h2>Logs</h2>
          <ul>
            <li>The shell loads first.</li>
            <li>Event listeners attach after hydration.</li>
            <li>The same DOM keeps working after state changes.</li>
          </ul>
        </section>
      </section>
    </main>
  );
}

hydrate(App, '#app');
