import { NOTE_COPY } from './config';
import { CounterPanel } from './components/CounterPanel';
import { ModuleInspector } from './components/ModuleInspector';
import { recordAppHotUpdate } from './hmr-lifecycle';

recordAppHotUpdate(import.meta.hot);

export function App() {
  return (
    <main data-test="example-root" class="page">
      <h1>HMR Example</h1>
      <p class="note" data-test="hmr-note">
        {NOTE_COPY}
      </p>

      <CounterPanel />
      <ModuleInspector />
    </main>
  );
}
