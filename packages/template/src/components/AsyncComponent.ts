import { isFunction } from '@estjs/shared';
import { inject } from '../provide';
import { onDestroy } from '../lifecycle';
import { onCleanup } from '../scope';
import { Component } from '../component';
import { SuspenseContext, type SuspenseContextType } from './Suspense';
import type { AnyNode, ComponentFn, ComponentProps } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface AsyncComponentOptions {
  /**
   * Component to render while the async component is loading.
   * Only shown after `delay` ms has elapsed (prevents flash of loading state).
   */
  loading?: ComponentFn;

  /**
   * Component to render when the async component fails to load.
   * Receives `{ error, retry }` as props.
   */
  error?: ComponentFn<{ error: Error; retry: () => void }>;

  /**
   * Delay in ms before showing the `loading` component (default: 200).
   */
  delay?: number;

  /**
   * Timeout in ms. If loading exceeds this, the error component is shown.
   */
  timeout?: number;

  /**
   * SSR rendering strategy (default: `'blocking'`).
   *
   * - `'blocking'`    — Pre-calls the loader at definition time. If the module
   *   resolves before the component body runs (e.g. pre-loaded via
   *   `renderToStringAsync`), the real component is inlined in the HTML.
   * - `'client-only'` — Renders `null` on the server; loads only in browser.
   */
  ssr?: 'blocking' | 'client-only';

  /**
   * Called when loading fails. Useful for logging or error tracking.
   */
  onError?: (error: Error, retry: () => void) => void;
}

type LoaderResult<P> = { default: ComponentFn<P> } | ComponentFn<P>;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Resolves the default export from a module.
 *
 * @param mod - The module result to resolve.
 * @returns {ComponentFn<P>} The resolved component function.
 */
function resolveModule<P>(mod: LoaderResult<P>): ComponentFn<P> {
  return isFunction(mod) ? (mod as ComponentFn<P>) : (mod as { default: ComponentFn<P> }).default;
}

/**
 * Mount a ComponentFn into a container element, returning the Component instance.
 *
 * @param el - The element to render into.
 * @param fn - The component function.
 * @param props - The component props.
 * @returns The component instance.
 */
function renderInto<P extends ComponentProps>(
  el: HTMLElement,
  fn: ComponentFn<P>,
  props?: P,
): Component<P> {
  const comp = new Component(fn, props);
  comp.mount(el);
  return comp;
}

// ============================================================================
// defineAsyncComponent
// ============================================================================

/**
 * Define an async (lazy-loaded) component.
 *
 * Compatible with client, SSR, and SSG. Integrates with `<Suspense>` via
 * `SuspenseContext` when rendered inside a Suspense boundary.
 *
 *
 * @param loader - The async loader function.
 * @param options - Configuration options.
 * @returns {ComponentFn<P>} The async component wrapper function.
 *
 * @example
 * ```tsx
 * // Simple
 * const Chart = defineAsyncComponent(() => import('./Chart'));
 *
 * // With options
 * const Chart = defineAsyncComponent(
 *   () => import('./Chart'),
 *   {
 *     loading: () => <Spinner />,
 *     error: ({ error, retry }) => (
 *       <div>
 *         <p>{error.message}</p>
 *         <button onClick={retry}>Retry</button>
 *       </div>
 *     ),
 *     delay: 200,
 *     timeout: 10_000,
 *   }
 * );
 *
 * // Works standalone or inside Suspense
 * function App() {
 *   return (
 *     <Suspense fallback={<div>Loading…</div>}>
 *       <Chart data={data} />
 *     </Suspense>
 *   );
 * }
 * ```
 */
