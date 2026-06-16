import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createResource } from '../../src/components/createResource';
import { SuspenseContext } from '../../src/components/Suspense';
import { provide } from '../../src/provide';
import { createScope, disposeScope, runWithScope } from '../../src/scope';

// Feature: code-quality-improvement, Property 13: Template createResource.ts 覆蓋率目標
describe('createResource', () => {
  let scope: any;

  beforeEach(() => {
    scope = createScope(null);
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('basic resource loading', () => {
    it('should create resource with initial loading state', () => {
      runWithScope(scope, () => {
        const fetcher = () => Promise.resolve('data');
        const [resource] = createResource(fetcher);

        expect(resource.loading.value).toBe(true);
        expect(resource.state.value).toBe('pending');
        expect(resource.error.value).toBe(null);
        expect(resource()).toBeUndefined();
      });
    });

    it('should load data successfully', async () => {
      await runWithScope(scope, async () => {
        const fetcher = () => Promise.resolve('test data');
        const [resource] = createResource(fetcher);

        expect(resource.loading.value).toBe(true);
        expect(resource.state.value).toBe('pending');

        // Wait for promise to resolve
        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(resource()).toBe('test data');
        expect(resource.loading.value).toBe(false);
        expect(resource.state.value).toBe('ready');
        expect(resource.error.value).toBe(null);
      });
    });

    it('should use initial value when provided', () => {
      runWithScope(scope, () => {
        const fetcher = () => Promise.resolve('new data');
        const [resource] = createResource(fetcher, { initialValue: 'initial' });

        expect(resource()).toBe('initial');
        expect(resource.loading.value).toBe(true);
        expect(resource.state.value).toBe('pending');
      });
    });

    it('should update to fetched data after initial value', async () => {
      await runWithScope(scope, async () => {
        const fetcher = () => Promise.resolve('fetched data');
        const [resource] = createResource(fetcher, { initialValue: 'initial' });

        expect(resource()).toBe('initial');

        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(resource()).toBe('fetched data');
        expect(resource.loading.value).toBe(false);
        expect(resource.state.value).toBe('ready');
      });
    });
  });

  describe('error handling', () => {
    it('should handle fetch errors', async () => {
      await runWithScope(scope, async () => {
        const error = new Error('Fetch failed');
        const fetcher = () => Promise.reject(error);
        const [resource] = createResource(fetcher);

        expect(resource.loading.value).toBe(true);
        expect(resource.state.value).toBe('pending');

        // Wait for the error to be caught and processed
        await vi.waitFor(() => {
          expect(resource.error.value).toBeInstanceOf(Error);
        });

        expect(resource.error.value?.message).toBe('Fetch failed');
        expect(resource.state.value).toBe('errored');
        expect(resource.loading.value).toBe(false);
      });
    });

    it('should convert non-Error rejections to Error objects', async () => {
      await runWithScope(scope, async () => {
        const fetcher = () => Promise.reject('string error');
        const [resource] = createResource(fetcher);

        // Wait for the error to be caught and processed
        await vi.waitFor(() => {
          expect(resource.error.value).toBeInstanceOf(Error);
        });

        expect(resource.error.value?.message).toBe('string error');
        expect(resource.state.value).toBe('errored');
      });
    });

    it('should capture synchronous fetcher errors', async () => {
      await runWithScope(scope, async () => {
        const thrown = new Error('sync failure');
        const fetcher = () => {
          throw thrown;
        };
        const [resource] = createResource(fetcher);

        await vi.waitFor(() => {
          expect(resource.loading.value).toBe(false);
        });

        expect(resource.error.value).toBe(thrown);
        expect(resource.state.value).toBe('errored');
        expect(resource()).toBeUndefined();
      });
    });

    it('should clear error on successful refetch', async () => {
      await runWithScope(scope, async () => {
        let shouldFail = true;
        const fetcher = () => {
          if (shouldFail) {
            return Promise.reject(new Error('Failed'));
          }
          return Promise.resolve('success');
        };

        const [resource, { refetch }] = createResource(fetcher);

        // Wait for initial error to be caught and processed
        await vi.waitFor(() => {
          expect(resource.error.value).not.toBe(null);
        });
        expect(resource.state.value).toBe('errored');

        // Refetch with success
        shouldFail = false;
        await refetch();

        expect(resource()).toBe('success');
        expect(resource.error.value).toBe(null);
        expect(resource.state.value).toBe('ready');
        expect(resource.loading.value).toBe(false);
      });
    });
  });

  describe('loading state management', () => {
    it('should set loading to true during fetch', () => {
      runWithScope(scope, () => {
        const fetcher = () => new Promise(() => {}); // Never resolves
        const [resource] = createResource(fetcher);

        expect(resource.loading.value).toBe(true);
        expect(resource.state.value).toBe('pending');
      });
    });

    it('should set loading to false after successful fetch', async () => {
      await runWithScope(scope, async () => {
        const fetcher = () => Promise.resolve('data');
        const [resource] = createResource(fetcher);

        expect(resource.loading.value).toBe(true);

        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(resource.loading.value).toBe(false);
      });
    });

    it('should set loading to false after failed fetch', async () => {
      await runWithScope(scope, async () => {
        const fetcher = () => Promise.reject(new Error('Failed'));
        const [resource] = createResource(fetcher);

        expect(resource.loading.value).toBe(true);

        // Wait for the error to be caught and processed
        await vi.waitFor(() => {
          expect(resource.loading.value).toBe(false);
        });
      });
    });

    it('should transition through states correctly', async () => {
      await runWithScope(scope, async () => {
        const states: string[] = [];
        const fetcher = () => Promise.resolve('data');
        const [resource] = createResource(fetcher);

        states.push(resource.state.value);

        await new Promise((resolve) => setTimeout(resolve, 10));

        states.push(resource.state.value);

        expect(states).toEqual(['pending', 'ready']);
      });
    });
  });

  describe('resource actions', () => {
    it('should mutate resource value directly', async () => {
      await runWithScope(scope, async () => {
        const fetcher = () => Promise.resolve('original');
        const [resource, { mutate }] = createResource(fetcher);

        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(resource()).toBe('original');

        mutate('mutated');

        expect(resource()).toBe('mutated');
        expect(resource.state.value).toBe('ready');
        expect(resource.loading.value).toBe(false);
        expect(resource.error.value).toBe(null);
      });
    });

    it('should refetch data', async () => {
      await runWithScope(scope, async () => {
        let counter = 0;
        const fetcher = () => Promise.resolve(`data-${++counter}`);
        const [resource, { refetch }] = createResource(fetcher);

        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(resource()).toBe('data-1');

        await refetch();
        expect(resource()).toBe('data-2');

        await refetch();
        expect(resource()).toBe('data-3');
      });
    });

    it('should set loading state during refetch', async () => {
      await runWithScope(scope, async () => {
        const fetcher = () => Promise.resolve('data');
        const [resource, { refetch }] = createResource(fetcher);

        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(resource.loading.value).toBe(false);

        const refetchPromise = refetch();
        expect(resource.loading.value).toBe(true);

        await refetchPromise;
        expect(resource.loading.value).toBe(false);
      });
    });
  });

  describe('abort controller', () => {
    it('should pass AbortSignal to fetcher', () => {
      runWithScope(scope, () => {
        let receivedSignal: AbortSignal | null = null;
        const fetcher = (signal: AbortSignal) => {
          receivedSignal = signal;
          return Promise.resolve('data');
        };

        createResource(fetcher);

        expect(receivedSignal).toBeInstanceOf(AbortSignal);
        expect(receivedSignal!.aborted).toBe(false);
      });
    });

    it('should abort previous request on refetch', async () => {
      await runWithScope(scope, async () => {
        const signals: AbortSignal[] = [];
        const fetcher = (signal: AbortSignal) => {
          signals.push(signal);
          return new Promise<string>((resolve) => {
            setTimeout(() => resolve(`data-${signals.length}`), 50);
          });
        };

        const [, { refetch }] = createResource(fetcher);

        // Wait for first fetch to start
        await new Promise((resolve) => setTimeout(resolve, 5));
        expect(signals.length).toBe(1);
        expect(signals[0].aborted).toBe(false);

        // Start refetch — should abort the first
        refetch();
        await new Promise((resolve) => setTimeout(resolve, 5));

        expect(signals.length).toBe(2);
        expect(signals[0].aborted).toBe(true); // First request aborted
        expect(signals[1].aborted).toBe(false); // Second still active
      });
    });

    it('should abort on scope dispose', () => {
      let capturedSignal: AbortSignal | null = null;
      const childScope = createScope(null);

      runWithScope(childScope, () => {
        const fetcher = (signal: AbortSignal) => {
          capturedSignal = signal;
          return new Promise<string>(() => {}); // Never resolves
        };
        createResource(fetcher);
      });

      expect(capturedSignal).toBeInstanceOf(AbortSignal);
      expect(capturedSignal!.aborted).toBe(false);

      // Dispose the scope — should abort
      disposeScope(childScope);
      expect(capturedSignal!.aborted).toBe(true);
    });

    it('should ignore late results after scope dispose when fetcher ignores abort', async () => {
      let resolveFetch!: (value: string) => void;
      let resource: ReturnType<typeof createResource<string>>[0];
      const childScope = createScope(null);

      runWithScope(childScope, () => {
        const fetcher = () =>
          new Promise<string>((resolve) => {
            resolveFetch = resolve;
          });
        [resource] = createResource(fetcher);
      });

      disposeScope(childScope);
      resolveFetch('late data');
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(resource!()).toBeUndefined();
      expect(resource!.state.value).toBe('pending');
    });
  });

  describe('suspense integration', () => {
    it('registers promise with Suspense on each fetch cycle', async () => {
      await runWithScope(scope, async () => {
        let resolveInitial!: (value: string) => void;
        let resolveRefetch!: (value: string) => void;
        let fetchCount = 0;
        const register = vi.fn();

        provide(SuspenseContext as any, {
          register,
          increment: vi.fn(),
          decrement: vi.fn(),
        });

        const fetcher = () =>
          new Promise<string>((resolve) => {
            fetchCount++;
            if (fetchCount === 1) {
              resolveInitial = resolve;
            } else {
              resolveRefetch = resolve;
            }
          });

        const [resource, { refetch }] = createResource(fetcher);

        // Initial fetch registers once
        expect(register).toHaveBeenCalledTimes(1);
        expect(register.mock.calls[0]?.[0]).toBeInstanceOf(Promise);

        resolveInitial('first');
        await vi.waitFor(() => {
          expect(resource.loading.value).toBe(false);
        });
        expect(resource()).toBe('first');

        // Refetch registers again
        const refetchPromise = refetch();
        expect(register).toHaveBeenCalledTimes(2);
        expect(register.mock.calls[1]?.[0]).toBeInstanceOf(Promise);

        resolveRefetch('second');
        await refetchPromise;
        expect(resource()).toBe('second');
      });
    });

    it('resource accessor is a pure getter (no Suspense side effects)', () => {
      runWithScope(scope, () => {
        const register = vi.fn();

        provide(SuspenseContext as any, {
          register,
          increment: vi.fn(),
          decrement: vi.fn(),
        });

        const fetcher = () => Promise.resolve('data');
        const [resource] = createResource(fetcher);

        // register is called once during doFetch, not from accessor
        expect(register).toHaveBeenCalledTimes(1);

        // Reading the accessor multiple times does NOT trigger additional registrations
        resource();
        resource();
        resource();
        expect(register).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('concurrent fetch handling', () => {
    it('should only use result from latest fetch', async () => {
      await runWithScope(scope, async () => {
        let fetchCount = 0;
        const resolvers: Array<(value: string) => void> = [];
        const fetcher = () => {
          fetchCount++;
          return new Promise<string>((resolve) => {
            resolvers.push(resolve);
          });
        };

        const [resource, { refetch }] = createResource(fetcher);

        // Wait a bit for initial fetch to start
        await new Promise((resolve) => setTimeout(resolve, 5));

        // Start second fetch before first completes
        const refetchPromise = refetch();

        // Wait a bit for refetch to start
        await new Promise((resolve) => setTimeout(resolve, 5));

        expect(resolvers.length).toBe(2);

        // Resolve second fetch first
        resolvers[1]('second');
        await refetchPromise;

        expect(resource()).toBe('second');

        // Resolve first fetch - should be ignored
        resolvers[0]('first');
        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(resource()).toBe('second'); // Should still be 'second'

        expect(fetchCount).toBe(2);
      });
    });

    it('should ignore errors from outdated fetches', async () => {
      await runWithScope(scope, async () => {
        let fetchCount = 0;
        const fetcher = () => {
          fetchCount++;
          if (fetchCount === 1) {
            return new Promise<string>((_, reject) => {
              setTimeout(() => reject(new Error('old error')), 50);
            });
          } else {
            return Promise.resolve('success');
          }
        };

        const [resource, { refetch }] = createResource(fetcher);

        // Start refetch immediately
        await refetch();

        expect(resource()).toBe('success');
        expect(resource.error.value).toBe(null);

        // Wait for first fetch to reject (it will be caught internally)
        await new Promise((resolve) => setTimeout(resolve, 60));

        // Error should still be null
        expect(resource()).toBe('success');
        expect(resource.error.value).toBe(null);
      });
    });
  });
});
