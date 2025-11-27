import { effect, signal, untrack } from '../src';

describe('untrack', () => {
  it('should work basic untrack', () => {
    const count = signal(0);
    const effectFn = vi.fn();

    effect(() => {
      effectFn(count.value);
    });
    expect(effectFn).toHaveBeenCalledTimes(1);
    untrack(() => {
      count.value++;
      count.value++;
      count.value++;
    });

    expect(effectFn).toHaveBeenCalledTimes(2);
    expect(count.value).toBe(3);
  });

  it('should work in effect untrack', () => {
    const count = signal(0);
    const effectFn = vi.fn();

    effect(() => {
      effectFn(count.value);
      untrack(() => {
        count.value++;
        count.value++;
        count.value++;
      });
    });

    expect(effectFn).toHaveBeenCalledTimes(1);
    expect(count.value).toBe(3);
  });
});
