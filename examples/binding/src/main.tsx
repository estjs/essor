import { createApp } from 'essor';

function App() {
  const $name = 'Essor';
  const $age = 21;
  const $subscribed = false;
  const $theme = 'day';
  const $focusAreas = ['signals'] as string[];
  const $progress = 45;
  let $files: FileList | null = null;

  const summary = () =>
    JSON.stringify(
      {
        name: $name,
        age: $age,
        subscribed: $subscribed,
        theme: $theme,
        focusAreas: [...$focusAreas],
        progress: Number($progress),
        fileCount: $files?.length ?? 0,
      },
      null,
      2,
    );

  return (
    <main data-test="example-root" class="page">
      <h1>Binding Example</h1>
      <p class="note">Text, number, checkbox, select, range, and file bindings.</p>

      <section class="stack">
        <label>
          <span>Name</span>
          <input bind:value={[$name, { trim: true }]} placeholder="Profile name" />
        </label>

        <label>
          <span>Age</span>
          <input bind:value={[$age, { number: true }]} placeholder="Age" />
        </label>

        <label>
          <span>Subscribe to release notes</span>
          <input type="checkbox" bind:checked={$subscribed} />
        </label>

        <label>
          <span>Theme</span>
          <select bind:value={$theme}>
            <option value="day">Day</option>
            <option value="night">Night</option>
            <option value="contrast">Contrast</option>
          </select>
        </label>

        <label>
          <span>Focus areas</span>
          <select bind:value={$focusAreas} multiple size={4}>
            <option value="signals">Signals</option>
            <option value="portal">Portal</option>
            <option value="hydrate">Hydrate</option>
            <option value="suspense">Suspense</option>
          </select>
        </label>

        <label>
          <span>Progress</span>
          <input type="range" min="0" max="100" bind:value={[$progress, { number: true }]} />
        </label>

        <label>
          <span>Attachments</span>
          <input
            type="file"
            multiple
            bind:files={$files}
            onChange={(event) => ($files = (event.target as HTMLInputElement).files)}
          />
        </label>

        <p data-test="binding-signature">{`${$name || 'Anonymous'} · ${String($age)}`}</p>
        <pre data-test="binding-summary">{summary()}</pre>
      </section>
    </main>
  );
}

createApp(App, '#app');
