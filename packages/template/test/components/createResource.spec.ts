import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createResource } from '../../src/components/createResource';
import { createScope, runWithScope } from '../../src/scope';

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
        await new Promise(resolve => setTimeout(resolve, 10));

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

        await new Promise(resolve => setTimeout(resolve, 10));

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

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(resource.error.value).toBeInstanceOf(Error);
        expect(resource.error.value?.message).toBe('Fetch failed');
        expect(resource.state.value).toBe('errored');
        expect(resource.loading.value).toBe(false);
      });
    });

    it('should convert non-Error rejections to Error objects', async () => {
      await runWithScope(scope, async () => {
        const fetcher = () => Promise.reject('string error');
        const [resource] = createResource(fetcher);

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(resource.error.value).toBeInstanceOf(Error);
        expect(resource.error.value?.message).toBe('string error');
        expect(resource.state.value).toBe('errored');
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

        // Wait for initial error
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(resource.error.value).not.toBe(null);
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

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(resource.loading.value).toBe(false);
      });
    });

    it('should set loading to false after failed fetch', async () => {
      await runWithScope(scope, async () => {
        const fetcher = () => Promise.reject(new Error('Failed'));
        const [resource] = createResource(fetcher);

        expect(resource.loading.value).toBe(true);

        await new Promise(resolve => setTimeout(resolve, 10));

        expect(resource.loading.value).toBe(false);
      });
    });

    it('should transition through states correctly', async () => {
      await runWithScope(scope, async () => {
        const states: string[] = [];
        const fetcher = () => Promise.resolve('data');
        const [resource] = createResource(fetcher);

        states.push(resource.state.value);

        await new Promise(resolve => setTimeout(resolve, 10));

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

        await new Promise(resolve => setTimeout(resolve, 10));
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

        await new Promise(resolve => setTimeout(resolve, 10));
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

        await new Promise(resolve => setTimeout(resolve, 10));
        expect(resource.loading.value).toBe(false);

        const refetchPromise = refetch();
        expect(resource.loading.value).toBe(true);

        await refetchPromise;
        expect(resource.loading.value).toBe(false);
      });
    });
  });

  describe('concurrent fetch handling', () => {
    it('should only use result from latest fetch', async () => {
      await runWithScope(scope, async () => {
        let fetchCount = 0;
        let resolvers: Array<(value: string) => void> = [];
        const fetcher = () => {
          fetchCount++;
          return new Promise<string>(resolve => {
            resolvers.push(resolve);
          });
        };

        const [resource, { refetch }] = createResource(fetcher);

        // Wait a bit for initial fetch to start
        await new Promise(resolve => setTimeout(resolve, 5));

        // Start second fetch before first completes
        const refetchPromise = refetch();

        // Wait a bit for refetch to start
        await new Promise(resolve => setTimeout(resolve, 5));

        expect(resolvers.length).toBe(2);

        // Resolve second fetch first
        resolvers[1]('second');
        await refetchPromise;

        expect(resource()).toBe('second');

        // Resolve first fetch - should be ignored
        resolvers[0]('first');
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(resource()).toBe('second'); // Should still be 'second'
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

        // Wait for first fetch to reject
        await new Promise(resolve => setTimeout(resolve, 60));

        // Error should still be null
        expect(resource()).toBe('success');
        expect(resource.error.value).toBe(null);
      });
    });
  });
});
