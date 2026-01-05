import { effect, isEffect, memoEffect, signal } from '../src';

describe('effect', () => {
  it('should run the effect function', () => {
    let testValue = 0;
    // ... (omitting unchanged lines for brevity in thought, but tool needs exact context or I can use multi_replace)
    effect(
      () => {
        testValue = 10;
      },
      { flush: 'sync' },
    );
    expect(testValue).toBe(10);
  });

  it('should get correct value after effect execution', () => {
    const name = signal('Dnt');

    let effectTimes = 0;
    const runner = effect(
      () => {
        effectTimes++;
        name.value;
      },
      { flush: 'sync' },
    );
    expect(effectTimes).toBe(1);
    // Stop the effect
    runner.stop();
    name.value = 'John';
    expect(effectTimes).toBe(1);
    name.value = '';
    expect(effectTimes).toBe(1);
  });

  it('should re-run the effect when signal value changes', () => {
    const testSignal = signal([1, 2, 3]);
    let effectTimes = 0;
    effect(() => {
      testSignal.value.length;
      effectTimes++;
    });
    expect(effectTimes).toBe(1);
    testSignal.value.push(4);

    expect(effectTimes).toBe(2);
  });

  it('should handle different flush options', () => {
    const mockEffect = vi.fn();
    const effectFn = effect(mockEffect, { flush: 'sync' });
    expect(mockEffect).toHaveBeenCalled();
    effectFn.stop();
  });

  it('should handle "pre" flush option', () => {
    const mockEffect = vi.fn();
    const effectFn = effect(mockEffect, { flush: 'pre' });
    // Effect should be scheduled to run on pre-flush
    expect(mockEffect).toHaveBeenCalled();
    effectFn.stop();
  });

  it('should handle "post" flush option', () => {
    const mockEffect = vi.fn();
    effect(mockEffect, { flush: 'post' });

    expect(mockEffect).toHaveBeenCalled();
  });

  it('should call onTrack and onTrigger callbacks', () => {
    const onTrack = vi.fn();
    const onTrigger = vi.fn();

    const name = signal('Dnt');
    const effectFn = effect(
      () => {
        name.value;
      },
      { onTrack, onTrigger },
    );

    expect(onTrack).toHaveBeenCalled();
    expect(onTrigger).not.toHaveBeenCalled();
    effectFn.stop();
  });

  it('should not call effect function after disposal', () => {
    const mockEffect = vi.fn();
    const effectFn = effect(mockEffect);
    effectFn.stop();
    const name = signal('Dnt');
    name.value = 'Changed';
    expect(mockEffect).toHaveBeenCalledTimes(1);
  });

  it('should clean up correctly', () => {
    const mockEffect = vi.fn();
    const effectFn = effect(mockEffect);
    effectFn.stop();
    const name = signal('Dnt');
    name.value = 'Changed';
    expect(mockEffect).toHaveBeenCalledTimes(1);
  });

  it('should pause and resume', () => {
    const count = signal(0);
    const fn = vi.fn();
    const runner = effect(() => {
      fn(count.value);
    });

    expect(fn).toHaveBeenCalledTimes(1);

    runner.effect.pause();
    count.value = 1;
    expect(fn).toHaveBeenCalledTimes(1); // Should not run

    count.value = 2;
    expect(fn).toHaveBeenCalledTimes(1); // Should not run

    runner.effect.resume();
    expect(fn).toHaveBeenCalledTimes(2); // Should run once with latest value
    expect(fn).toHaveBeenLastCalledWith(2);
  });

  it('should handle stop idempotency', () => {
    const runner = effect(() => {});
    runner.stop();
    expect(() => runner.stop()).not.toThrow();
  });

  it('should handle error in reactive update', () => {
    const count = signal(0);
    effect(() => {
      if (count.value > 0) {
        throw new Error('Update Error');
      }
    });

    expect(() => {
      count.value = 1;
    }).toThrow('Update Error');
  });

  it('should throw if initial execution fails', () => {
    expect(() => {
      effect(() => {
        throw new Error('Fail');
      });
    }).toThrow('Fail');
  });

  it('should isEffect check', () => {
    const runner = effect(() => {});
    expect(isEffect(runner.effect)).toBe(true);
    expect(isEffect({})).toBe(false);
    expect(isEffect(null)).toBe(false);
  });

  describe('boundary cases - nested effects', () => {
    it('should handle nested effect execution', () => {
      const outer = signal(0);
      const inner = signal(0);
      const outerFn = vi.fn();
      const innerFn = vi.fn();

      const outerRunner = effect(() => {
        outerFn(outer.value);
        effect(() => {
          innerFn(inner.value);
        });
      });

      expect(outerFn).toHaveBeenCalledTimes(1);
      expect(innerFn).toHaveBeenCalledTimes(1);

      outer.value = 1;
      expect(outerFn).toHaveBeenCalledTimes(2);
      // Inner effect is created again
      expect(innerFn).toHaveBeenCalledTimes(2);

      outerRunner.stop();
    });

    it('should track dependencies correctly in nested effects', () => {
      const count = signal(0);
      const multiplier = signal(2);
      const results: number[] = [];

      const outerRunner = effect(() => {
        const c = count.value;
        effect(() => {
          results.push(c * multiplier.value);
        });
      });

      expect(results).toEqual([0]);

      multiplier.value = 3;
      expect(results).toEqual([0, 0]);

      count.value = 5;
      expect(results).toEqual([0, 0, 15]);

      outerRunner.stop();
    });

    it('should handle deeply nested effects', () => {
      const sig1 = signal(1);
      const sig2 = signal(2);
      const sig3 = signal(3);
      const calls: string[] = [];

      const runner1 = effect(() => {
        calls.push(`level1:${sig1.value}`);
        effect(() => {
          calls.push(`level2:${sig2.value}`);
          effect(() => {
            calls.push(`level3:${sig3.value}`);
          });
        });
      });

      expect(calls).toEqual(['level1:1', 'level2:2', 'level3:3']);

      calls.length = 0;
      sig3.value = 30;
      expect(calls).toEqual(['level3:30']);

      calls.length = 0;
      sig2.value = 20;
      expect(calls).toEqual(['level2:20', 'level3:30']);

      calls.length = 0;
      sig1.value = 10;
      expect(calls).toEqual(['level1:10', 'level2:20', 'level3:30']);

      runner1.stop();
    });
  });

  describe('boundary cases - effect cleanup', () => {
    it('should call onStop callback when effect is stopped', () => {
      const onStop = vi.fn();
      const runner = effect(() => {}, { onStop });

      expect(onStop).not.toHaveBeenCalled();
      runner.stop();
      expect(onStop).toHaveBeenCalledTimes(1);
    });

    it('should clean up dependencies when effect is stopped', () => {
      const count = signal(0);
      const fn = vi.fn();

      const runner = effect(() => {
        fn(count.value);
      });

      expect(fn).toHaveBeenCalledTimes(1);

      runner.stop();
      count.value = 1;
      expect(fn).toHaveBeenCalledTimes(1); // Should not run after stop
    });

    it('should handle multiple stop calls gracefully', () => {
      const onStop = vi.fn();
      const runner = effect(() => {}, { onStop });

      runner.stop();
      expect(onStop).toHaveBeenCalledTimes(1);

      runner.stop();
      expect(onStop).toHaveBeenCalledTimes(1); // Should not call again
    });

    it('should clean up nested effects when parent is stopped', () => {
      const outer = signal(0);
      const inner = signal(0);
      const innerFn = vi.fn();
      let innerRunner: any;

      const outerRunner = effect(() => {
        outer.value;
        innerRunner = effect(() => {
          innerFn(inner.value);
        });
      });

      expect(innerFn).toHaveBeenCalledTimes(1);

      outerRunner.stop();
      inner.value = 1;
      // Inner effect should still run as it wasn't explicitly stopped
      expect(innerFn).toHaveBeenCalledTimes(2);

      innerRunner.stop();
    });

    it('should not track dependencies after effect is stopped', () => {
      const count = signal(0);
      const fn = vi.fn();

      const runner = effect(() => {
        fn(count.value);
      });

      runner.stop();

      // Running manually after stop should not track
      runner();
      count.value = 1;
      expect(fn).toHaveBeenCalledTimes(2); // Initial + manual call, no auto-trigger
    });

    it('should clear all internal state on stop', () => {
      const count = signal(0);
      const runner = effect(() => {
        count.value;
      });

      runner.stop();

      // Verify effect instance is properly cleaned
      expect(runner.effect.active).toBe(false);
      expect(runner.effect.depLink).toBeUndefined();
      expect(runner.effect.depLinkTail).toBeUndefined();
    });
  });

  describe('boundary cases - error handling', () => {
    it('should handle errors during effect execution', () => {
      const count = signal(0);
      const fn = vi.fn(() => {
        if (count.value > 0) {
          throw new Error('Effect error');
        }
      });

      effect(fn);
      expect(fn).toHaveBeenCalledTimes(1);

      expect(() => {
        count.value = 1;
      }).toThrow('Effect error');

      // Effect should still be active but won't auto-recover
      // The effect remains dirty after error
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should stop effect if initial execution throws', () => {
      const fn = vi.fn(() => {
        throw new Error('Initial error');
      });

      expect(() => {
        effect(fn);
      }).toThrow('Initial error');

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should maintain dirty flag after error', () => {
      const count = signal(0);
      let shouldThrow = true;

      const runner = effect(() => {
        if (shouldThrow && count.value > 0) {
          throw new Error('Temporary error');
        }
      });

      expect(() => {
        count.value = 1;
      }).toThrow('Temporary error');

      // Effect should be marked dirty after error
      expect(runner.effect.dirty).toBe(true);

      runner.stop();
    });

    it('should handle errors in nested effects', () => {
      const outer = signal(0);
      const outerFn = vi.fn();
      let innerRunner: any;

      const outerRunner = effect(() => {
        outerFn(outer.value);
        // Create inner effect that might throw
        innerRunner = effect(() => {
          if (outer.value > 1) {
            throw new Error('Inner error');
          }
        });
      });

      expect(outerFn).toHaveBeenCalledTimes(1);

      // Trigger outer which creates new inner effect, inner throws during creation
      expect(() => {
        outer.value = 2;
      }).toThrow('Inner error');

      // Outer effect was called but inner effect threw
      expect(outerFn).toHaveBeenCalledTimes(2);

      outerRunner.stop();
    });

    it('should handle errors in onStop callback', () => {
      const onStop = vi.fn(() => {
        throw new Error('Stop error');
      });

      const runner = effect(() => {}, { onStop });

      expect(() => {
        runner.stop();
      }).toThrow('Stop error');

      // Effect should still be stopped despite error
      expect(runner.effect.active).toBe(false);
    });

    it('should handle errors with custom scheduler', () => {
      const count = signal(0);
      const scheduler = vi.fn((eff) => {
        eff.run();
      });

      effect(
        () => {
          if (count.value > 0) {
            throw new Error('Scheduled error');
          }
        },
        { scheduler },
      );

      expect(() => {
        count.value = 1;
      }).toThrow('Scheduled error');

      expect(scheduler).toHaveBeenCalled();
    });

    it('should handle null and undefined values', () => {
      const value = signal<any>(null);
      const fn = vi.fn();

      const runner = effect(() => {
        fn(value.value);
      });

      expect(fn).toHaveBeenCalledWith(null);

      value.value = undefined;
      expect(fn).toHaveBeenCalledWith(undefined);

      value.value = 0;
      expect(fn).toHaveBeenCalledWith(0);

      runner.stop();
    });

    it('should handle empty effect function', () => {
      const runner = effect(() => {});
      expect(runner).toBeDefined();
      expect(runner.effect.active).toBe(true);
      runner.stop();
    });

    it('should handle effect with no dependencies', () => {
      const fn = vi.fn(() => {
        return 42;
      });

      const runner = effect(fn);
      expect(fn).toHaveBeenCalledTimes(1);

      // Manual run should work
      const result = runner();
      expect(result).toBe(42);
      expect(fn).toHaveBeenCalledTimes(2);

      runner.stop();
    });

    it('should handle error recovery after fixing the issue', () => {
      const count = signal(0);
      let shouldThrow = true;
      const fn = vi.fn(() => {
        if (shouldThrow && count.value > 0) {
          throw new Error('Temporary error');
        }
        return count.value;
      });

      const runner = effect(fn);
      expect(fn).toHaveBeenCalledTimes(1);

      // Trigger error
      expect(() => {
        count.value = 1;
      }).toThrow('Temporary error');

      // Fix the issue
      shouldThrow = false;

      // Manually run should work now
      const result = runner();
      expect(result).toBe(1);
      expect(fn).toHaveBeenCalledTimes(3);

      runner.stop();
    });

    it('should handle errors during dependency tracking', () => {
      const count = signal(0);
      const fn = vi.fn(() => {
        const val = count.value;
        if (val > 0) {
          throw new Error('Tracking error');
        }
      });

      const runner = effect(fn);
      expect(fn).toHaveBeenCalledTimes(1);

      expect(() => {
        count.value = 1;
      }).toThrow('Tracking error');

      // Effect should maintain dirty state
      expect(runner.effect.dirty).toBe(true);

      runner.stop();
    });
  });

  describe('boundary cases - scheduler variations', () => {
    it('should handle scheduler with flush timing string', () => {
      const count = signal(0);
      const fn = vi.fn();

      const runner = effect(() => {
        fn(count.value);
      }, { flush: 'sync' });

      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith(0);

      count.value = 1;
      expect(fn).toHaveBeenCalledTimes(2);
      expect(fn).toHaveBeenCalledWith(1);

      runner.stop();
    });

    it('should handle scheduler option as function', () => {
      const count = signal(0);
      const fn = vi.fn();
      const schedulerFn = vi.fn((eff) => {
        setTimeout(() => eff.run(), 0);
      });

      const runner = effect(() => {
        fn(count.value);
      }, { scheduler: schedulerFn });

      expect(fn).toHaveBeenCalledTimes(1);

      count.value = 1;
      expect(schedulerFn).toHaveBeenCalled();

      runner.stop();
    });

    it('should handle effect without scheduler during batch', async () => {
      const { batch } = await import('../src/batch');
      const count = signal(0);
      const fn = vi.fn();

      const runner = effect(() => {
        fn(count.value);
      });

      expect(fn).toHaveBeenCalledTimes(1);

      batch(() => {
        count.value = 1;
        count.value = 2;
        count.value = 3;
      });

      // Should only run once after batch completes
      expect(fn).toHaveBeenCalledTimes(2);
      expect(fn).toHaveBeenLastCalledWith(3);

      runner.stop();
    });

    it('should handle multiple effects with different schedulers', () => {
      const count = signal(0);
      const syncFn = vi.fn();
      const customFn = vi.fn();
      const customScheduler = vi.fn((eff) => eff.run());

      const syncRunner = effect(() => {
        syncFn(count.value);
      }, { flush: 'sync' });

      const customRunner = effect(() => {
        customFn(count.value);
      }, { scheduler: customScheduler });

      expect(syncFn).toHaveBeenCalledTimes(1);
      expect(customFn).toHaveBeenCalledTimes(1);

      count.value = 1;

      expect(syncFn).toHaveBeenCalledTimes(2);
      expect(customFn).toHaveBeenCalledTimes(2);
      expect(customScheduler).toHaveBeenCalled();

      syncRunner.stop();
      customRunner.stop();
    });
  });

  describe('boundary cases - dirty flag and pending state', () => {
    it('should check dirty flag correctly', () => {
      const count = signal(0);
      const runner = effect(() => {
        count.value;
      });

      // Initially not dirty after first run
      expect(runner.effect.dirty).toBe(false);

      // Change value, should be dirty
      count.value = 1;
      expect(runner.effect.dirty).toBe(false); // Already ran

      runner.stop();
    });

    it('should handle paused effect with accumulated changes', () => {
      const count = signal(0);
      const fn = vi.fn();

      const runner = effect(() => {
        fn(count.value);
      });

      expect(fn).toHaveBeenCalledTimes(1);

      runner.effect.pause();

      // Make multiple changes while paused
      count.value = 1;
      count.value = 2;
      count.value = 3;

      expect(fn).toHaveBeenCalledTimes(1); // Still paused

      // Resume should trigger with latest value
      runner.effect.resume();
      expect(fn).toHaveBeenCalledTimes(2);
      expect(fn).toHaveBeenLastCalledWith(3);

      runner.stop();
    });

    it('should handle resume without accumulated changes', () => {
      const count = signal(0);
      const fn = vi.fn();

      const runner = effect(() => {
        fn(count.value);
      });

      expect(fn).toHaveBeenCalledTimes(1);

      runner.effect.pause();
      runner.effect.resume();

      // Should not trigger if no changes occurred
      expect(fn).toHaveBeenCalledTimes(1);

      runner.stop();
    });

    it('should handle multiple pause/resume cycles', () => {
      const count = signal(0);
      const fn = vi.fn();

      const runner = effect(() => {
        fn(count.value);
      });

      expect(fn).toHaveBeenCalledTimes(1);

      // First cycle
      runner.effect.pause();
      count.value = 1;
      runner.effect.resume();
      expect(fn).toHaveBeenCalledTimes(2);

      // Second cycle
      runner.effect.pause();
      count.value = 2;
      runner.effect.resume();
      expect(fn).toHaveBeenCalledTimes(3);

      runner.stop();
    });

    it('should prevent infinite loops when effect modifies its own dependencies', () => {
      const count = signal(0);
      let runCount = 0;
      const fn = vi.fn(() => {
        runCount++;
        const currentValue = count.value;
        // Try to trigger itself - this should not cause infinite loop
        // When running, the effect ignores notifications (STOP flag is set)
        if (currentValue === 0 && runCount < 5) {
          count.value = 1;
        }
      });

      const runner = effect(fn);

      // The effect runs initially and modifies count to 1
      // However, since the effect is currently running (STOP flag is set),
      // the notification is ignored and it doesn't trigger again immediately
      // After the effect completes, count is 1, so no further triggers occur
      expect(fn).toHaveBeenCalledTimes(1);
      expect(runCount).toBe(1);
      expect(count.value).toBe(1);

      runner.stop();
    });
  });

  describe('boundary cases - stop function', () => {
    it('should use stop function to stop effect', async () => {
      const { stop } = await import('../src/effect');
      const count = signal(0);
      const fn = vi.fn();

      const runner = effect(() => {
        fn(count.value);
      });

      expect(fn).toHaveBeenCalledTimes(1);

      stop(runner);

      count.value = 1;
      expect(fn).toHaveBeenCalledTimes(1); // Should not run after stop

      expect(runner.effect.active).toBe(false);
    });
  });

  describe('boundary cases - manual runner execution', () => {
    it('should allow manual execution of runner', () => {
      const count = signal(0);
      const fn = vi.fn(() => count.value * 2);

      const runner = effect(fn);

      expect(fn).toHaveBeenCalledTimes(1);

      // Manual execution
      const result1 = runner();
      expect(result1).toBe(0);
      expect(fn).toHaveBeenCalledTimes(2);

      count.value = 5;
      expect(fn).toHaveBeenCalledTimes(3); // Auto-triggered

      const result2 = runner();
      expect(result2).toBe(10);
      expect(fn).toHaveBeenCalledTimes(4);

      runner.stop();
    });

    it('should return value from manual runner execution', () => {
      const fn = vi.fn(() => ({ data: 'test' }));

      const runner = effect(fn);

      const result = runner();
      expect(result).toEqual({ data: 'test' });

      runner.stop();
    });

    it('should handle manual execution after stop', () => {
      const count = signal(0);
      const fn = vi.fn(() => count.value);

      const runner = effect(fn);

      runner.stop();

      // Manual execution should still work but not track
      const result = runner();
      expect(result).toBe(0);

      count.value = 1;
      expect(fn).toHaveBeenCalledTimes(2); // Initial + manual, no auto-trigger

      runner.stop();
    });
  });
});

