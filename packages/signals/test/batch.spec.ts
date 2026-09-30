import { describe, expect, it, vi } from 'vitest';
import { batch, effect, signal } from '../src';

describe('batch public contract', () => {
  it('coalesces nested writes until the outer batch closes', () => {
    const source = signal(0);
    const runs: number[] = [];
    const stop = effect(() => runs.push(source.value));

    batch(() => {
      source.value = 1;
      batch(() => {
        source.value = 2;
        expect(runs).toEqual([0]);
      });
      expect(runs).toEqual([0]);
    });

    expect(runs).toEqual([0, 2]);
    stop.effect.stop();
  });

  it('flushes pending effects before rethrowing a batch body error', () => {
    const source = signal(0);
    const run = vi.fn(() => source.value);
    const stop = effect(run);
    run.mockClear();

    expect(() =>
      batch(() => {
        source.value = 1;
        throw new Error('batch body failed');
      }),
    ).toThrow('batch body failed');

    expect(run).toHaveBeenCalledOnce();
    stop.effect.stop();
  });

  it('rethrows an effect flush error when the batch body succeeds', () => {
    const source = signal(0);
    const failure = new Error('batched effect failed');
    const stop = effect(() => {
      if (source.value === 1) throw failure;
    });

    expect(() => {
      batch(() => {
        source.value = 1;
      });
    }).toThrow(failure);
    stop.effect.stop();
  });

  it('does not rerun effect if signal value is rolled back to original within batch', () => {
    const source = signal(0);
    const run = vi.fn(() => source.value);
    const stop = effect(run);
    run.mockClear();

    batch(() => {
      source.value = 1;
      source.value = 0;
    });

    expect(run).not.toHaveBeenCalled();
    stop.effect.stop();
  });

  it('does not rerun effect if signal value is read and then rolled back to original within batch', () => {
    const source = signal(0);
    const run = vi.fn(() => source.value);
    const stop = effect(run);
    run.mockClear();

    batch(() => {
      source.value = 1;
      expect(source.value).toBe(1);
      source.value = 0;
    });

    expect(run).not.toHaveBeenCalled();
    stop.effect.stop();
  });
});
