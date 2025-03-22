import { effect, signal } from '../src';

describe('effect', () => {
  it('should run the effect function', () => {
    let testValue = 0;
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
    const dispose = effect(
      () => {
        effectTimes++;
        name.value;
      },
      { flush: 'sync' },
    );
    expect(effectTimes).toBe(1);
    dispose();
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
    const dispose = effect(mockEffect, { flush: 'sync' });
    expect(mockEffect).toHaveBeenCalled();
    dispose();
  });

  it('should handle "pre" flush option', () => {
    const mockEffect = vi.fn();
    const dispose = effect(mockEffect, { flush: 'pre' });
    // Effect should be scheduled to run on pre-flush
    expect(mockEffect).toHaveBeenCalled();
    dispose();
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
    const dispose = effect(
      () => {
        name.value;
      },
      { onTrack, onTrigger },
    );

    expect(onTrack).toHaveBeenCalled();
    expect(onTrigger).toHaveBeenCalled();
    dispose();
  });

  it('should not call effect function after disposal', () => {
    const mockEffect = vi.fn();
    const dispose = effect(mockEffect);
    dispose();
    const name = signal('Dnt');
    name.value = 'Changed';
    expect(mockEffect).toHaveBeenCalledTimes(1);
  });

  it('should clean up correctly', () => {
    const mockEffect = vi.fn();
    const dispose = effect(mockEffect);
    dispose();
    const name = signal('Dnt');
    name.value = 'Changed';
    expect(mockEffect).toHaveBeenCalledTimes(1);
  });
});