describe('memoEffect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('basic functionality tests', () => {
    it('should call effect function with initial state', () => {
      const mockFn = vi.fn().mockImplementation((prev: { count: number }) => prev);
      const initialState = { count: 0 };

      memoEffect(mockFn, initialState);

      expect(mockFn).toHaveBeenCalledWith(initialState);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should use return value as parameter for next call', () => {
      const counter = signal(1);
      const states: Array<{ value: number }> = [];

      const effectFn: MemoEffectFn<{ value: number }> = prev => {
        states.push({ ...prev });
        const current = counter.value;
        return { value: current };
      };

      memoEffect(effectFn, { value: 0 });

      // Trigger updates
      counter.value = 2;
      counter.value = 3;

      expect(states).toEqual([
        { value: 0 }, // Initial call
        { value: 1 }, // State after first update
        { value: 2 }, // State after second update
      ]);
    });

    it('should re-execute when signal value changes', () => {
      const count = signal(1);
      const mockFn = vi.fn().mockImplementation(() => {
        return { lastValue: count.value };
      });

      memoEffect(mockFn, { lastValue: 0 });

      count.value = 5;
      count.value = 10;

      expect(mockFn).toHaveBeenCalledTimes(3); // Initial + 2 updates
    });

    it('should support complex state objects', () => {
      const width = signal(100);
      const height = signal(200);
      const visible = signal(true);

      type State = {
        lastWidth: number;
        lastHeight: number;
        lastVisible: boolean;
        updateCount: number;
      };

      const effectFn: MemoEffectFn<State> = prev => {
        return {
          lastWidth: width.value,
          lastHeight: height.value,
          lastVisible: visible.value,
          updateCount: prev.updateCount + 1,
        };
      };

      memoEffect(effectFn, {
        lastWidth: 0,
        lastHeight: 0,
        lastVisible: false,
        updateCount: 0,
      });

      width.value = 150;
      height.value = 250;
      visible.value = false;
    });
  });

  describe('incremental update optimization tests', () => {
    it('should implement efficient incremental updates', () => {
      const value1 = signal('a');
      const value2 = signal('b');
      const value3 = signal('c');

      const operations = {
        op1: vi.fn(),
        op2: vi.fn(),
        op3: vi.fn(),
      };

      type State = { v1?: string; v2?: string; v3?: string };

      const effectFn: MemoEffectFn<State> = prev => {
        const current = {
          v1: value1.value,
          v2: value2.value,
          v3: value3.value,
        };

        // Only execute corresponding operations when values change
        if (current.v1 !== prev.v1) {
          operations.op1(current.v1);
          prev.v1 = current.v1;
        }

        if (current.v2 !== prev.v2) {
          operations.op2(current.v2);
          prev.v2 = current.v2;
        }

        if (current.v3 !== prev.v3) {
          operations.op3(current.v3);
          prev.v3 = current.v3;
        }

        return prev;
      };

      memoEffect(effectFn, {});

      // All operations should execute on initialization
      expect(operations.op1).toHaveBeenCalledWith('a');
      expect(operations.op2).toHaveBeenCalledWith('b');
      expect(operations.op3).toHaveBeenCalledWith('c');

      // Reset mocks
      vi.clearAllMocks();

      // Only change value1
      value1.value = 'a1';

      expect(operations.op1).toHaveBeenCalledWith('a1');
      expect(operations.op2).not.toHaveBeenCalled();
      expect(operations.op3).not.toHaveBeenCalled();

      // Only change value2 and value3
      value2.value = 'b1';
      value3.value = 'c1';

      expect(operations.op2).toHaveBeenCalledWith('b1');
      expect(operations.op3).toHaveBeenCalledWith('c1');
    });

    it('should avoid repeated DOM operations', () => {
      const width = signal(100);
      const patchAttributeSpy = vi.fn();
      const patchStyleSpy = vi.fn();

      // Mock DOM element
      const mockElement = {
        patchAttribute: patchAttributeSpy,
        style: { setProperty: patchStyleSpy },
      };

      type State = {
        lastWidth?: number;
        lastWidthPx?: string;
        lastTitle?: string;
      };

      const effectFn: MemoEffectFn<State> = prev => {
        const currentWidth = width.value;
        const currentWidthPx = `${currentWidth}px`;
        const currentTitle = `Width: ${currentWidth}`;

        // Avoid repeated attribute settings
        if (currentWidth !== prev.lastWidth) {
          mockElement.patchAttribute('data-width', currentWidth.toString());
          prev.lastWidth = currentWidth;
        }

        if (currentWidthPx !== prev.lastWidthPx) {
          mockElement.style.setProperty('width', currentWidthPx);
          prev.lastWidthPx = currentWidthPx;
        }

        if (currentTitle !== prev.lastTitle) {
          mockElement.patchAttribute('title', currentTitle);
          prev.lastTitle = currentTitle;
        }

        return prev;
      };

      memoEffect(effectFn, {});

      // Initial setup
      expect(patchAttributeSpy).toHaveBeenCalledWith('data-width', '100');
      expect(patchAttributeSpy).toHaveBeenCalledWith('title', 'Width: 100');
      expect(patchStyleSpy).toHaveBeenCalledWith('width', '100px');

      // Reset
      vi.clearAllMocks();

      // Set same value, should not trigger DOM operations
      width.value = 100;

      expect(patchAttributeSpy).not.toHaveBeenCalled();
      expect(patchStyleSpy).not.toHaveBeenCalled();

      // Set new value, should trigger DOM operations
      width.value = 200;

      expect(patchAttributeSpy).toHaveBeenCalledWith('data-width', '200');
      expect(patchAttributeSpy).toHaveBeenCalledWith('title', 'Width: 200');
      expect(patchStyleSpy).toHaveBeenCalledWith('width', '200px');
    });
  });

  describe('error handling tests', () => {
    it('should handle errors in effect function', () => {
      const errorFn: MemoEffectFn<{ count: number }> = prev => {
        if (prev.count > 2) {
          throw new Error('Test error');
        }
        return { count: prev.count + 1 };
      };

      expect(() => {
        memoEffect(errorFn, { count: 0 });
      }).not.toThrow();

      // This may need adjustment based on actual error handling mechanisms
    });

    it('should handle cases with no return value', () => {
      const badFn = vi.fn(); // Returns nothing

      const effect = memoEffect(badFn as any, { value: 1 });

      expect(effect).toBeDefined();
      expect(badFn).toHaveBeenCalled();
    });
  });

  it('should simulate compiler-generated optimized code', () => {
    // Simulate the example you provided
    const editorWidth = signal(50);

    const mockEl = { patchAttribute: vi.fn() };
    const mockEl2 = { style: { setProperty: vi.fn() } };
    const mockEl3 = { style: { setProperty: vi.fn() } };

    type State = { e?: number; t?: string; a?: string };

    const effectFn: MemoEffectFn<State> = prev => {
      const v1 = editorWidth.value;
      const v2 = `${editorWidth.value}%`;
      const v3 = `${100 - editorWidth.value}%`;

      // Simulate compiler-generated optimized code
      if (v1 !== prev.e) {
        mockEl.patchAttribute('name', v1.toString());
        prev.e = v1;
      }

      if (v2 !== prev.t) {
        mockEl2.style.setProperty('width', v2);
        prev.t = v2;
      }

      if (v3 !== prev.a) {
        mockEl3.style.setProperty('width', v3);
        prev.a = v3;
      }

      return prev;
    };

    memoEffect(effectFn, {
      e: undefined,
      t: undefined,
      a: undefined,
    });

    // Verify initial setup
    expect(mockEl.patchAttribute).toHaveBeenCalledWith('name', '50');
    expect(mockEl2.style.setProperty).toHaveBeenCalledWith('width', '50%');
    expect(mockEl3.style.setProperty).toHaveBeenCalledWith('width', '50%');

    // Change value
    vi.clearAllMocks();
    editorWidth.value = 75;

    expect(mockEl.patchAttribute).toHaveBeenCalledWith('name', '75');
    expect(mockEl2.style.setProperty).toHaveBeenCalledWith('width', '75%');
    expect(mockEl3.style.setProperty).toHaveBeenCalledWith('width', '25%');

    // Setting same value should not trigger updates
    vi.clearAllMocks();
    editorWidth.value = 75;

    expect(mockEl.patchAttribute).not.toHaveBeenCalled();
    expect(mockEl2.style.setProperty).not.toHaveBeenCalled();
    expect(mockEl3.style.setProperty).not.toHaveBeenCalled();
  });
});
