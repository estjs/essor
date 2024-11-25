import { createScheduler, nextTick, queueJob, queuePreFlushCb } from '../src/scheduler';
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

describe('createScheduler', () => {
  it('should schedule useEffect immediately for "sync" flush type', () => {
    const useEffect = vi.fn();
    const scheduler = createScheduler(useEffect, 'sync');
    scheduler();
    expect(useEffect).toHaveBeenCalled();
  });

  it('should schedule useEffect as a pre-flush callback for "pre" flush type', async () => {
    const useEffect = vi.fn();
    const scheduler = createScheduler(useEffect, 'pre');
    scheduler();
    await nextTick();
    expect(useEffect).toHaveBeenCalled();
  });

  it('should schedule useEffect in the next tick for "post" flush type', async () => {
    const useEffect = vi.fn();
    const scheduler = createScheduler(useEffect, 'post');
    scheduler();
    expect(useEffect).not.toHaveBeenCalled(); // should not be called immediately
    await nextTick();
    await nextTick();
    expect(useEffect).toHaveBeenCalled();
  });
});
