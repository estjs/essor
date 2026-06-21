import { demoState } from './state';

type AppHotData = {
  hasRendered?: boolean;
};

declare global {
  interface Window {
    __essorHmrUpdateCount?: number;
    __essorViteAfterUpdateCount?: number;
    __essorViteAfterUpdateAt?: number;
  }
}

export function recordAppHotUpdate(hot: ImportMeta['hot']) {
  const data = hot?.data as AppHotData | undefined;

  if (data?.hasRendered) {
    demoState.updates.value += 1;
    demoState.lastAction.value = 'Hot update applied';
    window.__essorHmrUpdateCount = (window.__essorHmrUpdateCount ?? 0) + 1;
  }

  hot?.on('vite:afterUpdate', () => {
    window.__essorViteAfterUpdateCount = (window.__essorViteAfterUpdateCount ?? 0) + 1;
    window.__essorViteAfterUpdateAt = performance.now();
  });

  hot?.dispose((nextData) => {
    (nextData as AppHotData).hasRendered = true;
  });
}
