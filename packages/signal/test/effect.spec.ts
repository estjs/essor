import { useEffect, useSignal } from '../src';
import { nextTick } from '../src/scheduler';

describe('useEffect', () => {
  it('should run the useEffect function', () => {
    let testValue = 0;
    useEffect(() => {
      testValue = 10;
    });
    expect(testValue).toBe(10);
  });

  it('should get correct value after useEffect execution', () => {
    const name = useSignal('Dnt');

    let effectTimes = 0;
    const dispose = useEffect(() => {
      effectTimes++;
      name.value;
    });
    expect(effectTimes).toBe(1);
    dispose();
    name.value = 'John';
    expect(effectTimes).toBe(1);
    name.value = '';
    expect(effectTimes).toBe(1);
  });

  it('should re-run the useEffect when useSignal value changes', () => {
    const testSignal = useSignal([1, 2, 3]);
    let effectTimes = 0;
    useEffect(() => {
      testSignal.value;
      effectTimes++;
    });
    expect(effectTimes).toBe(1);
    testSignal.value.push(4);
    expect(effectTimes).toBe(2);
  });

  it('should handle different flush options', () => {
    const mockEffect = vi.fn();
    const dispose = useEffect(mockEffect, { flush: 'sync' });
    expect(mockEffect).toHaveBeenCalled();
    dispose();
  });

  it('should handle "pre" flush option', () => {
    const mockEffect = vi.fn();
    const dispose = useEffect(mockEffect, { flush: 'pre' });
    // Effect should be scheduled to run on pre-flush
    expect(mockEffect).toHaveBeenCalled();
    dispose();
  });

  it('should handle "post" flush option', async () => {
    const mockEffect = vi.fn();
    useEffect(mockEffect, { flush: 'post' });
    await nextTick();
    expect(mockEffect).toHaveBeenCalled();
  });

  it('should call onTrack and onTrigger callbacks', () => {
    const onTrack = vi.fn();
    const onTrigger = vi.fn();

    const name = useSignal('Dnt');
    const dispose = useEffect(
      () => {
        name.value;
      },
      { onTrack, onTrigger },
    );

    expect(onTrack).toHaveBeenCalled();
    expect(onTrigger).toHaveBeenCalled();
    dispose();
  });

  it('should not call useEffect function after disposal', () => {
    const mockEffect = vi.fn();
    const dispose = useEffect(mockEffect);
    dispose();
    const name = useSignal('Dnt');
    name.value = 'Changed';
    expect(mockEffect).toHaveBeenCalledTimes(1);
  });

  it('should clean up correctly', () => {
    const mockEffect = vi.fn();
    const dispose = useEffect(mockEffect);
    dispose();
    const name = useSignal('Dnt');
    name.value = 'Changed';
    expect(mockEffect).toHaveBeenCalledTimes(1);
  });
});
