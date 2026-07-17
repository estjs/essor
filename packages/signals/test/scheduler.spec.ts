import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createScheduler,
  flushJobs,
  nextTick,
  queueJob,
  queuePostFlushJob,
  queuePreFlushCb,
} from '../src/scheduler';

// Reset modules between tests to ensure a clean state
beforeEach(() => {
  vi.resetModules();
});

describe('nextTick', () => {
  it('should execute the function in the next microtask', async () => {
    const fn = vi.fn();
    nextTick(fn);
    expect(fn).not.toHaveBeenCalled(); // should not be called immediately
    await nextTick();
    expect(fn).toHaveBeenCalled(); // called after the next tick
  });

  it('should return a Promise that resolves', async () => {
    const result = nextTick();
    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toBeUndefined();
  });
});

describe('queueJob', () => {
  it('should execute jobs in the queue', async () => {
    const mockJob1 = vi.fn();
    const mockJob2 = vi.fn();

    queueJob(mockJob1);
    queueJob(mockJob2);

    await nextTick();

    expect(mockJob1).toHaveBeenCalled();
    expect(mockJob2).toHaveBeenCalled();
  });

  it('should execute pre-flush callbacks before jobs', async () => {
    const preFlushCb = vi.fn();
    const mockJob = vi.fn();

    queuePreFlushCb(preFlushCb);
    queueJob(mockJob);

    await nextTick();

    expect(preFlushCb).toHaveBeenCalled();
    expect(mockJob).toHaveBeenCalled();
  });

  it('should handle multiple pre-flush callbacks', async () => {
    const preFlushCb1 = vi.fn();
    const preFlushCb2 = vi.fn();
    const mockJob = vi.fn();

    queuePreFlushCb(preFlushCb1);
    queuePreFlushCb(preFlushCb2);
    queueJob(mockJob);

    await nextTick();

    expect(preFlushCb1).toHaveBeenCalled();
    expect(preFlushCb2).toHaveBeenCalled();
    expect(mockJob).toHaveBeenCalled();
  });

  it('should not add duplicate jobs to the queue', async () => {
    const mockJob = vi.fn();

    queueJob(mockJob);
    queueJob(mockJob);

    await nextTick();

    expect(mockJob).toHaveBeenCalledTimes(1);
  });

  it('should handle pre-flush callbacks without duplication', async () => {
    const preFlushCb = vi.fn();

    queuePreFlushCb(preFlushCb);
    queuePreFlushCb(preFlushCb);

    await nextTick();

    expect(preFlushCb).toHaveBeenCalledTimes(1);
  });
});

describe('scheduler phase invariant (SIG-18)', () => {
  it('should run post-flush callbacks after main jobs queued during the flush', async () => {
    const order: string[] = [];

    // Job A queues a post-flush callback and a new main job B.
    // The post callback must wait until B (queued in the same round) has run.
    queueJob(() => {
      order.push('A');
      queuePostFlushJob(() => order.push('post'));
      queueJob(() => order.push('B'));
    });

    await nextTick();

    expect(order).toEqual(['A', 'B', 'post']);
  });

  it('should run pre-flush callbacks queued by a main job before the next main job', async () => {
    const order: string[] = [];

    queueJob(() => {
      order.push('main1');
      queuePreFlushCb(() => order.push('pre'));
    });
    queueJob(() => order.push('main2'));

    await nextTick();

    expect(order).toEqual(['main1', 'pre', 'main2']);
  });

  it('should run new rounds for jobs queued by post-flush callbacks, with post waiting again', async () => {
    const order: string[] = [];

    queueJob(() => order.push('main1'));
    queuePostFlushJob(() => {
      order.push('post1');
      // A post callback queues new pre/main jobs — they must run in a new
      // round, and subsequently queued post callbacks must wait for them.
      queuePreFlushCb(() => order.push('pre2'));
      queueJob(() => order.push('main2'));
      queuePostFlushJob(() => order.push('post2'));
    });

    await nextTick();

    expect(order).toEqual(['main1', 'post1', 'pre2', 'main2', 'post2']);
  });

  it('should ignore re-entrant flushJobs calls during a flush', async () => {
    const order: string[] = [];

    queueJob(() => {
      order.push('A');
      queuePostFlushJob(() => order.push('post'));
      queueJob(() => order.push('B'));
      // Re-entrant flush must be a no-op — otherwise 'post' would run
      // before 'B'.
      flushJobs();
      order.push('A:end');
    });

    await nextTick();

    expect(order).toEqual(['A', 'A:end', 'B', 'post']);
  });
});

