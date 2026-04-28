import { Portal, createApp, signal } from 'essor';

/**
 * Portal CSR demo. Exercises every public branch of the client `Portal`
 * component so the e2e suite at `e2e/portal.spec.ts` can drive it:
 *
 *   - default target (`#portal-target`)
 *   - `disabled` toggle re-mounts inline next to `#origin`
 *   - reactive `target` switch moves children to `#alt-target`
 *   - reactive children stay live across all of the above transitions
 */
function App() {
  const value = signal('Hello, World!');
  const disabled = signal(false);
  const useAlt = signal(false);

  return (
    <div id="app-root">
      <h1>Essor Portal example</h1>

      <section id="controls">
        <input
          data-test="value-input"
          type="text"
          value={value.value}
          onInput={(e) => (value.value = (e.target as HTMLInputElement).value)}
        />
        <button data-test="toggle-disabled" onClick={() => (disabled.value = !disabled.value)}>
          disabled: {disabled.value ? 'true' : 'false'}
        </button>
        <button data-test="toggle-target" onClick={() => (useAlt.value = !useAlt.value)}>
          target: {useAlt.value ? '#alt-target' : '#portal-target'}
        </button>
      </section>

      <section id="origin">
        <span data-test="origin-marker">origin</span>
        <Portal
          target={() => (useAlt.value ? '#alt-target' : '#portal-target')}
          disabled={() => disabled.value}>
          <p data-test="portal-content">{value.value}</p>
        </Portal>
      </section>

      <section id="portal-target">
        <span>primary target</span>
      </section>

      <section id="alt-target">
        <span>alt target</span>
      </section>
    </div>
  );
}

createApp(App, '#app');
