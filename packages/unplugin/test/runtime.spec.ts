// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { applyUpdate, createHMRComponent, hmrAccept } from '../src/hmrRuntime';

vi.mock('essor', () => {
  const createComponent = (component: (props: any) => any, props: any = {}) => {
    const scope = { cleanups: [] as Array<() => void> };
    const previous = (globalThis as any).__scope;
    (globalThis as any).__scope = scope;
    try {
      const value = component(props);
      (globalThis as any).__lastScope = scope;
      return value;
    } finally {
      (globalThis as any).__scope = previous;
    }
  };
  const onDestroy = (cleanup: () => void) => (globalThis as any).__scope?.cleanups.push(cleanup);
  const signal = (value: number) => {
    const subscribers = new Set<() => void>();
    return {
      get value() {
        const subscriber = (globalThis as any).__subscriber;
        if (subscriber) subscribers.add(subscriber);
        return value;
      },
      set value(next: number) {
        value = next;
        for (const subscriber of [...subscribers]) subscriber();
      },
    };
  };
  return { createComponent, onDestroy, signal };
});

type Component = (() => string) & { __hmrId?: string; __signature?: string };

function component(id: string, signature: string, value: string): Component {
  const fn = (() => value) as Component;
  fn.__hmrId = id;
  fn.__signature = signature;
  return fn;
}

function mount(thunk: any) {
  const result = {
    value: undefined as unknown,
    runs: 0,
    scope: undefined as any,
  };
  const run = () => {
    const previous = (globalThis as any).__subscriber;
    (globalThis as any).__subscriber = run;
    try {
      result.runs++;
      result.value = thunk();
      result.scope = (globalThis as any).__lastScope;
    } finally {
      (globalThis as any).__subscriber = previous;
    }
  };
  run();
  return result;
}

function cleanup(mounted: ReturnType<typeof mount>) {
  for (const fn of mounted.scope?.cleanups ?? []) fn();
}

describe('hmr runtime', () => {
  beforeEach(() => {
    delete (globalThis as any).__scope;
    delete (globalThis as any).__lastScope;
    delete (globalThis as any).__subscriber;
  });

  it('passes untracked components through and wraps root components as functions', () => {
    const plain = () => 'plain';
    expect(createHMRComponent(plain, {})).toBe('plain');

    const root = createHMRComponent(component('root-a', '1', 'root'));
    expect(root({})()).toBe('root');
  });

  it('re-renders mounted components when their implementation changes', () => {
    const first = component('component-a', '1', 'one');
    const mounted = mount(createHMRComponent(first, {}));
    const second = component('component-a', '2', 'two');

    expect(applyUpdate([second])).toBe(false);
    expect(mounted.value).toBe('two');
    expect(mounted.runs).toBe(2);
  });

  it('ignores unchanged entries and accepts updates for newly observed components', () => {
    const first = component('component-b', '1', 'one');
    const mounted = mount(createHMRComponent(first, {}));
    expect(applyUpdate([first])).toBe(false);
    expect(mounted.runs).toBe(1);

    const unseen = component('component-c', '1', 'new');
    expect(applyUpdate([unseen])).toBe(false);
    expect(mount(createHMRComponent(unseen, {})).value).toBe('new');
  });

  it('stops updating a disposed mount', () => {
    const first = component('component-d', '1', 'one');
    const mounted = mount(createHMRComponent(first, {}));
    cleanup(mounted);

    applyUpdate([component('component-d', '2', 'two')]);
    expect(mounted.runs).toBe(1);
  });

  it('handles empty and malformed registries without requesting reload', () => {
    expect(applyUpdate([])).toBe(false);
    expect(applyUpdate([null, {}, 1] as any)).toBe(false);
  });

  it('sets up Vite HMR state and applies a later update', () => {
    const hot: any = { data: {} };
    const first = component('component-e', '1', 'one');
    expect(hmrAccept('vite', hot, [first])).toBe(true);
    expect(hot.data['essor-hmr']).toEqual([first]);

    const mounted = mount(createHMRComponent(first, {}));
    const second = component('component-e', '2', 'two');
    hot.data['essor-hmr'] = [first];
    hmrAccept('vite', hot, [second]);
    expect(mounted.value).toBe('two');
  });

  it('configures webpack-style accept and dispose callbacks', () => {
    const accept = vi.fn();
    const dispose = vi.fn();
    const hot: any = { accept, dispose, data: {} };

    expect(hmrAccept('webpack5', hot, [])).toBe(true);
    expect(accept).toHaveBeenCalledWith();
    expect(dispose).toHaveBeenCalledWith(expect.any(Function));

    const data: Record<string, unknown> = {};
    dispose.mock.calls[0][0](data);
    expect(data['essor-hmr']).toEqual([]);
  });

  it('uses the standard callback protocol and rejects missing hot state', () => {
    expect(hmrAccept('vite', undefined, [])).toBe(false);
    expect(hmrAccept('rollup', {}, [])).toBe(true);

    const accept = vi.fn();
    const dispose = vi.fn();
    const hot: any = { accept, dispose };
    hmrAccept('rollup', hot, []);
    expect(accept).toHaveBeenCalledWith(expect.any(Function));
    expect(dispose).toHaveBeenCalledWith(expect.any(Function));
  });
});
