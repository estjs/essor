import { useComputed, useSignal, useWatch } from '../src';

describe('useWatch', () => {
  it('should call callback with new and old values for signals', () => {
    const count = useSignal(0);
    const mockCallback = vi.fn();

    useWatch(count, mockCallback);

    expect(mockCallback).not.toHaveBeenCalled();

    count.value = 1;
    expect(mockCallback).toHaveBeenCalledTimes(1);
    expect(mockCallback).toHaveBeenCalledWith(1, 0);

    count.value = 2;
    expect(mockCallback).toHaveBeenCalledTimes(2);
    expect(mockCallback).toHaveBeenCalledWith(2, 1);
  });

  it('should call callback with new and old values for computed properties', () => {
    const count = useSignal(0);
    const double = useComputed(() => count.value * 2);
    const mockCallback = vi.fn();

    useWatch(double, mockCallback);

    expect(mockCallback).not.toHaveBeenCalled();

    count.value = 1;
    expect(mockCallback).toHaveBeenCalledTimes(1);
    expect(mockCallback).toHaveBeenCalledWith(2, 0);

    count.value = 2;
    expect(mockCallback).toHaveBeenCalledTimes(2);
    expect(mockCallback).toHaveBeenCalledWith(4, 2);
  });

  it('should call callback with new and old values for functions', () => {
    const count = useSignal(0);
    const mockCallback = vi.fn();
    const getter = () => count.value * 3;

    useWatch(getter, mockCallback);

    expect(mockCallback).not.toHaveBeenCalled();

    count.value = 1;
    expect(mockCallback).toHaveBeenCalledTimes(1);
    expect(mockCallback).toHaveBeenCalledWith(3, 0);

    count.value = 2;
    expect(mockCallback).toHaveBeenCalledTimes(2);
    expect(mockCallback).toHaveBeenCalledWith(6, 3);
  });

  it('should stop watching when stop function is called', () => {
    const count = useSignal(0);
    const mockCallback = vi.fn();

    const stopWatch = useWatch(count, mockCallback);

    count.value = 1;
    expect(mockCallback).toHaveBeenCalledTimes(1);
    expect(mockCallback).toHaveBeenCalledWith(1, 0);

    stopWatch();
    count.value = 2;
    expect(mockCallback).toHaveBeenCalledTimes(1); // No further calls after stop
  });
});
