import { error, warn } from '@estjs/shared';

/**
 * Represents a task (job) that can be scheduled for execution
 */
export type Job = () => void;

/**
 * Represents a callback function that should be executed before the main task queue
 */
export type PreFlushCallback = () => void;

/**
 * Represents the possible flush timing strategies for effects
 *
 * - 'pre': Execute before the main queue (useful for component updates)
 * - 'post': Execute after the main queue (default behavior)
 * - 'sync': Execute immediately and synchronously (use sparingly)
 */
export type FlushTiming = 'pre' | 'post' | 'sync';

// Main task queue storing jobs waiting to be executed
// Using Set for automatic deduplication
const queue: Set<Job> = new Set();

// Pre-flush callback queue, cleared before main task queue execution
// Using Set for automatic deduplication
const activePreFlushCbs: Set<PreFlushCallback> = new Set();

// Resolved Promise used to schedule tasks into the microtask queue
const p = Promise.resolve();

// Flag to prevent duplicate flush scheduling, ensuring only one schedule per event loop
let isFlushPending = false;

/**
 * Maximum number of times the job queue may be drained within a single
 * {@link flushJobs} call before we assume a job is synchronously re-queuing
 * itself in an unbounded loop (e.g. an effect that writes a signal it also
 * reads).  When exceeded we bail out and warn
 * instead of freezing the page.
 */
const RECURSION_LIMIT = 100;

/**
 * Schedules a function to be executed in the next microtask.
 *
 * @param fn - Optional function to execute.
 * @returns A Promise that resolves after the function execution.
 */
export function nextTick(fn?: () => void): Promise<void> {
  return fn ? p.then(fn) : p;
}

/**
 * Adds a job to the main queue and ensures it will be executed.
 *
 * @param job - The job to enqueue.
 */
export function queueJob(job: Job): void {
  queue.add(job); // Set automatically deduplicates
  queueFlush();
}

/**
 * Schedules a queue flush in the next microtask if one hasn't been scheduled yet.
 *
 * @returns {void}
 */
function queueFlush(): void {
  if (!isFlushPending) {
    isFlushPending = true;
    nextTick(flushJobs);
  }
}

/**
 * Adds a callback to be executed before the main queue processing.
 *
 * @param cb - The callback to execute before the main queue.
 */
export function queuePreFlushCb(cb: PreFlushCallback): void {
  activePreFlushCbs.add(cb); // Set automatically deduplicates
  queueFlush();
}

/**
 * Executes all enqueued jobs and pre-flush callbacks.
 *
 * @returns {void}
 */
export function flushJobs(): void {
  isFlushPending = false;

  // Execute pre-flush callbacks first
  flushPreFlushCbs();

  // Process jobs until queue is empty.
  //
  // Each drain snapshots the currently-queued jobs into an array and clears the
  // live Set *before* running them. This is deliberate: iterating a Set with
  // `for…of` would also visit entries appended during iteration, so a job that
  // re-queues itself would spin inside a single pass and never hit the
  // recursion guard below. Snapshotting means jobs queued during a drain are
  // deferred to the next while-iteration, where `drainCount` can catch a
  // runaway loop.
  let drainCount = 0;
  while (queue.size > 0) {
    if (++drainCount > RECURSION_LIMIT) {
      queue.clear();
      if (__DEV__) {
        warn(
          `[Scheduler] Maximum recursive flush count (${RECURSION_LIMIT}) exceeded. ` +
            'This usually means an effect or watch callback is mutating a reactive ' +
            'dependency it also reads, causing an infinite update loop. ' +
            'The remaining queued jobs have been dropped to keep the app responsive.',
        );
      }
      return;
    }

    const jobs = [...queue];
    queue.clear();
    for (const job of jobs) {
      try {
        job();
      } catch (_error) {
        if (__DEV__) {
          error('Error executing queued job:', _error);
        }
      }
    }
  }
}

/**
 * Executes all pre-flush callbacks.
 *
 * @returns {void}
 */
function flushPreFlushCbs(): void {
  // Convert Set to array and clear the Set immediately
  // This allows new callbacks to be queued during execution
  const callbacks = Array.from(activePreFlushCbs);
  activePreFlushCbs.clear();

  // Execute all callbacks with error handling
  for (const callback of callbacks) {
    try {
      callback();
    } catch (_error) {
      if (__DEV__) {
        error('Error executing pre-flush callback:', _error);
      }
    }
  }
}

/**
 * Creates a scheduler function for an effect based on the specified flush timing.
 *
 * @param effect - The effect function to schedule.
 * @param flush - When to execute the effect ('pre', 'post', or 'sync').
 * @returns A scheduler function that will run the effect at the appropriate time.
 */
export function createScheduler(
  effect: () => void,
  flush: FlushTiming,
): () => void | Promise<void> {
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
