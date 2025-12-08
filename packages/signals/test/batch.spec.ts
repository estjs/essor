import { batch, effect, endBatch, getBatchDepth, isBatching, reactive, signal } from '../src';

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
});
