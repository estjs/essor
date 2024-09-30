import type { EffectFn } from './signal';

type Job = () => void;
type PreFlushCb = () => void;

// Main job queue
const queue: Job[] = [];
// Queue for pre-flush callbacks
const activePreFlushCbs: PreFlushCb[] = [];
// A resolved Promise for microtask scheduling
const p = Promise.resolve();
// Flag indicating if a flush is pending
let isFlushPending = false;

/**
 * Wraps a function in a microtask and executes it in the next event loop.
 * @param fn - Function to be executed in the next event loop
 * @returns A Promise representing the completion of the microtask
 */
export function nextTick(fn?: () => void): Promise<void> {
  return fn ? p.then(fn) : p;
}

/**
 * Adds a job to the main job queue and triggers the flush process.
 * @param job - The job function to be executed
 */
export function queueJob(job: Job): void {
  if (!queue.includes(job)) {
    queue.push(job);
    queueFlush(); // Ensure that the job queue is processed
  }
}

/**
 * Schedules the flush process for jobs.
 * If a flush is already pending, it returns early. Otherwise, it sets the flag
 * and schedules the flushJobs function to be executed in the next event loop.
 */
function queueFlush(): void {
  if (isFlushPending) {
    return;
  }
  isFlushPending = true;
  nextTick(flushJobs);
}

/**
 * Adds a pre-flush callback to the pre-flush callback queue and triggers the flush process.
 * @param cb - The pre-flush callback function to be executed
 */
export function queuePreFlushCb(cb: PreFlushCb): void {
  queueCb(cb, activePreFlushCbs);
}

/**
 * Adds a callback to the specified queue and triggers the flush process.
 * @param cb - The callback function to be added to the queue
 * @param activeQueue - The active queue to which the callback is added
 */
function queueCb(cb: PreFlushCb, activeQueue: PreFlushCb[]): void {
  if (!activeQueue.includes(cb)) {
    activeQueue.push(cb);
    queueFlush();
  }
}

/**
 * Executes all jobs and pre-flush callbacks in the queue.
 */
function flushJobs(): void {
  isFlushPending = false;
  flushPreFlushCbs();
  let job: Job | undefined;
  while ((job = queue.shift())) {
    if (job) {
      job();
    }
  }
}

/**
 * Executes all pre-flush callback functions.
 */
function flushPreFlushCbs(): void {
  while (activePreFlushCbs.length > 0) {
    const cb = activePreFlushCbs.shift();
    if (cb) {
      cb();
    }
  }
}

/**
 * Creates a scheduler function that runs the given effect function
 * with the specified flush strategy.
 *
 * The flush strategy can be one of the following:
 *
 * - `'pre'`: Run the effect function as a pre-flush callback.
 * - `'post'`: Run the effect function in the next event loop.
 * - `'sync'`: Run the effect function immediately.
 *
 * The scheduler function is a function that takes no arguments.
 * When called, it schedules the effect function to be executed
 * according to the specified flush strategy.
 */
export function createScheduler(effect: EffectFn, flush: 'pre' | 'post' | 'sync') {
  if (flush === 'sync') {
    return () => effect();
  } else if (flush === 'pre') {
    return () => queuePreFlushCb(effect);
  } else {
    return () => {
      nextTick(() => queueJob(effect));
    };
  }
}
