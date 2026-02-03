import { type Signal, signal } from '@estjs/signals';
import { inject } from '../provide';
import { SuspenseContext } from './Suspense';

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

/**
 * Create a resource for async data fetching
 * Inspired by SolidJS createResource
 *
 * @param fetcher - Function that returns a Promise with the data
 * @param options - Optional configuration
 * @returns Tuple of [resource, actions]
 *
 * @example
 * ```typescript
 * const [data, { refetch, mutate }] = createResource(
 *   () => fetch('/api/user').then(r => r.json()),
 *   { initialValue: null }
 * );
 *
 * // Access data
 * console.log(data());
 * console.log(data.loading.value);
 * console.log(data.state.value);
 *
 * // Refetch data
 * await refetch();
 *
 * // Update data directly
 * mutate({ name: 'John' });
 * ```
 */
export function createResource<T>(
  fetcher: () => Promise<T>,
  options?: ResourceOptions<T>,
): [Resource<T>, ResourceActions<T>] {
  // Internal state
  const value = signal<T | undefined>(options?.initialValue);
  const loading = signal<boolean>(true);
  const error = signal<Error | null>(null);
  const state = signal<ResourceState>('pending');

  let fetchId = 0;

  let currentPromise: Promise<void> | null = null;

  // Fetch function
  const fetch = async (): Promise<void> => {
    const currentFetchId = ++fetchId;
    loading.value = true;
    state.value = 'pending';
    error.value = null;

    try {
      const promise = fetcher();
      currentPromise = promise.then(() => {}).catch(() => {}); // Ensure promise is handled
      const result = await promise;

      // Only update if this is still the latest fetch
      if (currentFetchId === fetchId) {
        value.value = result;
        state.value = 'ready';
        loading.value = false;
      }
    } catch (error_) {
      // Only update if this is still the latest fetch
      if (currentFetchId === fetchId) {
        error.value = error_ instanceof Error ? error_ : new Error(String(error_));
        state.value = 'errored';
        loading.value = false;
      }
    }
  };

  // Start initial fetch
  fetch();

  // Resource accessor function
  const resource = (() => {
    // If we are loading and have a suspense context, register the promise
    if (loading.value && currentPromise) {
      const suspenseContext = inject(SuspenseContext, null);
      if (suspenseContext) {
        // @ts-ignore
        suspenseContext.register(currentPromise);
      }
    }
    return value.value;
  }) as Resource<T>;
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
    refetch: async () => {
      await fetch();
    },
  };

  return [resource, actions];
}
