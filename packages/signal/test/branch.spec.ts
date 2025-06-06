import { computed, effect, signal } from '../src';

describe('branch Tracking', () => {
  it('should handle nested branch tracking with multiple conditions', () => {
    const a = signal(false);
    const b = signal(true);
    const c = signal(true);
    const value = signal(0);
    let renderCount = 0;

    effect(
      () => {
        if (a.value && b.value && c.value) {
          value.value;
        }
        renderCount++;
      },
      { flush: 'sync' },
    );

    expect(renderCount).toBe(1);

    // a's value is false, should not trigger effect
    value.value++;
    expect(renderCount).toBe(1);

    a.value = true;
    expect(renderCount).toBe(2);
    value.value++;
    // a's value is true, should trigger effect
    expect(renderCount).toBe(3);

    b.value = false;
    expect(renderCount).toBe(4);

    // b's value is false, value change should not trigger effect
    value.value++;
    expect(renderCount).toBe(4);

    // Reopen the middle branch
    b.value = true;
    expect(renderCount).toBe(5);

    // b's value is true, value change should trigger effect
    value.value++;
    expect(renderCount).toBe(6);
  });

  it('should handle computed values in branches', () => {
    const count = signal(0);
    const doubled = computed(() => count.value * 2);
    const show = signal(true);
    let renderCount = 0;

    effect(
      () => {
        if (show.value) {
          doubled.value;
        }
        renderCount++;
      },
      { flush: 'sync' },
    );

    expect(renderCount).toBe(1);

    // When show is true, count change should trigger effect
    count.value++;
    expect(renderCount).toBe(2);

    // Close branch
    show.value = false;
    expect(renderCount).toBe(3);

    // count change should not trigger effect
    count.value++;
    expect(renderCount).toBe(3);
  });

  it('should work computed with branch track', () => {
    const a = signal(true);
    const b = signal(2);
    const c = signal(3);

    let runCount = 0;
    computed(() => {
      if (a.value) {
        b.value;
      }
      runCount++;
      c.value;
      return 1;
    });

    // Default run once to collect dependencies
    expect(runCount).toBe(1);

    // a's value changes, triggers computed
    a.value = false;
    expect(runCount).toBe(2);
    // b's value changes, but since a's value is false, doesn't trigger
    b.value = 4;
    expect(runCount).toBe(2);
    // a's value changes, triggers computed
    a.value = true;
    expect(runCount).toBe(3);
    // b's value changes, triggers computed
    b.value = 5;
    expect(runCount).toBe(4);
  });

  it('should handle dynamic branch dependencies', () => {
    const items = signal([1, 2, 3]);
    const showEven = signal(true);
    const results: number[] = [];

    effect(
      () => {
        results.length = 0;
        for (const item of items.value) {
          if (showEven.value) {
            if (item % 2 === 0) {
              results.push(item);
            }
          } else {
            if (item % 2 === 1) {
              results.push(item);
            }
          }
        }
      },
      { flush: 'sync' },
    );

    expect(results).toEqual([2]);

    // Switch display condition
    showEven.value = false;
    expect(results).toEqual([1, 3]);

    // Add new item
    items.value.push(4);
    expect(results).toEqual([1, 3]);
  });
});