describe('scheduler', () => {
  it('should handle multiple jobs in correct order', async () => {
    const order: number[] = [];

    queueJob(() => order.push(1));
    queueJob(() => order.push(2));
    queueJob(() => order.push(3));

    await nextTick();
    expect(order).toEqual([1, 2, 3]);
  });

  it('should deduplicate jobs', async () => {
    const counter = { count: 0 };
    const job = () => counter.count++;

    queueJob(job);
    queueJob(job);
    queueJob(job);

    await nextTick();
    expect(counter.count).toBe(1);
  });

  it('should handle pre-flush callbacks', async () => {
    const order: string[] = [];

    queuePreFlushCb(() => order.push('pre-1'));
    queueJob(() => order.push('job-1'));
    queuePreFlushCb(() => order.push('pre-2'));

    await nextTick();
    expect(order).toEqual(['pre-1', 'pre-2', 'job-1']);
  });

  it('should handle nested queueJob calls', async () => {
    const order: number[] = [];

    queueJob(() => {
      order.push(1);
      queueJob(() => order.push(2));
    });

    await nextTick();
    expect(order).toEqual([1, 2]);
  });

  it('should work with createScheduler', () => {
    const scheduler = createScheduler(() => {}, 'post');
    scheduler();

    expect(scheduler).toBeDefined();
  });
});

