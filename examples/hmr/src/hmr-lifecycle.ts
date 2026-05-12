import { demoState } from './state';

type AppHotData = {
  hasRendered?: boolean;
};

export function recordAppHotUpdate(hot: ImportMeta['hot']) {
  const data = hot?.data as AppHotData | undefined;

  if (data?.hasRendered) {
    demoState.updates.value += 1;
    demoState.lastAction.value = 'Hot update applied';
  }

  hot?.dispose((nextData) => {
    (nextData as AppHotData).hasRendered = true;
  });
}
