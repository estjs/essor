import { isFunction } from '@estjs/shared';
import { inject } from '../provide';
import { onDestroy } from '../lifecycle';
import { createScope, disposeScope, getActiveScope, runWithScope } from '../scope';
import { insert } from '../dom';
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

  /** Delay in ms before showing the `loading` component (default: 200). */
  delay?: number;

  /** Timeout in ms. If loading exceeds this, the error component is shown. */
  timeout?: number;

  /**
   * SSR rendering strategy (default: `'blocking'`).
   *
   * - `'blocking'`    — Pre-calls the loader at definition time. If the module
   *   resolves before the component body runs, the real component is inlined.
   * - `'client-only'` — Renders `null` on the server; loads only in browser.
   */
  ssr?: 'blocking' | 'client-only';

  /** Called when loading fails. Useful for logging or error tracking. */
  onError?: (error: Error, retry: () => void) => void;
}

type LoaderResult<P> = { default: ComponentFn<P> } | ComponentFn<P>;
type Loader<P> = () => Promise<LoaderResult<P>>;

/** Resolve the default export (or the function itself) from a loaded module. */
function resolveModule<P>(mod: LoaderResult<P>): ComponentFn<P> {
  return isFunction(mod) ? (mod as ComponentFn<P>) : (mod as { default: ComponentFn<P> }).default;
}

// ============================================================================
// Server-side rendering
// ============================================================================

function defineServerAsyncComponent<P extends ComponentProps>(
  loader: Loader<P>,
  ssr: 'blocking' | 'client-only',
): ComponentFn<P> {
  if (ssr === 'client-only') {
    const placeholder: ComponentFn<P> = () => '' as unknown as AnyNode;
    (placeholder as any).__asyncLoader = loader;
    (placeholder as any).__asyncResolved = () => null;
    return placeholder;
  }

  // 'blocking': pre-call the loader so an already-cached module renders inline.
  let resolved: ComponentFn<P> | null = null;
  let promise: Promise<void> | null = null;

  const load = (): Promise<void> =>
    (promise ??= loader()
      .then((mod) => {
        resolved = resolveModule(mod);
      })
      .catch(() => {}));

  load();

  const wrapper: ComponentFn<P> = (props: P) =>
    resolved ? resolved(props) : ('' as unknown as AnyNode);
  (wrapper as any).__asyncLoader = load;
  (wrapper as any).__asyncResolved = () => resolved;
  return wrapper;
}

// ============================================================================
// Client-side
// ============================================================================

