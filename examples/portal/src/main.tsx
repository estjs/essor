import { Portal, createApp } from 'essor';

function App() {
  const $note = 'Launch checklist';
  let $inline = false;
  let $secondary = false;

  return (
    <main data-test="example-root" class="page">
      <h1>Portal Example</h1>
      <p class="note">Move one reactive block between two targets or back inline.</p>

      <section class="stack">
        <label>
          <span>Note</span>
          <input aria-label="Note" bind:value={$note} />
        </label>

        <div class="row">
          <button onClick={() => ($inline = !$inline)}>
            {$inline ? 'Render off-site' : 'Render inline'}
          </button>
          <button onClick={() => ($secondary = !$secondary)}>
            {$secondary ? 'Move to primary target' : 'Move to secondary target'}
          </button>
        </div>
      </section>

      <section class="stack">
        <div id="origin-panel" class="stack">
          <h2>Origin panel</h2>
          <Portal
            target={() => ($secondary ? '#secondary-target' : '#primary-target')}
            disabled={() => $inline}>
            <div class="box" data-test="portal-card">
              <p data-test="portal-text">{$note}</p>
            </div>
          </Portal>
        </div>

        <div id="primary-target" class="portal-target">
          <h2>Primary target</h2>
        </div>

        <div id="secondary-target" class="portal-target">
          <h2>Secondary target</h2>
        </div>
      </section>
    </main>
  );
}

createApp(App, '#app');
