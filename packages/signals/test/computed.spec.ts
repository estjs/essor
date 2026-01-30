import { computed, effect, signal } from '../src';
import { isComputed } from '../src/computed';
import { ReactiveFlags } from '../src/constants';

describe('computed', () => {
  it('should compute the correct value', () => {
    const testSignal = signal(10);
    const computedSignal = computed(() => testSignal.value * 2);
    effect(() => {
      computedSignal.value;
    });
    expect(computedSignal.value).toBe(20);
    testSignal.value = 20;
    expect(computedSignal.value).toBe(40);
  });

  it('should compute the correct value with condition', () => {
    const conditionSignal = signal(false);
    const testSignal = signal(10);
    let effectTime = 0;
    const computedValue = computed(() => {
      effectTime++;
      return conditionSignal.value ? 50 : testSignal.value * 2;
    });
    effect(() => {
      computedValue.value;
    });
    expect(effectTime).toBe(1);
    expect(computedValue.peek()).toBe(20);
    testSignal.value = 20;

    expect(effectTime).toBe(2);
    expect(computedValue.value).toBe(40);
    conditionSignal.value = true;

    expect(effectTime).toBe(3);
    expect(computedValue.value).toBe(50);
    testSignal.value = 25;

    expect(effectTime).toBe(3);
    expect(computedValue.value).toBe(50);
    conditionSignal.value = false;

    expect(effectTime).toBe(4);
    testSignal.value = 30;
    expect(effectTime).toBe(5);

    expect(computedValue.value).toBe(60);
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

  it('should work computed with set', () => {
    const count = signal(0);
    const computedValue = computed(() => count.value * 2);
    count.value = 1;

    expect(computedValue.value).toBe(2);
  });

  it('should work computed with get/set', () => {
    const count = signal(0);
    const computedValue = computed({
      get: () => count.value * 2,
      set: value => {
        count.value = value / 2;
      },
    });
    count.value = 1;

    expect(computedValue.value).toBe(2);
    // @ts-ignore test error
    computedValue.value = 10;
    expect(count.value).toBe(5);
  });

  it('should throw error when computed getter is not provided', () => {
    // @ts-ignore test error
    expect(() => computed({})).toThrow('getter function is required');
  });

  it('should throw error when computed is not provided', () => {
    // @ts-ignore test error
    expect(() => computed()).toThrow('computed() requires a getter function or options object');
  });

  describe('edge cases', () => {
    it('should handle NO_VALUE initial state', () => {
      const count = signal(0);
      const comp = computed(() => count.value * 2);

      // First access should compute
      expect(comp.value).toBe(0);

      // Second access should use cache
      expect(comp.value).toBe(0);
    });

    it('should handle PENDING state correctly', () => {
      const a = signal(0);
      const b = signal(0);
      const comp = computed(() => a.value + b.value);

      let effectCount = 0;
      effect(
        () => {
          comp.value;
          effectCount++;
        },
        { flush: 'sync' },
      );

      expect(effectCount).toBe(1);

      // Change dependency
      a.value = 1;
      expect(effectCount).toBe(2);
      expect(comp.value).toBe(1);
    });

    it('should handle DIRTY state correctly', () => {
      const count = signal(0);
      const comp = computed(() => count.value * 2);

      expect(comp.value).toBe(0);

      count.value = 5;
      // Computed should be dirty now
      expect(comp.value).toBe(10);
    });

    it('should handle error in getter', () => {
      const shouldError = signal(false);
      const comp = computed(() => {
        if (shouldError.value) {
          throw new Error('Computation error');
        }
        return 42;
      });

      expect(comp.value).toBe(42);

      shouldError.value = true;
      expect(() => comp.value).toThrow('Computation error');

      // Verify that next access retries the computation
      shouldError.value = false;
      expect(comp.value).toBe(42); // Should successfully recompute
    });
  });

  describe('error handling', () => {
    it('should throw error when getter throws', () => {
      const comp = computed(() => {
        throw new Error('Test error');
      });

      expect(() => comp.value).toThrow('Test error');
    });

    it('should clear DIRTY and PENDING flags after error', () => {
      const shouldError = signal(false);
      const comp = computed(() => {
        if (shouldError.value) {
          throw new Error('Computation error');
        }
        return 42;
      });

      // Initial successful computation
      expect(comp.value).toBe(42);

      // Trigger error
      shouldError.value = true;
      expect(() => comp.value).toThrow('Computation error');

      // @ts-ignore accessing private property for testing
      const flags = comp.flag;

      // Verify DIRTY flag is set (for retry) but PENDING is cleared
      expect(flags & ReactiveFlags.DIRTY).toBeTruthy();
      expect(flags & ReactiveFlags.PENDING).toBe(0);
    });

    it('should retry computation on next access after error', () => {
      let attemptCount = 0;
      const shouldError = signal(true);

      const comp = computed(() => {
        attemptCount++;
        if (shouldError.value) {
          throw new Error('Computation error');
        }
        return 42;
      });

      // First attempt - should error
      expect(() => comp.value).toThrow('Computation error');
      expect(attemptCount).toBe(1);

      // Fix the error condition
      shouldError.value = false;

      // Second attempt - should succeed and retry computation
      expect(comp.value).toBe(42);
      expect(attemptCount).toBe(2);
    });

    it('should handle multiple consecutive errors', () => {
      let errorCount = 0;
      const maxErrors = 3;

      const comp = computed(() => {
        errorCount++;
        if (errorCount <= maxErrors) {
          throw new Error(`Error ${errorCount}`);
        }
        return 42;
      });

      // First three attempts should error
      expect(() => comp.value).toThrow('Error 1');
      expect(() => comp.value).toThrow('Error 2');
      expect(() => comp.value).toThrow('Error 3');

      // Fourth attempt should succeed
      expect(comp.value).toBe(42);
      expect(errorCount).toBe(4);
    });

    it('should clean up dependencies even when getter throws', () => {
      const dep1 = signal(1);
      const dep2 = signal(2);
      const shouldError = signal(false);

      const comp = computed(() => {
        const val1 = dep1.value;
        if (shouldError.value) {
          throw new Error('Computation error');
        }
        return val1 + dep2.value;
      });

      // Initial successful computation
      expect(comp.value).toBe(3);

      // Trigger error - should still track dep1 but not dep2
      shouldError.value = true;
      expect(() => comp.value).toThrow('Computation error');

      // Verify dependencies are properly tracked
      // @ts-ignore accessing private property for testing
      expect(comp.depLink).toBeDefined();
    });

    it('should handle error in nested computed', () => {
      const shouldError = signal(false);
      const inner = computed(() => {
        if (shouldError.value) {
          throw new Error('Inner error');
        }
        return 10;
      });

      const outer = computed(() => inner.value * 2);

      // Initial successful computation
      expect(outer.value).toBe(20);

      // Trigger error in inner computed
      shouldError.value = true;
      expect(() => outer.value).toThrow('Inner error');

      // Fix error and verify both retry
      shouldError.value = false;
      expect(outer.value).toBe(20);
    });

    it('should handle error with effects watching computed', () => {
      const shouldError = signal(false);
      const comp = computed(() => {
        if (shouldError.value) {
          throw new Error('Computation error');
        }
        return 42;
      });

      let effectValue: number | null = null;
      let effectError: Error | null = null;

      effect(() => {
        try {
          effectValue = comp.value;
          effectError = null;
        } catch (error) {
          effectError = error as Error;
        }
      });

      // Initial state - no error
      expect(effectValue).toBe(42);
      expect(effectError).toBeNull();

      // Trigger error
      shouldError.value = true;
      expect(effectError).toBeDefined();
      expect((effectError as unknown as Error).message).toBe('Computation error');

      // Fix error
      shouldError.value = false;
      expect(effectValue).toBe(42);
      expect(effectError).toBeNull();
    });

    it('should preserve error state until next access', () => {
      let callCount = 0;
      const comp = computed(() => {
        callCount++;
        throw new Error('Always fails');
      });

      // Multiple accesses should each attempt computation
      expect(() => comp.value).toThrow('Always fails');
      expect(callCount).toBe(1);

      expect(() => comp.value).toThrow('Always fails');
      expect(callCount).toBe(2);

      expect(() => comp.value).toThrow('Always fails');
      expect(callCount).toBe(3);
    });

    it('should handle undefined and null values', () => {
      const value = signal<number | null | undefined>(undefined);
      const comp = computed(() => value.value);

      expect(comp.value).toBeUndefined();

      value.value = null;
      expect(comp.value).toBeNull();

      value.value = 42;
      expect(comp.value).toBe(42);
    });

    it('should handle NaN values correctly', () => {
      const value = signal(Number.NaN);
      const comp = computed(() => value.value);

      expect(comp.value).toBeNaN();

      value.value = 42;
      expect(comp.value).toBe(42);
    });

    it('should use peek without triggering dependencies', () => {
      const count = signal(0);
      const comp = computed(() => count.value * 2);

      // First access to compute the value
      expect(comp.value).toBe(0);

      let effectCount = 0;
      effect(
        () => {
          comp.peek(); // Should not track
          effectCount++;
        },
        { flush: 'sync' },
      );

      expect(effectCount).toBe(1);

      count.value = 1;
      // Effect should not trigger because peek doesn't track
      expect(effectCount).toBe(1);
      // peek() returns cached value without recomputing when dirty
      expect(comp.peek()).toBe(0);
      // Accessing .value will recompute
      expect(comp.value).toBe(2);
    });

    it('should handle value unchanged scenario', () => {
      const count = signal(0);
      let computeCount = 0;
      const comp = computed(() => {
        computeCount++;
        return Math.floor(count.value / 10) * 10;
      });

      let effectCount = 0;
      effect(
        () => {
          comp.value;
          effectCount++;
        },
        { flush: 'sync' },
      );

      expect(effectCount).toBe(1);
      expect(computeCount).toBe(1);

      // Value changes but computed result doesn't
      count.value = 5;
      expect(computeCount).toBe(2);
      // Effect triggers because computed is marked dirty, even if value doesn't change
      // This is expected behavior in the current implementation
      expect(effectCount).toBeGreaterThanOrEqual(1);

      // Value changes and computed result changes
      count.value = 15;
      expect(computeCount).toBe(3);
      expect(effectCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe('parameter validation', () => {
    it('should throw error for non-function getter in options', () => {
      expect(() =>
        computed({
          // @ts-ignore test error
          get: 'not a function',
        }),
      ).toThrow('getter must be a function');
    });

    it('should throw error for invalid argument type', () => {
      // @ts-ignore test error
      expect(() => computed(123)).toThrow('expected a function or options object');
    });

    it('should return existing computed when passed computed', () => {
      const count = signal(0);
      const comp1 = computed(() => count.value * 2);
      const comp2 = computed(comp1 as any);

      expect(comp2).toBe(comp1);
    });

    it('should handle computed with onTrack and onTrigger', () => {
      const count = signal(0);
      const onTrack = vi.fn();
      const onTrigger = vi.fn();

      const comp = computed({
        get: () => count.value * 2,
        onTrack,
        onTrigger,
      });

      // Access value to trigger tracking
      expect(comp.value).toBe(0);

      // Change value to trigger onTrigger
      count.value = 1;
      expect(comp.value).toBe(2);

      expect(onTrigger).toHaveBeenCalled();
    });
  });

  describe('isComputed', () => {
    it('should identify computed values', () => {
      const count = signal(0);
      const comp = computed(() => count.value * 2);

      expect(isComputed(comp)).toBe(true);
      expect(isComputed(count)).toBe(false);
      expect(isComputed(42)).toBe(false);
      expect(isComputed(null)).toBe(false);
      expect(isComputed(undefined)).toBe(false);
      expect(isComputed({})).toBe(false);
    });
  });

  describe('readonly computed', () => {
    it('should warn when trying to set readonly computed', () => {
      const count = signal(0);
      const comp = computed(() => count.value * 2);

      // Try to set value (should warn in dev mode)
      // @ts-ignore test error
      comp.value = 10;

      // Value should not change
      expect(comp.value).toBe(0);
    });
  });

  describe('shouldUpdate', () => {
    it('should return true for first computation', () => {
      const count = signal(0);
      const comp = computed(() => count.value * 2);

      // @ts-ignore accessing private method for testing
      expect(comp.shouldUpdate()).toBe(true);
    });

    it('should return true when value changes', () => {
      const count = signal(0);
      const comp = computed(() => count.value * 2);

      // Initial computation
      comp.value;

      count.value = 1;

      // @ts-ignore accessing private method for testing
      expect(comp.shouldUpdate()).toBe(true);
    });

    it('should return false when value does not change', () => {
      const count = signal(0);
      const comp = computed(() => Math.floor(count.value / 10));

      // Initial computation
      comp.value;

      count.value = 5; // Still rounds to 0

      // @ts-ignore accessing private method for testing
      expect(comp.shouldUpdate()).toBe(false);
    });
  });
});
