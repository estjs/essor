import {
  batch,
  effect,
  endBatch,
  getBatchDepth,
  isBatching,
  nextTick,
  reactive,
  signal,
  startBatch,
} from '../src';

describe('useBatch', () => {
  it('should useBatch multiple updates', () => {
    const count = signal(0);
    const effectFn = vi.fn();

    effect(() => {
      effectFn(count.value);
    });

    batch(() => {
      count.value++;
      count.value++;
      count.value++;
    });

    expect(effectFn).toHaveBeenCalledTimes(2); // initial run + one after batching
    expect(count.value).toBe(3);
  });

  it('should run all accumulated effects after the useBatch ends', () => {
    const obj = reactive({ a: 1, b: 2 });
    const effectFn1 = vi.fn();
    const effectFn2 = vi.fn();

    effect(() => effectFn1(obj.a));
    effect(() => effectFn2(obj.b));

    batch(() => {
      obj.a++;
      obj.b++;
    });

    expect(effectFn1).toHaveBeenCalledTimes(2); // initial + after batch
    expect(effectFn2).toHaveBeenCalledTimes(2);
  });

  it('should still run the useBatch even when an error occurs', () => {
    const count = signal(0);
    const effectFn = vi.fn();

    effect(() => effectFn(count.value));

    expect(() => {
      batch(() => {
        count.value++;
        throw new Error('Test error');
      });
    }).toThrow('Test error');

    expect(effectFn).toHaveBeenCalledTimes(2);
    expect(count.value).toBe(1);
  });
  it('should handle nested batches', () => {
    const count = signal(0);
    const fn = vi.fn();
    effect(() => fn(count.value));
    fn.mockClear();

    batch(() => {
      count.value = 1;
      expect(fn).not.toHaveBeenCalled();

      batch(() => {
        count.value = 2;
        expect(fn).not.toHaveBeenCalled();
      });

      expect(fn).not.toHaveBeenCalled();
    });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(2);
  });

  it('should expose batch status utilities', () => {
    expect(isBatching()).toBe(false);
    expect(getBatchDepth()).toBe(0);

    batch(() => {
      expect(isBatching()).toBe(true);
      expect(getBatchDepth()).toBe(1);

      batch(() => {
        expect(isBatching()).toBe(true);
        expect(getBatchDepth()).toBe(2);
      });

      expect(getBatchDepth()).toBe(1);
    });

    expect(isBatching()).toBe(false);
    expect(getBatchDepth()).toBe(0);
  });

  it('should warn on unbalanced batch calls in dev', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Manually call endBatch without startBatch
    endBatch();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Batch] endBatch() called without matching startBatch()'),
    );
    warnSpy.mockRestore();
  });

  // SIG-24: unbalanced endBatch must not push batchDepth negative
  it('should not let an extra endBatch() make a later startBatch() flush early', async () => {
    // Silence the DEV-only unbalanced-batch warning.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const count = signal(0);
    const effectFn = vi.fn();

    effect(() => effectFn(count.value));
    effectFn.mockClear();

    // Extra endBatch() — must be a no-op, not push batchDepth negative.
    endBatch();

    startBatch();
    count.value = 1;
    // Still inside the batch: the effect must not have flushed early.
    expect(effectFn).not.toHaveBeenCalled();
    endBatch();
    await nextTick();

    expect(effectFn).toHaveBeenCalledTimes(1);
    expect(effectFn).toHaveBeenCalledWith(1);
    warnSpy.mockRestore();
  });

  // SIG-18: batch inside a flushing job
  it('should not recursively flush when a job uses batch()', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const a = signal(0);
    const b = signal(0);
    const order: string[] = [];

    effect(() => {
      order.push(`A:${a.value}`);
      if (a.value === 1) {
        // Ending this batch inside the running flush must not re-enter
        // flushJobs — the outer flush picks up effect B in the same cycle.
        batch(() => {
          b.value = 1;
        });
      }
    });
    effect(() => {
      order.push(`B:${b.value}`);
    });

    order.length = 0;
    a.value = 1;
    await nextTick();

    // Each effect ran exactly once for the update, in stable queue order.
    expect(order).toEqual(['A:1', 'B:1']);
    expect(warnSpy.mock.calls.some(args => String(args[0]).includes('Maximum recursive'))).toBe(
      false,
    );
    warnSpy.mockRestore();
  });
});
