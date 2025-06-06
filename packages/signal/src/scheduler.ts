import { warn } from '@estjs/shared';
import type { EffectFn } from './effect';
/**
 * Represents a job that can be scheduled for execution.
 */
export type Job = () => void;

/**
 * Represents a callback that should be executed before the main job queue.
 */
export type PreFlushCallback = () => void;

/**
 * Represents the possible flush timing strategies for effects.
 * - 'pre': Execute before the main queue
 * - 'post': Execute after the main queue
 * - 'sync': Execute immediately
 */
export type FlushTiming = 'pre' | 'post' | 'sync';

// Queue for main jobs
const queue: Job[] = [];

// Queue for pre-flush callbacks
const activePreFlushCbs: PreFlushCallback[] = [];

// A resolved Promise for microtask scheduling
const p = Promise.resolve();

// Flag to prevent multiple flush operations from being scheduled
let isFlushPending = false;

/**
 * Schedules a function to be executed in the next microtask.
 * If no function is provided, returns a Promise that resolves in the next microtask.
 *
 * @param fn - Optional function to execute
 * @returns A Promise that resolves after the function executes
 *
 * @example
 * ```ts
 * // With a callback
 * nextTick(() => console.log('Next tick'));
 *
 * // Without a callback
 *
 * console.log('Next tick');
 * ```
 */
export function nextTick(fn?: () => void): Promise<void> {
  return fn ? p.then(fn) : p;
}

/**
 * Adds a job to the main queue and ensures it will be executed.
 * Jobs are deduplicated - the same job will not be added twice.
 *
 * @param job - The job to queue
 *
 * @example
 * ```ts
 * queueJob(() => {
 *   console.log('This will run in the main queue');
 * });
 * ```
 */
export function queueJob(job: Job): void {
  if (!queue.includes(job)) {
    queue.push(job);
    queueFlush();
  }
}

/**
 * Schedules the queue to be flushed in the next microtask if it isn't already scheduled.
 *
 * @internal
 */
function queueFlush(): void {
  if (!isFlushPending) {
    isFlushPending = true;
    nextTick(flushJobs);
  }
}

/**
 * Adds a callback to be executed before the main queue is processed.
 * Pre-flush callbacks are useful for performing setup work before effects run.
 *
 * @param cb - The callback to execute before the main queue
 *
 * @example
 * ```ts
 * queuePreFlushCb(() => {
 *   console.log('This runs before the main queue');
 * });
 * ```
 */
export function queuePreFlushCb(cb: PreFlushCallback): void {
  queueCb(cb, activePreFlushCbs);
}

/**
 * Helper function to add a callback to a specific queue.
 * Ensures callbacks are not duplicated within their queue.
 *
 * @param cb - The callback to add
 * @param activeQueue - The queue to add the callback to
 * @internal
 */
function queueCb(cb: PreFlushCallback, activeQueue: PreFlushCallback[]): void {
  if (!activeQueue.includes(cb)) {
    activeQueue.push(cb);
    queueFlush();
  }
}

/**
 * Executes all queued jobs and pre-flush callbacks.
 * This function runs in a microtask and processes the entire queue.
 *
 * @internal
 */
export function flushJobs(): void {
  isFlushPending = false;

  // First run pre-flush callbacks
  flushPreFlushCbs();

  // Then process the main queue
  let job: Job | undefined;
  while ((job = queue.shift())) {
    try {
      job();
    } catch (error) {
      if (__DEV__) {
        console.error('Error executing queued job:', error);
      }
      // In production, we continue processing the queue even if one job fails
    }
  }
}

/**
 * Executes all pre-flush callbacks.
 *
 * @internal
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
 * Creates a scheduler function for an effect based on the specified flush timing.
 * This is used internally by the effect system to control when effects are executed.
 *
 * @param {EffectFn} effect - The effect function to schedule
 * @param {FlushTiming} flush - When to execute the effect
 * @returns A scheduler function that will run the effect at the appropriate time
 *
 * @internal
 */
export function createScheduler(effect: EffectFn, flush: FlushTiming): () => void {
  switch (flush) {
    case 'sync':
      return () => effect();
    case 'pre':
      return () => queuePreFlushCb(effect);
    case 'post':
      return () => queueJob(effect);
    default:
      if (__DEV__) {
        warn(`Invalid flush timing: ${flush}. Defaulting to 'post'.`);
      }
      return () => queueJob(effect);
  }
}
