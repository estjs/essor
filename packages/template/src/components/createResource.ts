import { type Signal, signal } from '@estjs/signals';
import { inject } from '../provide';
import { onCleanup } from '../scope';
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
}

function isAbortError(error: unknown): boolean {
  return (
    !!error && typeof error === 'object' && (error as { name?: unknown }).name === 'AbortError'
  );
}

/**
 * Create a resource for async data fetching.
 * The fetcher receives an {@link AbortSignal} that is aborted when:
 * - A new fetch is triggered (refetch / concurrent call) — cancels the stale request.
 * - The owning scope is disposed (component unmount) — cancels the in-flight request.
 *
 * Pass the signal to `fetch(url, { signal })` or any cancellable API to enable
 * real request cancellation. Ignoring it is safe — stale results are still
 * discarded via the internal `fetchId` guard.
 *
 * @param fetcher - Function that receives an AbortSignal and returns a Promise.
 * @param options - Optional configuration.
 * @returns {[Resource<T>, ResourceActions<T>]} Tuple of [resource, actions].
 */
export function createResource<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  options?: ResourceOptions<T>,
): [Resource<T>, ResourceActions<T>] {
  // Internal state
  const value = signal<T | undefined>(options?.initialValue);
  const loading = signal<boolean>(true);
  const error = signal<Error | null>(null);
  const state = signal<ResourceState>('pending');

  let fetchId = 0;
  let controller: AbortController | null = null;
  const suspenseContext = inject<SuspenseContextType | null>(SuspenseContext, null);

  /**
   * Core fetch logic.
   * Aborts any previous in-flight request, creates a fresh AbortController,
   * and registers with Suspense (if available) via a single `register(promise)` call.
   */
  const doFetch = async (): Promise<void> => {
    const id = ++fetchId;

    // Abort the previous in-flight request
    controller?.abort();
    controller = new AbortController();

    loading.value = true;
    state.value = 'pending';
    error.value = null;

    let promise: Promise<T>;
    try {
      promise = Promise.resolve(fetcher(controller.signal));
    } catch (error_) {
      error.value = error_ instanceof Error ? error_ : new Error(String(error_));
      state.value = 'errored';
      loading.value = false;
      return;
    }

    // Single Suspense registration per fetch cycle.
    // The promise settling naturally drives Suspense back to content.
    suspenseContext?.register(promise);

    try {
      const result = await promise;

      // Only update if this is still the latest fetch
      if (id === fetchId) {
        value.value = result;
        state.value = 'ready';
        loading.value = false;
      }
    } catch (error_) {
      // Stale fetch — ignore entirely
      if (id !== fetchId) return;

      // AbortError is expected during cleanup / refetch, not a real error
      if (isAbortError(error_)) {
        // If still the active fetch, just reset loading state
        loading.value = false;
        return;
      }

      error.value = error_ instanceof Error ? error_ : new Error(String(error_));
      state.value = 'errored';
      loading.value = false;
    }
  };

  // Start initial fetch
  doFetch();

  // Abort in-flight request when the owning scope is disposed (component unmount)
  onCleanup(() => {
    fetchId++;
    controller?.abort();
    controller = null;
  });

  // Resource accessor — pure getter, no side effects
  const resource = (() => value.value) as Resource<T>;
  resource.loading = loading;
  resource.error = error;
  resource.state = state;

  // Actions
  const actions: ResourceActions<T> = {
    mutate: (newValue: T) => {
      value.value = newValue;
      state.value = 'ready';
      loading.value = false;
      error.value = null;
    },
    refetch: () => doFetch(),
  };

  return [resource, actions];
}
