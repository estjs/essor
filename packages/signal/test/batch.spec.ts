import { effect, reactive, signal, useBatch } from '../src';

describe('useBatch', () => {
  it('should useBatch multiple updates', () => {
    const count = signal(0);
    const effectFn = vi.fn();

    effect(() => {
      effectFn(count.value);
    });

    useBatch(() => {
      count.value++;
      count.value++;
      count.value++;
    });

    expect(effectFn).toHaveBeenCalledTimes(2); // Called once during initialization, and once after batching
    expect(count.value).toBe(3);
  });

  it('should run all accumulated effects after the useBatch ends', () => {
    const obj = reactive({ a: 1, b: 2 });
    const effectFn1 = vi.fn();
    const effectFn2 = vi.fn();

    effect(() => effectFn1(obj.a));
    effect(() => effectFn2(obj.b));

    useBatch(() => {
      obj.a++;
      obj.b++;
    });

    expect(effectFn1).toHaveBeenCalledTimes(2); // Called once during initialization, and once after batching
    expect(effectFn2).toHaveBeenCalledTimes(2); // Called once during initialization, and once after batching
  });

  it('should still run the useBatch even when an error occurs', () => {
    const count = signal(0);
    const effectFn = vi.fn();

    effect(() => effectFn(count.value));

    expect(() => {
      useBatch(() => {
        count.value++;
        throw new Error('Test error');
      });
    }).toThrow('Test error');

    expect(effectFn).toHaveBeenCalledTimes(2); // Called once during initialization, and once after batching
    expect(count.value).toBe(1);
  });
});
