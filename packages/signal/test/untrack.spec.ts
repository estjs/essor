import { effect, signal, unTrack } from '../src';

describe('unTrack', () => {
  it('should work basic unTrack', () => {
    const count = signal(0);
    const effectFn = vi.fn();

    effect(() => {
      effectFn(count.value);
    });

    unTrack(() => {
      count.value++;
      count.value++;
      count.value++;
    });

    expect(effectFn).toHaveBeenCalledTimes(1);
    expect(count.value).toBe(3);
  });

  it('should work in effect unTrack', () => {
    const count = signal(0);
    const effectFn = vi.fn();

    effect(() => {
      effectFn(count.value);
      unTrack(() => {
        count.value++;
        count.value++;
        count.value++;
      });
    });

    expect(effectFn).toHaveBeenCalledTimes(1);
    expect(count.value).toBe(3);
  });
});
