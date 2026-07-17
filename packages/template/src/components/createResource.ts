import { type Signal, signal } from '@estjs/signals';
import { inject } from '../provide';
import { onCleanup } from '../scope';
import { getSSRExecutionState } from '../ssr-execution';
import { SuspenseContext } from './Suspense';
import type { SuspenseContextType } from './Suspense';

export type ResourceState = 'pending' | 'ready' | 'errored';

export interface Resource<T> {
  (): T | undefined;
  loading: Signal<boolean>;
  error: Signal<Error | null>;
  state: Signal<ResourceState>;
}

export interface ResourceActions<T> {
  mutate: (value: T) => void;
  refetch: () => Promise<void>;
}

export interface ResourceOptions<T> {
  initialValue?: T;
  /** Start the initial request immediately. Defaults to true. */
  immediate?: boolean;
  /**
   * Stable SSR resource key (injected by Start compiler / multi-pass render).
   * When an SSR resource bridge is active, this key participates in request-local
   * dedupe and hydrate reuse.
   */
  ssrKey?: string;
}

/**
 * Create a resource for async data fetching.
 *
 * The fetcher receives an {@link AbortSignal} that is aborted when:
 * - A new fetch is triggered (refetch / concurrent call) — cancels the stale request.
 * - The owning scope is disposed (component unmount) — cancels the in-flight request.
 *
 * During SSR, when `ssrKey` is set and an execution-state resource bridge is
 * present, the bridge owns fetch/dedupe/ready records across render passes.
 */

/** Client hydrate seed map (key → ready value). Cleared after first pass. */
let hydrateResourceMap: Map<string, unknown> | null = null;
let hydrateOrdinal = 0;

/**
 * Seed createResource with SSR-ready values before `hydrate()`.
 * Keys must match the SSR bridge ordinals / ssrKey values.
 */
export function setHydrateResources(records: Record<string, unknown> | null | undefined): void {
  if (!records) {
    hydrateResourceMap = null;
    hydrateOrdinal = 0;
    try {
      delete (globalThis as { __ESSOR_HYDRATE_RESOURCES__?: unknown }).__ESSOR_HYDRATE_RESOURCES__;
    } catch {
      /* ignore */
    }
    return;
  }
  hydrateResourceMap = new Map(Object.entries(records));
  hydrateOrdinal = 0;
  // Cross-bundle safety: Vite may load two template copies; globalThis is shared.
  (
    globalThis as { __ESSOR_HYDRATE_RESOURCES__?: Map<string, unknown> }
  ).__ESSOR_HYDRATE_RESOURCES__ = hydrateResourceMap;
  (globalThis as { __ESSOR_HYDRATE_ORDINAL__?: number }).__ESSOR_HYDRATE_ORDINAL__ = 0;
}

export function resetHydrateOrdinal(): void {
  hydrateOrdinal = 0;
  try {
    (globalThis as { __ESSOR_HYDRATE_ORDINAL__?: number }).__ESSOR_HYDRATE_ORDINAL__ = 0;
  } catch {
    /* ignore */
  }
}

export function clearHydrateResources(): void {
  hydrateResourceMap = null;
  hydrateOrdinal = 0;
  try {
    delete (globalThis as { __ESSOR_HYDRATE_RESOURCES__?: unknown }).__ESSOR_HYDRATE_RESOURCES__;
    delete (globalThis as { __ESSOR_HYDRATE_ORDINAL__?: unknown }).__ESSOR_HYDRATE_ORDINAL__;
  } catch {
    /* ignore */
  }
}

function getHydrateMap(): Map<string, unknown> | null {
  if (hydrateResourceMap) return hydrateResourceMap;
  const g = (globalThis as { __ESSOR_HYDRATE_RESOURCES__?: Map<string, unknown> })
    .__ESSOR_HYDRATE_RESOURCES__;
  return g instanceof Map ? g : null;
}

function nextHydrateOrdinal(): number {
  if (hydrateResourceMap) return hydrateOrdinal++;
  const g = globalThis as { __ESSOR_HYDRATE_ORDINAL__?: number };
  const n = Number(g.__ESSOR_HYDRATE_ORDINAL__ ?? 0);
  g.__ESSOR_HYDRATE_ORDINAL__ = n + 1;
  return n;
}

