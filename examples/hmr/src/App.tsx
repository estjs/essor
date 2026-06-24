import { WORKBENCH_NOTE, WORKBENCH_VERSION } from './demo-content';
import { CounterWorkbench, ModuleBoundaryPanel } from './components/CounterWorkbench';

export function App() {
  return (
    <main data-test="example-root" class="page">
      <h1>HMR Workbench</h1>
      <p class="note" data-test="hmr-note">
        {WORKBENCH_NOTE}
      </p>
      <p data-test="hmr-version">Version: {WORKBENCH_VERSION}</p>

      <CounterWorkbench />
      <ModuleBoundaryPanel />
    </main>
  );
}