export function defineAsyncComponent<P extends ComponentProps = ComponentProps>(
  loader: () => Promise<LoaderResult<P>>,
  options: AsyncComponentOptions = {},
): ComponentFn<P> {
  const { delay = 200, timeout, ssr = 'blocking', onError } = options;

  // ── Server-side rendering ─────────────────────────────────────────────────
  if (typeof window === 'undefined') {
    if (ssr === 'client-only') {
      /**
       * Returns the async component placeholder output.
       */
      const placeholder: ComponentFn<P> = () => '' as unknown as AnyNode;
      (placeholder as any).__asyncLoader = loader;
      (placeholder as any).__asyncResolved = () => null;
      return placeholder;
    }

    // 'blocking': pre-call the loader so that if the module is already cached
    // the component is available synchronously when the component body runs.
    let ssrResolved: ComponentFn<P> | null = null;
    let ssrPromise: Promise<void> | null = null;

    /**
     * SSR loader matches the client-side signature `() => Promise<void>`
     * so external consumers can treat `__asyncLoader` uniformly across
     * environments.
     */
    const ssrLoad = (): Promise<void> => {
      if (ssrPromise) return ssrPromise;
      ssrPromise = loader()
        .then((mod) => {
          ssrResolved = resolveModule(mod);
        })
        .catch(() => { });
      return ssrPromise;
    };

    // Kick off loading eagerly so that pre-resolved modules are inlined.
    ssrLoad();

    /**
     * Renders the server-side async wrapper.
     */
    const ssrWrapper: ComponentFn<P> = (props: P) => {
      if (ssrResolved) {
        return ssrResolved(props);
      }

      return '' as unknown as AnyNode;
    };

    (ssrWrapper as any).__asyncLoader = ssrLoad;
    (ssrWrapper as any).__asyncResolved = () => ssrResolved;

    return ssrWrapper;
  }

  // ── Client-side ──────────────────────────────────────────────────────────
  //
  // Module-level cache: all instances share one loader invocation.

  let cachedComponent: ComponentFn<P> | null = null;
  let cachedError: Error | null = null;
  type CacheStatus = 'pending' | 'resolved' | 'errored';
  let cachedStatus: CacheStatus = 'pending';
  let loadPromise: Promise<void> | null = null;

  /**
   * Loads the requested resource.
   */
  function load(): Promise<void> {
    if (loadPromise) return loadPromise;

    loadPromise = loader()
      .then((mod) => {
        cachedComponent = resolveModule(mod);
        cachedStatus = 'resolved';
      })
      .catch((error) => {
        cachedError = error instanceof Error ? error : new Error(String(error));
        cachedStatus = 'errored';
        loadPromise = null; // allow retry
      });

    return loadPromise;
  }

  // Kick off loading eagerly
  load();

  // ── Wrapper component ────────────────────────────────────────────────────
  //
  // Mirrors the Suspense pattern: return a plain DOM element (display:contents)
  // and perform imperative DOM swaps when async state changes.
  // This avoids issues with the Component class calling the inner render
  // function immediately instead of tracking it reactively.

  /**
   * Renders the async component wrapper.
   */
  function AsyncWrapper(props: P): AnyNode {
    // Fast path: already resolved
    if (cachedStatus === 'resolved' && cachedComponent) {
      const el = document.createElement('div');
      el.style.display = 'contents';
      const comp = renderInto(el, cachedComponent, props);
      onCleanup(() => comp.destroy());
      return el;
    }

    // Fast path: already errored
    if (cachedStatus === 'errored' && cachedError) {
      const el = document.createElement('div');
      el.style.display = 'contents';
      if (options.error) {
        let alive = true;
        let currentComp: Component | null = null;

        const swap = (fn: ComponentFn<any>, swapProps?: any) => {
          if (!alive) return;
          currentComp?.destroy();
          currentComp = renderInto(el, fn, swapProps);
        };

        const retry = () => {
          loadPromise = null;
          cachedStatus = 'pending';
          cachedError = null;
          if (options.loading) swap(options.loading);
          load().then(() => {
            if (!alive) return;
            if (cachedStatus === 'resolved' && cachedComponent) {
              swap(cachedComponent, props);
            } else if (cachedStatus === 'errored' && cachedError) {
              if (options.error) swap(options.error, { error: cachedError!, retry });
            }
          });
        };

        swap(options.error, { error: cachedError, retry });

        onDestroy(() => {
          alive = false;
          currentComp?.destroy();
          currentComp = null;
        });
      }
      return el;
    }

    // ─ Pending state ──────────────────────────────────────────────────────
    const container = document.createElement('div');
    container.style.display = 'contents';

    let alive = true;
    let currentComp: Component | null = null;
    let delayTimer: ReturnType<typeof setTimeout> | null = null;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;

    /**
     * Swaps the current rendered component.
     */
    const swap = (fn: ComponentFn<any>, swapProps?: any) => {
      if (!alive) return;
      currentComp?.destroy();
      currentComp = renderInto(container, fn, swapProps);
    };

    /**
     * Creates a retry handler for the current props.
     */
    const retryWith =
      (retryProps: P): (() => void) =>
        () => {
          loadPromise = null;
          cachedStatus = 'pending';
          cachedError = null;
          if (options.loading) swap(options.loading);
          load().then(() => {
            if (cachedStatus === 'resolved' && cachedComponent) {
              swap(cachedComponent, retryProps);
            } else if (cachedStatus === 'errored' && cachedError) {
              if (options.error) {
                swap(options.error, {
                  error: cachedError,
                  retry: retryWith(retryProps),
                });
              }
            }
          });
        };

    onDestroy(() => {
      alive = false;
      currentComp?.destroy();
      currentComp = null;
      if (delayTimer != null) clearTimeout(delayTimer);
      if (timeoutTimer != null) clearTimeout(timeoutTimer);
    });

    // Inject Suspense context (undefined when not inside a Suspense boundary)
    const suspenseCtx = inject<SuspenseContextType>(SuspenseContext) ?? null;

    /**
     * Displays the resolved component.
     */
    const showResolved = (compFn: ComponentFn<P>) => swap(compFn, props);

    /**
     * Displays the error state.
     */
    const showError = (err: Error) => {
      if (options.error) swap(options.error, { error: err, retry: retryWith(props) });
    };

    /**
     * Displays the loading state.
     */
    const showLoading = () => {
      if (options.loading) swap(options.loading);
    };

    const instancePromise = load().then(() => {
      if (!alive) return;
      if (cachedStatus === 'resolved' && cachedComponent) {
        showResolved(cachedComponent);
      } else if (cachedStatus === 'errored' && cachedError) {
        showError(cachedError);
        if (onError) onError(cachedError, retryWith(props));
      }
      if (delayTimer != null) clearTimeout(delayTimer);
      if (timeoutTimer != null) clearTimeout(timeoutTimer);
    });

    // Notify Suspense boundary about this pending async work
    if (suspenseCtx) {
      suspenseCtx.register(instancePromise);
    }

    // Delay before showing loading indicator
    if (delay > 0) {
      delayTimer = setTimeout(() => {
        if (alive && cachedStatus === 'pending') {
          showLoading();
        }
      }, delay);
    } else if (options.loading) {
      showLoading();
    }

    // Optional timeout
    if (timeout != null) {
      timeoutTimer = setTimeout(() => {
        if (alive && cachedStatus === 'pending') {
          const err = new Error(`[defineAsyncComponent] Timeout after ${timeout}ms`);
          cachedError = err;
          cachedStatus = 'errored';
          showError(err);
          if (onError) onError(err, retryWith(props));
        }
      }, timeout);
    }

    return container;
  }

  (AsyncWrapper as any).__asyncLoader = load;
  (AsyncWrapper as any).__asyncResolved = () => cachedComponent;

  return AsyncWrapper;
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Returns true if a function was created by `defineAsyncComponent`.
 *
 * @param fn - The function to check.
 * @returns {boolean} True if it is an async component.
 */
export function isAsyncComponent(fn: unknown): boolean {
  return isFunction(fn) && !!(fn as any).__asyncLoader;
}
