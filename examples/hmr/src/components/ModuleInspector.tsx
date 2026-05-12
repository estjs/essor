import { computed } from 'essor';
import { DEMO_VERSION, MODULE_BADGE, MODULE_LABEL } from '../config';
import { demoState } from '../state';
import { UNMOUNTED_SENTINEL } from './UnmountedSentinel';

const moduleSummary = computed(() => `${MODULE_LABEL} · ${MODULE_BADGE} · ${UNMOUNTED_SENTINEL}`);

export function ModuleInspector() {
  return (
    <section class="stack" data-test="hmr-module-panel">
      <h2>Module Inspector</h2>
      <p data-test="hmr-version">Version: {DEMO_VERSION}</p>
      <p data-test="hmr-module-label">Module: {MODULE_LABEL}</p>
      <p data-test="hmr-module-badge">Badge: {MODULE_BADGE}</p>
      <p data-test="hmr-module-summary">Summary: {moduleSummary.value}</p>
      <p data-test="hmr-update-count">Hot updates: {demoState.updates.value}</p>
    </section>
  );
}
