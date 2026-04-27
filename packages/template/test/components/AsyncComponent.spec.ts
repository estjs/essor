import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineAsyncComponent, isAsyncComponent } from '../../src/components/AsyncComponent';
import { Suspense } from '../../src/components/Suspense';
import { createComponent } from '../../src/component';
import { onDestroy } from '../../src/lifecycle';
import { mount, unmount } from '../test-utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a loader that resolves to a simple ComponentFn after `ms` ms. */
function makeLoader(content: string | (() => Node), ms = 0): () => Promise<() => Node> {
  const fn =
    typeof content === 'string'
      ? () => {
          const el = document.createElement('div');
          el.textContent = content;
          return el;
        }
      : content;

  return () =>
    new Promise<() => Node>((resolve) => {
      setTimeout(() => resolve(fn), ms);
    });
}

/** Create a loader that rejects after `ms` ms. */
function makeFailingLoader(ms = 0, msg = 'Load failed'): () => Promise<never> {
  return () =>
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(msg)), ms);
    });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('defineAsyncComponent', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    vi.useFakeTimers();
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ── isAsyncComponent ──────────────────────────────────────────────────────

  describe('isAsyncComponent', () => {
    it('returns true for components created with defineAsyncComponent', () => {
      const Async = defineAsyncComponent(makeLoader('hello'));
      expect(isAsyncComponent(Async)).toBe(true);
    });

    it('returns false for regular functions', () => {
      expect(isAsyncComponent(() => null)).toBe(false);
      expect(isAsyncComponent({})).toBe(false);
      expect(isAsyncComponent(null)).toBe(false);
    });
  });

  // ── Basic loading and resolution ──────────────────────────────────────────

  describe('basic resolution', () => {
    it('renders the loaded component after loader resolves', async () => {
      const Async = defineAsyncComponent(makeLoader('Loaded!', 0), {
        delay: 0,
      });
      mount(() => createComponent(Async), container);

      // Flush the microtask / zero-ms timer
      await vi.runAllTimersAsync();

      expect(container.textContent).toContain('Loaded!');
    });

    it('renders nothing while loading (before delay)', () => {
      // delay > 0 so loading indicator is not shown yet
      const Async = defineAsyncComponent(makeLoader('Hi', 500), { delay: 300 });
      mount(() => createComponent(Async), container);

      // Not advanced timers yet — pending, no loading indicator
      expect(container.textContent?.trim()).toBe('');
    });

    it('handles ESM default export { default: ComponentFn }', async () => {
      const innerFn = () => {
        const el = document.createElement('p');
        el.textContent = 'ESM default';
        return el;
      };
      const loader = () => Promise.resolve({ default: innerFn });

      const Async = defineAsyncComponent(loader, { delay: 0 });
      mount(() => createComponent(Async), container);

      await vi.runAllTimersAsync();

      expect(container.querySelector('p')?.textContent).toBe('ESM default');
    });
  });

  // ── Loading component + delay ─────────────────────────────────────────────

  describe('loading indicator with delay', () => {
    it('shows loading component immediately when delay is zero', () => {
      const loading = () => {
        const el = document.createElement('div');
        el.className = 'spinner-now';
        return el;
      };

      const Async = defineAsyncComponent(() => new Promise<any>(() => {}), {
        loading,
        delay: 0,
      });

      mount(() => createComponent(Async), container);

      expect(container.querySelector('.spinner-now')).not.toBeNull();
    });

    it('shows loading component after delay elapses', async () => {
      const loading = () => {
        const el = document.createElement('div');
        el.className = 'spinner';
        return el;
      };

      const Async = defineAsyncComponent(makeLoader('Done', 2000), {
        loading,
        delay: 500,
      });

      mount(() => createComponent(Async), container);

      // Before delay — nothing shown
      expect(container.querySelector('.spinner')).toBeNull();

      // Advance past delay
      await vi.advanceTimersByTimeAsync(600);
      expect(container.querySelector('.spinner')).not.toBeNull();
    });

    it('does NOT flash loading component when loader resolves before delay', async () => {
      const loading = () => {
        const el = document.createElement('div');
        el.className = 'spinner';
        return el;
      };

      // loader resolves in 100 ms, delay is 500 ms → spinner should never appear
      const Async = defineAsyncComponent(makeLoader('Fast', 100), {
        loading,
        delay: 500,
      });

      mount(() => createComponent(Async), container);

      await vi.advanceTimersByTimeAsync(200); // loader done
      // delay timer is cleared after resolution, so spinner never shows
      expect(container.querySelector('.spinner')).toBeNull();
      expect(container.textContent).toContain('Fast');
    });
  });

  // ── Error handling ────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('shows error component when loader rejects', async () => {
      const error = ({ error: err }: { error: Error; retry: () => void }) => {
        const el = document.createElement('div');
        el.className = 'error';
        el.textContent = err.message;
        return el;
      };

      const Async = defineAsyncComponent(makeFailingLoader(0, 'Oops'), {
        error,
        delay: 0,
      });

      mount(() => createComponent(Async), container);

      await vi.runAllTimersAsync();

      expect(container.querySelector('.error')).not.toBeNull();
      expect(container.querySelector('.error')?.textContent).toBe('Oops');
    });

    it('calls onError callback when loader rejects', async () => {
      const onError = vi.fn();

      const Async = defineAsyncComponent(makeFailingLoader(0, 'Boom'), {
        delay: 0,
        onError,
      });

      mount(() => createComponent(Async), container);

      await vi.runAllTimersAsync();

      expect(onError).toHaveBeenCalledOnce();
      expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
      expect((onError.mock.calls[0][0] as Error).message).toBe('Boom');
    });

    it('renders nothing on error when no error component is provided', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const Async = defineAsyncComponent(makeFailingLoader(0), { delay: 0 });
      mount(() => createComponent(Async), container);

      await vi.runAllTimersAsync();

      // No error component → renders null, container should be empty/blank
      expect(container.querySelector('.error')).toBeNull();

      warnSpy.mockRestore();
    });

    it('retries after an initial loader failure', async () => {
      let latestRetry: (() => void) | undefined;
      const loader = vi.fn(() =>
        loader.mock.calls.length === 1
          ? Promise.reject(new Error('First failure'))
          : Promise.resolve(() => {
              const el = document.createElement('span');
              el.textContent = 'Recovered';
              return el;
            }),
      );
      const error = ({ error: err, retry }: { error: Error; retry: () => void }) => {
        latestRetry = retry;
        const el = document.createElement('div');
        el.className = 'retry-error';
        el.textContent = err.message;
        return el;
      };

      const Async = defineAsyncComponent(loader, {
        error,
        delay: 0,
      });

      mount(() => createComponent(Async), container);
      await vi.runAllTimersAsync();

      expect(container.querySelector('.retry-error')?.textContent).toBe('First failure');
      expect(latestRetry).toBeTypeOf('function');

      latestRetry!();
      await vi.runAllTimersAsync();

      expect(loader).toHaveBeenCalledTimes(2);
      expect(container.textContent).toContain('Recovered');
    });

    it('keeps rendering the error component when a retry fails again', async () => {
      let latestRetry: (() => void) | undefined;
      const loading = () => {
        const el = document.createElement('div');
        el.className = 'retry-loading';
        return el;
      };
      const loader = vi.fn(() =>
        Promise.reject(
          new Error(loader.mock.calls.length === 1 ? 'First failure' : 'Second failure'),
        ),
      );
      const error = ({ error: err, retry }: { error: Error; retry: () => void }) => {
        latestRetry = retry;
        const el = document.createElement('div');
        el.className = 'retry-persist-error';
        el.textContent = err.message;
        return el;
      };

      const Async = defineAsyncComponent(loader, {
        loading,
        error,
        delay: 0,
      });

      mount(() => createComponent(Async), container);
      await vi.runAllTimersAsync();

      expect(container.querySelector('.retry-persist-error')?.textContent).toBe('First failure');

      latestRetry!();
      expect(container.querySelector('.retry-loading')).not.toBeNull();

      await vi.runAllTimersAsync();

      expect(loader).toHaveBeenCalledTimes(2);
      expect(container.querySelector('.retry-persist-error')?.textContent).toBe('Second failure');
    });

    it('renders cached error state immediately on subsequent mounts', async () => {
      const secondContainer = document.createElement('div');
      document.body.appendChild(secondContainer);

      try {
        const loader = vi.fn(() => Promise.reject(new Error('Cached failure')));
        const error = ({ error: err }: { error: Error; retry: () => void }) => {
          const el = document.createElement('div');
          el.className = 'cached-error';
          el.textContent = err.message;
          return el;
        };

        const Async = defineAsyncComponent(loader, {
          error,
          delay: 0,
        });

        mount(() => createComponent(Async), container);
        await vi.runAllTimersAsync();

        expect(container.querySelector('.cached-error')?.textContent).toBe('Cached failure');
        expect(loader).toHaveBeenCalledTimes(1);

        mount(() => createComponent(Async), secondContainer);

        expect(secondContainer.querySelector('.cached-error')?.textContent).toBe('Cached failure');
        expect(loader).toHaveBeenCalledTimes(1);
      } finally {
        document.body.removeChild(secondContainer);
      }
    });

    it('normalizes non-Error loader rejections into Error instances', async () => {
      const onError = vi.fn();
      const error = ({ error: err }: { error: Error; retry: () => void }) => {
        const el = document.createElement('div');
        el.className = 'non-error';
        el.textContent = err.message;
        return el;
      };

      const Async = defineAsyncComponent(() => Promise.reject('plain failure'), {
        error,
        delay: 0,
        onError,
      });

      mount(() => createComponent(Async), container);
      await vi.runAllTimersAsync();

      expect(container.querySelector('.non-error')?.textContent).toBe('plain failure');
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
      expect((onError.mock.calls[0]?.[0] as Error).message).toBe('plain failure');
    });

    it('uses the cached-error retry helper to refresh the module cache for later mounts', async () => {
      const thirdContainer = document.createElement('div');
      document.body.appendChild(thirdContainer);

      try {
        let cachedRetry: (() => void) | undefined;
        const loader = vi.fn(() =>
          loader.mock.calls.length === 1
            ? Promise.reject(new Error('Retryable failure'))
            : Promise.resolve(() => {
                const el = document.createElement('span');
                el.textContent = 'Retried success';
                return el;
              }),
        );
        const error = ({ retry }: { error: Error; retry: () => void }) => {
          cachedRetry = retry;
          const el = document.createElement('div');
          el.className = 'cached-retry-error';
          return el;
        };

        const Async = defineAsyncComponent(loader, {
          error,
          delay: 0,
        });

        mount(() => createComponent(Async), container);
        await vi.runAllTimersAsync();

        const secondContainer = document.createElement('div');
        document.body.appendChild(secondContainer);
        try {
          mount(() => createComponent(Async), secondContainer);

          expect(secondContainer.querySelector('.cached-retry-error')).not.toBeNull();
          expect(cachedRetry).toBeTypeOf('function');

          cachedRetry!();
          await vi.runAllTimersAsync();

          expect(loader).toHaveBeenCalledTimes(2);

          mount(() => createComponent(Async), thirdContainer);
          expect(thirdContainer.textContent).toContain('Retried success');
        } finally {
          document.body.removeChild(secondContainer);
        }
      } finally {
        document.body.removeChild(thirdContainer);
      }
    });
  });

  // ── Timeout ───────────────────────────────────────────────────────────────

  describe('timeout', () => {
    it('shows error component after timeout fires', async () => {
      const error = ({ error: err }: { error: Error; retry: () => void }) => {
        const el = document.createElement('div');
        el.className = 'timeout-error';
        el.textContent = err.message;
        return el;
      };

      // Loader never resolves; timeout at 1000 ms
      const Async = defineAsyncComponent(() => new Promise<any>(() => {}), {
        error,
        delay: 0,
        timeout: 1000,
      });

      mount(() => createComponent(Async), container);

      await vi.advanceTimersByTimeAsync(500);
      expect(container.querySelector('.timeout-error')).toBeNull();

      await vi.advanceTimersByTimeAsync(600);
      const el = container.querySelector('.timeout-error');
      expect(el).not.toBeNull();
      expect(el?.textContent).toContain('Timeout');
    });

    it('calls onError when timeout fires even without an error component', async () => {
      const onError = vi.fn();

      const Async = defineAsyncComponent(() => new Promise<any>(() => {}), {
        delay: 0,
        timeout: 250,
        onError,
      });

      mount(() => createComponent(Async), container);
      await vi.advanceTimersByTimeAsync(300);

      expect(onError).toHaveBeenCalledTimes(1);
      expect((onError.mock.calls[0]?.[0] as Error).message).toContain('Timeout after 250ms');
      expect(onError.mock.calls[0]?.[1]).toBeTypeOf('function');
    });
  });

  // ── Suspense integration ──────────────────────────────────────────────────

  describe('suspense integration', () => {
    it('registers with SuspenseContext so Suspense shows fallback', async () => {
      const fallback = document.createElement('div');
      fallback.className = 'fallback';

      let loaderResolve!: () => void;
      const loader = () =>
        new Promise<() => Node>((resolve) => {
          loaderResolve = () => {
            const fn = () => {
              const el = document.createElement('span');
              el.textContent = 'Ready';
              return el;
            };
            resolve(fn);
          };
        });

      const Async = defineAsyncComponent(loader, { delay: 0 });

      const app = () =>
        Suspense({
          fallback,
          children: createComponent(Async) as any,
        });

      mount(app, container);

      // Suspense should show fallback while async component is loading
      expect(container.querySelector('.fallback')).not.toBeNull();

      // Resolve the loader
      loaderResolve();
      await vi.runAllTimersAsync();

      // After resolution, content should replace fallback
      expect(container.querySelector('.fallback')).toBeNull();
      expect(container.querySelector('span')?.textContent).toBe('Ready');
    });
  });

  // ── Cleanup ───────────────────────────────────────────────────────────────

  describe('cleanup', () => {
    it('runs cached resolved-path cleanup when the mounted scope is destroyed', async () => {
      const secondContainer = document.createElement('div');
      document.body.appendChild(secondContainer);

      try {
        const destroySpy = vi.fn();
        const Async = defineAsyncComponent(
          () =>
            Promise.resolve(() => {
              onDestroy(destroySpy);
              const el = document.createElement('span');
              el.textContent = 'Destroyable';
              return el;
            }),
          { delay: 0 },
        );

        const firstScope = mount(() => createComponent(Async), container);
        await vi.runAllTimersAsync();
        unmount(firstScope);
        destroySpy.mockClear();

        const secondScope = mount(() => createComponent(Async), secondContainer);
        expect(secondContainer.textContent).toContain('Destroyable');

        unmount(secondScope);

        expect(destroySpy).toHaveBeenCalled();
      } finally {
        document.body.removeChild(secondContainer);
      }
    });

    it('runs cached errored-path cleanup when the mounted scope is destroyed', async () => {
      const secondContainer = document.createElement('div');
      document.body.appendChild(secondContainer);

      try {
        const destroySpy = vi.fn();
        const error = ({ error: err }: { error: Error; retry: () => void }) => {
          onDestroy(destroySpy);
          const el = document.createElement('div');
          el.className = 'destroyable-error';
          el.textContent = err.message;
          return el;
        };
        const Async = defineAsyncComponent(() => Promise.reject(new Error('Destroy failure')), {
          error,
          delay: 0,
        });

        const firstScope = mount(() => createComponent(Async), container);
        await vi.runAllTimersAsync();
        unmount(firstScope);
        destroySpy.mockClear();

        const secondScope = mount(() => createComponent(Async), secondContainer);
        expect(secondContainer.querySelector('.destroyable-error')?.textContent).toBe(
          'Destroy failure',
        );

        unmount(secondScope);

        expect(destroySpy).toHaveBeenCalled();
      } finally {
        document.body.removeChild(secondContainer);
      }
    });

    it('reuses the resolved module cache across mounts', async () => {
      const secondContainer = document.createElement('div');
      document.body.appendChild(secondContainer);

      try {
        const loader = vi.fn(() =>
          Promise.resolve(() => {
            const el = document.createElement('span');
            el.textContent = 'Shared';
            return el;
          }),
        );
        const Async = defineAsyncComponent(loader, { delay: 0 });

        mount(() => createComponent(Async), container);
        await vi.runAllTimersAsync();

        mount(() => createComponent(Async), secondContainer);
        await vi.runAllTimersAsync();

        expect(loader).toHaveBeenCalledTimes(1);
        expect(secondContainer.textContent).toContain('Shared');
      } finally {
        document.body.removeChild(secondContainer);
      }
    });

    it('does not update DOM after unmount', async () => {
      expect.assertions(0);
      let loaderResolve!: () => void;
      const loader = () =>
        new Promise<() => Node>((resolve) => {
          loaderResolve = () => resolve(() => document.createElement('span'));
        });

      const Async = defineAsyncComponent(loader, { delay: 0 });
      const cleanup = mount(() => createComponent(Async), container);

      unmount(cleanup);

      // Resolve after unmount — should not throw or update
      loaderResolve();
      await vi.runAllTimersAsync();
      // No assertion needed; absence of errors is the goal
    });

    it('clears delay timer on unmount', async () => {
      const loading = () => {
        const el = document.createElement('div');
        el.className = 'spinner';
        return el;
      };

      const Async = defineAsyncComponent(
        () => new Promise<any>(() => {}), // never resolves
        { loading, delay: 500 },
      );

      const cleanup = mount(() => createComponent(Async), container);

      // Unmount before delay fires
      unmount(cleanup);

      await vi.advanceTimersByTimeAsync(1000);

      // Spinner must not appear — component was destroyed
      expect(container.querySelector('.spinner')).toBeNull();
    });
  });

  // ── SSR branch (server environment simulation) ────────────────────────────

  describe('sSR branch', () => {
    // We simulate the server branch by temporarily removing `window`
    const originalWindow = global.window;

    afterEach(() => {
      global.window = originalWindow;
    });

    it('ssr: client-only returns empty string on server', () => {
      // @ts-expect-error – simulate server env
      delete global.window;

      const Async = defineAsyncComponent(makeLoader('Client Only'), {
        ssr: 'client-only',
      });

      // The component function must exist and return null
      expect(typeof Async).toBe('function');
      const result = Async({} as any);
      expect(result).toBe('');
    });

    it('ssr: client-only exposes an unresolved marker helper', () => {
      // @ts-expect-error – simulate server env
      delete global.window;

      const Async = defineAsyncComponent(makeLoader('Client Only Marker'), {
        ssr: 'client-only',
      }) as any;

      expect(Async.__asyncResolved()).toBeNull();
    });

    it('ssr: blocking exposes __asyncLoader() loader function on server', () => {
      // @ts-expect-error – simulate server env
      delete global.window;

      const Async = defineAsyncComponent(makeLoader('SSR Content'), {
        ssr: 'blocking',
      }) as any;

      // `__asyncLoader` is a loader function that returns `Promise<void>`,
      // matching the client-side signature.
      expect(typeof Async.__asyncLoader).toBe('function');
      expect(Async.__asyncLoader()).toBeInstanceOf(Promise);
      expect(typeof Async.__asyncResolved).toBe('function');
    });

    it('ssr: blocking renders component after __asyncLoader resolves', async () => {
      // @ts-expect-error – simulate server env
      delete global.window;

      // Use a direct Promise.resolve (no setTimeout dependency)
      const innerFn = () => {
        const el = document.createElement('div');
        el.textContent = 'SSR Ready';
        return el;
      };
      const Async = defineAsyncComponent(() => Promise.resolve(innerFn), {
        ssr: 'blocking',
      }) as any;

      // Await the pre-loader (a real promise, not timer-based)
      await Async.__asyncLoader();

      // Restore window before any DOM operations
      global.window = originalWindow;

      // The resolved component should be set
      const resolved = Async.__asyncResolved();
      expect(resolved).not.toBeNull();

      const ssrContainer = document.createElement('div');
      const node = resolved!({});
      ssrContainer.appendChild(node as Node);
      expect(ssrContainer.textContent).toBe('SSR Ready');
    });

    it('ssr: blocking wrapper returns the resolved component output once preloaded', async () => {
      // @ts-expect-error – simulate server env
      delete global.window;

      const Async = defineAsyncComponent(() => Promise.resolve(() => 'SSR inline' as any), {
        ssr: 'blocking',
      }) as any;

      await Async.__asyncLoader();

      expect(Async({} as any)).toBe('SSR inline');
    });

    it('ssr: blocking stays unresolved when the loader rejects', async () => {
      // @ts-expect-error – simulate server env
      delete global.window;

      const Async = defineAsyncComponent(() => Promise.reject(new Error('SSR boom')), {
        ssr: 'blocking',
      }) as any;

      await expect(Async.__asyncLoader()).resolves.toBeUndefined();
      expect(Async.__asyncResolved()).toBeNull();
      expect(Async({})).toBe('');
    });
  });
});
