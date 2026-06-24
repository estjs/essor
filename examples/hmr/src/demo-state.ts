import { signal } from 'essor';
import { getHotApi } from './hot-api';

type HMRWorkbenchState = {
  count: ReturnType<typeof signal<number>>;
  updates: ReturnType<typeof signal<number>>;
  lastAction: ReturnType<typeof signal<string>>;
};

type HMRWorkbenchHotData = {
  workbenchState?: HMRWorkbenchState;
};

declare global {
  interface Window {
    __essorHmrUpdateCount?: number;
    __essorHmrUpdateAt?: number;
  }
}

const hot = getHotApi<HMRWorkbenchHotData>(import.meta);

export const workbenchState =
  hot?.data?.workbenchState ??
  ({
    count: signal(0),
    updates: signal(0),
    lastAction: signal('Ready'),
  } satisfies HMRWorkbenchState);

let pendingRuntimeUpdate: ReturnType<typeof setTimeout> | undefined;

function recordRuntimeUpdate() {
  pendingRuntimeUpdate = undefined;
  workbenchState.updates.value += 1;
  workbenchState.lastAction.value = 'Hot update applied';
  window.__essorHmrUpdateCount = (window.__essorHmrUpdateCount ?? 0) + 1;
  window.__essorHmrUpdateAt = performance.now();
}

function onEssorHotUpdate() {
  if (pendingRuntimeUpdate) {
    clearTimeout(pendingRuntimeUpdate);
  }

  // A source edit can update several HMR component boundaries in one tick.
  pendingRuntimeUpdate = setTimeout(recordRuntimeUpdate, 25);
}

if (typeof window !== 'undefined') {
  window.addEventListener('essor:hmr-update', onEssorHotUpdate);
}

hot?.dispose?.((data) => {
  data.workbenchState = workbenchState;

  if (typeof window !== 'undefined') {
    window.removeEventListener('essor:hmr-update', onEssorHotUpdate);
  }

  if (pendingRuntimeUpdate) {
    clearTimeout(pendingRuntimeUpdate);
    pendingRuntimeUpdate = undefined;
  }
});