describe('scheduler Test Suite', () => {
  let mockEffect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockEffect = vi.fn();

    // Spy on console methods
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createScheduler', () => {
    it('sync mode should execute effect immediately', () => {
      const scheduler = createScheduler(() => new mockEffect(), 'sync');
      scheduler();
      expect(mockEffect).toHaveBeenCalledTimes(1);
    });

    it('pre mode should execute effect in the next microtask', async () => {
      const scheduler = createScheduler(() => new mockEffect(), 'pre');
      scheduler();
      expect(mockEffect).not.toHaveBeenCalled();

      await nextTick();
      expect(mockEffect).toHaveBeenCalledTimes(1);
    });

    it('post mode should execute effect in the next microtask', async () => {
      const scheduler = createScheduler(() => new mockEffect(), 'post');
      scheduler();
      expect(mockEffect).not.toHaveBeenCalled();

      await nextTick();
      expect(mockEffect).toHaveBeenCalledTimes(1);
    });

    it('microtask scheduling - nextTick should correctly return Promise', async () => {
      const spy = vi.fn();
      await nextTick(spy);
      expect(spy).toHaveBeenCalled();
    });

    it('microtask scheduling - flushJobs should execute pre-processing and main queue in order', async () => {
      const executionOrder: string[] = [];

      queuePreFlushCb(() => {
        executionOrder.push('pre');
      });

      queueJob(() => {
        executionOrder.push('job');
      });

      await nextTick();
      expect(executionOrder).toEqual(['pre', 'job']);
    });

    it('error handling - development environment should catch job errors', async () => {
      // @ts-expect-error setting __DEV__ for testing
      globalThis.__DEV__ = true;

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const faultyJob = () => {
        throw new Error('test');
      };

      queueJob(faultyJob);
      await nextTick();

      expect(errorSpy).toHaveBeenCalledWith(
        '[Essor error]: Error executing queued job:',
        expect.any(Error),
      );
    });

    it('error handling - should handle errors in pre-flush callbacks', async () => {
      // @ts-expect-error setting __DEV__ for testing
      globalThis.__DEV__ = true;

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const successfulCallbacks: number[] = [];

      // Add successful callback
      queuePreFlushCb(() => {
        successfulCallbacks.push(1);
      });

      // Add faulty callback
      queuePreFlushCb(() => {
        successfulCallbacks.push(2);
        throw new Error('Pre-flush callback error');
      });

      // Add another successful callback
      queuePreFlushCb(() => {
        successfulCallbacks.push(3);
      });

      await nextTick();

      // Verify all callbacks were attempted
      expect(successfulCallbacks).toEqual([1, 2, 3]);

      // Verify error was logged
      expect(errorSpy).toHaveBeenCalledWith(
        '[Essor error]: Error executing pre-flush callback:',
        expect.any(Error),
      );
    });

    it('error handling - production environment should ignore job errors', async () => {
      // @ts-expect-error setting __DEV__ for testing
      globalThis.__DEV__ = false;

      const errorSpy = vi.spyOn(console, 'error');
      const faultyJob = () => {
        throw new Error('test');
      };

      queueJob(faultyJob);
      await nextTick();

      expect(errorSpy).not.toHaveBeenCalled();

      // Reset __DEV__ for other tests
      // @ts-expect-error setting __DEV__ for testing
      globalThis.__DEV__ = true;
    });

    it('edge cases - invalid flush parameter should trigger warning', async () => {
      // @ts-expect-error setting __DEV__ for testing
      globalThis.__DEV__ = true;

      const warnSpy = vi.spyOn(console, 'warn');

      // @ts-expect-error testing invalid parameters
      const scheduler = createScheduler(mockEffect, 'invalid');
      scheduler();

      await nextTick();
      expect(warnSpy).toHaveBeenCalled();
    });

    it('edge cases - empty queue should not trigger processing', () => {
      expect(() => flushJobs()).not.toThrow();
    });

    describe('recursion guard', () => {
      it('bails out and warns when jobs re-queue unboundedly', () => {
        // @ts-expect-error setting __DEV__ for testing
        globalThis.__DEV__ = true;
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        let runs = 0;
        // Each drain enqueues a *fresh* closure, so the Set never dedups it and
        // the while-loop would spin forever without the recursion guard.
        const makeJob = (): (() => void) => () => {
          runs++;
          queueJob(makeJob());
        };

        queueJob(makeJob());
        // Drive the flush synchronously to keep the test deterministic.
        flushJobs();

        // RECURSION_LIMIT is 100 — the loop must stop near there, not spin forever.
        expect(runs).toBeLessThanOrEqual(101);
        expect(runs).toBeGreaterThan(1);
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Maximum recursive flush count'),
        );

        warnSpy.mockRestore();
      });

      it('does not warn for normal cascading jobs that terminate', () => {
        // @ts-expect-error setting __DEV__ for testing
        globalThis.__DEV__ = true;
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        let remaining = 5;
        const cascade = (): void => {
          if (remaining-- > 0) {
            queueJob(() => cascade());
          }
        };

        queueJob(() => cascade());
        flushJobs();

        expect(warnSpy).not.toHaveBeenCalled();
        warnSpy.mockRestore();
      });

      it('warns even in production when jobs are dropped (data-loss level event)', () => {
        // Dropping queued jobs is a data-loss level event — the warning must
        // fire regardless of __DEV__ so production apps get a signal too.
        // @ts-expect-error setting __DEV__ for testing
        globalThis.__DEV__ = false;
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const makeJob = (): (() => void) => () => {
          queueJob(makeJob());
        };

        queueJob(makeJob());
        flushJobs();

        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Maximum recursive flush count'),
        );

        warnSpy.mockRestore();
        // @ts-expect-error restore
        globalThis.__DEV__ = true;
      });

      it('drops remaining jobs after exceeding the limit so the queue is left clean', () => {
        // @ts-expect-error setting __DEV__ for testing
        globalThis.__DEV__ = false;
        // The drop warning fires even in production; silence it here.
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const sibling = vi.fn();

        const makeJob = (): (() => void) => () => {
          queueJob(makeJob());
          queueJob(sibling);
        };

        queueJob(makeJob());
        flushJobs();

        // After bail-out the queue is cleared; a fresh flush runs nothing.
        sibling.mockClear();
        flushJobs();
        expect(sibling).not.toHaveBeenCalled();

        warnSpy.mockRestore();
        // @ts-expect-error restore
        globalThis.__DEV__ = true;
      });
    });
  });
});