export function createResource<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  options?: ResourceOptions<T>,
): [Resource<T>, ResourceActions<T>] {
  const immediate = options?.immediate !== false;
  const value = signal<T | undefined>(options?.initialValue);
  const loading = signal<boolean>(immediate && options?.initialValue === undefined);
  const error = signal<Error | null>(null);
  // Ready only when we have an initial value and won't immediately refetch.
  const state = signal<ResourceState>(
    !immediate && options?.initialValue !== undefined ? 'ready' : 'pending',
  );

  let fetchId = 0;
  let controller: AbortController | null = null;
  const suspenseContext = inject<SuspenseContextType | null>(SuspenseContext, null);

  const applyReady = (result: T) => {
    value.value = result;
    state.value = 'ready';
    loading.value = false;
    error.value = null;
  };

  const applyError = (error_: unknown) => {
    if (error_ instanceof DOMException && error_.name === 'AbortError') {
      loading.value = false;
      return;
    }
    error.value = error_ instanceof Error ? error_ : new Error(String(error_));
    state.value = 'errored';
    loading.value = false;
  };

  const doFetch = async (): Promise<void> => {
    const id = ++fetchId;

    controller?.abort();
    controller = new AbortController();

    loading.value = true;
    state.value = 'pending';
    error.value = null;

    let promise: Promise<T>;
    try {
      promise = Promise.resolve(fetcher(controller.signal));
    } catch (error_) {
      applyError(error_);
      return;
    }

    suspenseContext?.register(promise);

    try {
      const result = await promise;
      if (id === fetchId) applyReady(result);
    } catch (error_) {
      if (id !== fetchId) return;
      applyError(error_);
    }
  };

  // SSR bridge path: request-local dedupe / ready reuse.
  const ssr = getSSRExecutionState();
  const bridge = ssr?.resources;
  let ssrKey = options?.ssrKey;
  const hydrateMap = getHydrateMap();
  if ((bridge || hydrateMap) && !ssrKey) {
    // Auto ordinal key until Start compiler injects stable callsite keys (T6).
    if (bridge) {
      const meta = (ssr!.meta ??= {});
      const n = Number(meta.resourceOrdinal ?? 0);
      meta.resourceOrdinal = n + 1;
      ssrKey = `auto:${n}`;
    } else {
      ssrKey = `auto:${nextHydrateOrdinal()}`;
    }
  }
  if (bridge && ssrKey) {
    const record = bridge.read({ key: ssrKey, fetcher });
    if (record.state === 'ready') {
      applyReady(record.value as T);
    } else if (record.state === 'rejected') {
      applyError(record.error);
    } else {
      loading.value = true;
      state.value = 'pending';
      suspenseContext?.register(record.promise);
      const id = ++fetchId;
      record.promise.then(
        (result) => {
          if (id === fetchId) applyReady(result);
        },
        (error_) => {
          if (id === fetchId) applyError(error_);
        },
      );
    }
  } else if (hydrateMap && ssrKey && hydrateMap.has(ssrKey)) {
    // Client hydrate: reuse SSR payload without refetch.
    applyReady(hydrateMap.get(ssrKey) as T);
  } else if (hydrateMap && hydrateMap.size > 0 && ssrKey) {
    // Ordinal drift / remount: fall back to insertion order.
    const ordered = [...hydrateMap.values()];
    const idx = Number(String(ssrKey).replace(/^auto:/, ''));
    if (Number.isFinite(idx) && ordered[idx] !== undefined) {
      applyReady(ordered[idx] as T);
    } else if (immediate) {
      void doFetch();
    }
  } else if (immediate) {
    void doFetch();
  } else if (options?.initialValue !== undefined) {
    state.value = 'ready';
    loading.value = false;
  }

  onCleanup(() => {
    fetchId++;
    controller?.abort();
    controller = null;
  });

  const resource = (() => value.value) as Resource<T>;
  resource.loading = loading;
  resource.error = error;
  resource.state = state;

  const actions: ResourceActions<T> = {
    mutate: (newValue: T) => {
      applyReady(newValue);
    },
    refetch: () => doFetch(),
  };

  return [resource, actions];
}
