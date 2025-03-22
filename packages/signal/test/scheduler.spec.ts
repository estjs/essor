import { nextTick, queueJob, queuePreFlushCb } from '../src/scheduler';

// packages/signal/test/scheduler.spec.ts

describe('nextTick', () => {
  it('should execute the function in the next microtask', async () => {
    const fn = vi.fn();
    nextTick(fn);
    expect(fn).not.toHaveBeenCalled(); // should not be called immediately
    await nextTick();
    expect(fn).toHaveBeenCalled(); // called after the next tick
  });

  it('should return a Promise that resolves', async () => {
    const result = nextTick();
    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toBeUndefined();
  });
});
describe('queueJob', () => {
  it('should execute jobs in the queue', async () => {
    const mockJob1 = vi.fn();
    const mockJob2 = vi.fn();

    queueJob(mockJob1);
    queueJob(mockJob2);

    await nextTick();

    expect(mockJob1).toHaveBeenCalled();
    expect(mockJob2).toHaveBeenCalled();
  });

  it('should execute pre-flush callbacks before jobs', async () => {
    const preFlushCb = vi.fn();
    const mockJob = vi.fn();

    queuePreFlushCb(preFlushCb);
    queueJob(mockJob);

    await nextTick();

    expect(preFlushCb).toHaveBeenCalled();
    expect(mockJob).toHaveBeenCalled();
  });

  it('should handle multiple pre-flush callbacks', async () => {
    const preFlushCb1 = vi.fn();
    const preFlushCb2 = vi.fn();
    const mockJob = vi.fn();

    queuePreFlushCb(preFlushCb1);
    queuePreFlushCb(preFlushCb2);
    queueJob(mockJob);

    await nextTick();

    expect(preFlushCb1).toHaveBeenCalled();
    expect(preFlushCb2).toHaveBeenCalled();
    expect(mockJob).toHaveBeenCalled();
  });

  it('should not add duplicate jobs to the queue', async () => {
    const mockJob = vi.fn();

    queueJob(mockJob);
    queueJob(mockJob);

    await nextTick();

    expect(mockJob).toHaveBeenCalledTimes(1);
  });

  it('should handle pre-flush callbacks without duplication', async () => {
    const preFlushCb = vi.fn();

    queuePreFlushCb(preFlushCb);
    queuePreFlushCb(preFlushCb);

    await nextTick();

    expect(preFlushCb).toHaveBeenCalledTimes(1);
  });
});

describe('scheduler', () => {
  it('should handle multiple jobs in correct order', async () => {
    const order: number[] = [];

    queueJob(() => order.push(1));
    queueJob(() => order.push(2));
    queueJob(() => order.push(3));

    await nextTick();
    expect(order).toEqual([1, 2, 3]);
  });

  it('should deduplicate jobs', async () => {
    const counter = { count: 0 };
    const job = () => counter.count++;

    queueJob(job);
    queueJob(job);
    queueJob(job);

    await nextTick();
    expect(counter.count).toBe(1);
  });

  it('should handle pre-flush callbacks', async () => {
    const order: string[] = [];

    queuePreFlushCb(() => order.push('pre-1'));
    queueJob(() => order.push('job-1'));
    queuePreFlushCb(() => order.push('pre-2'));

    await nextTick();
    expect(order).toEqual(['pre-1', 'pre-2', 'job-1']);
  });

  it('should handle nested queueJob calls', async () => {
    const order: number[] = [];

    queueJob(() => {
      order.push(1);
      queueJob(() => order.push(2));
    });

    await nextTick();
    expect(order).toEqual([1, 2]);
  });
});