function defineClientAsyncComponent<P extends ComponentProps>(
  loader: Loader<P>,
  options: AsyncComponentOptions,
): ComponentFn<P> {
  const { loading, error: errorComp, delay = 200, timeout, onError } = options;

  // Module-level cache: all instances share one loader invocation.
  let component: ComponentFn<P> | null = null;
  let error: Error | null = null;
  let status: 'pending' | 'resolved' | 'errored' = 'pending';
  let loadPromise: Promise<void> | null = null;

  const load = (): Promise<void> =>
    (loadPromise ??= loader()
      .then((mod) => {
        component = resolveModule(mod);
        status = 'resolved';
      })
      .catch((error_) => {
        error = error_ instanceof Error ? error_ : new Error(String(error_));
        status = 'errored';
        loadPromise = null; // allow retry
      }));

  load();

  function AsyncWrapper(props: P): AnyNode {
    // Wrapper-free: returns a fragment whose sole child is the end anchor of a
    // `<!--async-->` anchored range. Each state transition (loading / resolved
    // / error) creates a fresh child scope and mounts a Component before that
    // anchor using `insert()`. The returning `<For>`-style fragment also works
    // here — the framework moves the fragment's children into the host.
    const owner = getActiveScope();
    const end = document.createComment('async');
    const frag = document.createDocumentFragment();
    frag.appendChild(end);

    let alive = true;
    let viewScope: ReturnType<typeof createScope> | null = null;
    let delayTimer: ReturnType<typeof setTimeout> | null = null;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;

    const clearTimers = () => {
      if (delayTimer != null) clearTimeout(delayTimer);
      if (timeoutTimer != null) clearTimeout(timeoutTimer);
      delayTimer = timeoutTimer = null;
    };

    /** Dispose old view, mount `fn` as the new one before `end`. */
    const render = (fn: ComponentFn<any> | null, fnProps?: any): void => {
      if (!alive) return;
      // Guard: if the owner scope was destroyed while we were awaiting (e.g.
      // the component unmounted before the Promise resolved), bail out to
      // prevent creating an orphan child scope attached to a dead parent.
      if (owner && owner.isDestroyed) return;
      if (viewScope) {
        disposeScope(viewScope);
        viewScope = null;
      }
      if (!fn) return;
      viewScope = createScope(owner);
      runWithScope(viewScope, () => {
        // Lazy-parent: before flush end is in frag, after flush it's in the host.
        insert(end.parentNode ?? frag, () => new Component(fn, fnProps), end);
      });
    };

    onDestroy(() => {
      alive = false;
      clearTimers();
      if (viewScope) {
        disposeScope(viewScope);
        viewScope = null;
      }
      end.remove();
    });

    /** Build a retry handler bound to the given props. */
    const retryWith =
      (retryProps: P): (() => void) =>
      () => {
        loadPromise = null;
        status = 'pending';
        error = null;
        if (loading) render(loading);
        load().then(() => settle(retryProps));
      };

    /** Reflect the current cache status into the rendered view. */
    const settle = (renderProps: P): void => {
      if (!alive) return;
      clearTimers();
      if (status === 'resolved' && component) {
        render(component, renderProps);
      } else if (status === 'errored' && error) {
        if (errorComp) render(errorComp, { error, retry: retryWith(renderProps) });
        if (onError) onError(error, retryWith(renderProps));
      }
    };

    // ── Fast paths: cache already settled ─────────────────────────────────

    if (status === 'resolved' && component) {
      render(component, props);
      return frag as unknown as AnyNode;
    }
    if (status === 'errored' && error) {
      if (errorComp) render(errorComp, { error, retry: retryWith(props) });
      return frag as unknown as AnyNode;
    }

    // ── Pending ──────────────────────────────────────────────────────────

    const pending = load().then(() => settle(props));

    // Notify an enclosing Suspense boundary about this pending work.
    inject<SuspenseContextType>(SuspenseContext)?.register(pending);

    if (delay > 0) {
      delayTimer = setTimeout(() => {
        if (alive && status === 'pending' && loading) render(loading);
      }, delay);
    } else if (loading) {
      render(loading);
    }

    if (timeout != null) {
      timeoutTimer = setTimeout(() => {
        if (!alive || status !== 'pending') return;
        error = new Error(`[defineAsyncComponent] Timeout after ${timeout}ms`);
        status = 'errored';
        if (errorComp) render(errorComp, { error, retry: retryWith(props) });
        if (onError) onError(error, retryWith(props));
      }, timeout);
    }

    return frag as unknown as AnyNode;
  }

  (AsyncWrapper as any).__asyncLoader = load;
  (AsyncWrapper as any).__asyncResolved = () => component;
  return AsyncWrapper;
}

// ============================================================================
// defineAsyncComponent
// ============================================================================

/**
 * Define an async (lazy-loaded) component. Works on client, SSR, and SSG, and
 * integrates with `<Suspense>` via `SuspenseContext` when nested in a boundary.
 *
 * @param loader - The async loader function.
 * @param options - Configuration options.
 *
 * @example
 * ```tsx
 * const Chart = defineAsyncComponent(() => import('./Chart'), {
 *   loading: () => <Spinner />,
 *   error: ({ error, retry }) => <button onClick={retry}>{error.message}</button>,
 *   delay: 200,
 *   timeout: 10_000,
 * });
 * ```
 */
export function defineAsyncComponent<P extends ComponentProps = ComponentProps>(
  loader: Loader<P>,
  options: AsyncComponentOptions = {},
): ComponentFn<P> {
  return typeof window === 'undefined'
    ? defineServerAsyncComponent(loader, options.ssr ?? 'blocking')
    : defineClientAsyncComponent(loader, options);
}

/**
 * Returns true if a function was created by `defineAsyncComponent`.
 *
 * @param fn - The function to check.
 * @returns {boolean} True if it is an async component.
 */
export function isAsyncComponent(fn: unknown): boolean {
  return isFunction(fn) && !!(fn as any).__asyncLoader;
}
