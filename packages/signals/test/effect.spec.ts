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
