import { nextTick, queueJob, queuePreFlushCb } from '../src/scheduler';

describe('tscheduler', () => {
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
