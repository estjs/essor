import { signal } from 'essor';

type HMRDemoState = {
  count: ReturnType<typeof signal<number>>;
  updates: ReturnType<typeof signal<number>>;
  lastAction: ReturnType<typeof signal<string>>;
};

type HMRData = {
  demoState?: HMRDemoState;
};

const hotData = import.meta.hot?.data as HMRData | undefined;

export const demoState =
  hotData?.demoState ??
  ({
    count: signal(0),
    updates: signal(0),
    lastAction: signal('Ready'),
  } satisfies HMRDemoState);

import.meta.hot?.dispose((data: HMRData) => {
  data.demoState = demoState;
});
