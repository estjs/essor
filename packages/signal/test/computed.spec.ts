import { useComputed, useEffect, useSignal } from '../src';

describe('useComputed', () => {
  it('should compute the correct value', () => {
    const testSignal = useSignal(10);
    const computedSignal = useComputed(() => testSignal.value * 2);
    expect(computedSignal.value).toBe(20);
    testSignal.value = 20;
    expect(computedSignal.value).toBe(40);
  });

  it('should compute the correct value with condition', () => {
    const conditionSignal = useSignal(false);
    const testSignal = useSignal(10);
    let effectTime = 0;
    const computedSignal = useComputed(() => {
      effectTime++;
      return conditionSignal.value ? 50 : testSignal.value * 2;
    });

    expect(effectTime).toBe(1);
    expect(computedSignal.peek()).toBe(20);
    testSignal.value = 20;
    expect(effectTime).toBe(2);
    conditionSignal.value = true;
    expect(effectTime).toBe(3);
    expect(computedSignal.value).toBe(50);
    conditionSignal.value = false;
    expect(effectTime).toBe(4);
    testSignal.value = 30;
    expect(effectTime).toBe(5);
    expect(computedSignal.value).toBe(60);
  });

  it('should get correct value', () => {
    const count = useSignal(0);
    const double = useComputed(() => count.value * 2);
    const triple = useComputed(() => count.value * 3);
    count.value = 1;
    expect(double.value).toBe(2);
    expect(triple.value).toBe(3);
  });

  it('should work useComputed in useEffect', () => {
    const val = useSignal(0);
    const computedValue = useComputed(() => {
      return 10 * val.value;
    });

    let effectTimes = 0;
    useEffect(() => {
      computedValue.value;
      effectTimes++;
    });
    expect(effectTimes).toBe(1);
    val.value = 1;
    expect(effectTimes).toBe(2);
  });
});
