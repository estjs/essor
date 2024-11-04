import { computed, effect, signal } from '../src';

describe('computed', () => {
  it('should compute the correct value', () => {
    const testSignal = signal(10);
    const computedSignal = computed(() => testSignal.value * 2);
    expect(computedSignal.value).toBe(20);
    testSignal.value = 20;
    expect(computedSignal.value).toBe(40);
  });

  it('should compute the correct value with condition', () => {
    const conditionSignal = signal(false);
    const testSignal = signal(10);
    let effectTime = 0;
    const computedSignal = computed(() => {
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
    const count = signal(0);
    const double = computed(() => count.value * 2);
    const triple = computed(() => count.value * 3);
    count.value = 1;
    expect(double.value).toBe(2);
    expect(triple.value).toBe(3);
  });

  it('should work computed in effect', () => {
    const val = signal(0);
    const computedValue = computed(() => {
      return 10 * val.value;
    });

    let effectTimes = 0;
    effect(() => {
      computedValue.value;
      effectTimes++;
    });
    expect(effectTimes).toBe(1);
    val.value = 1;
    expect(effectTimes).toBe(2);
  });
});
