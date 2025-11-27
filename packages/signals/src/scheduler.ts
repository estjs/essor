import { warn } from '@estjs/shared';

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
 * Schedules a function to be executed in the next microtask
 *
 * If no function is provided, returns a Promise that resolves in the next microtask.
 * This is useful for waiting until the DOM is updated or deferring execution.
 *
 * @param fn - Optional function to execute
 * @returns A Promise that resolves after the function execution
 */
export function nextTick(fn?: () => void): Promise<void> {
  if (fn) {
    return new Promise((resolve, reject) => {
      queueMicrotask(() => {
        try {
          fn();
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
  }
  return p;
}

/**
 * Adds a job to the main queue and ensures it will be executed
 *
 * Jobs are automatically deduplicated - the same job reference won't be added multiple times.
 * This is useful for batching updates and avoiding redundant work.
 * @param job - The job to enqueue
 */
export function queueJob(job: Job): void {
  queue.add(job); // Set automatically deduplicates
  queueFlush();
}

/**
 * Schedules a queue flush in the next microtask if one hasn't been scheduled yet
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
 * Adds a callback to be executed before the main queue processing
 *
 * Pre-flush callbacks are useful for setup work that needs to run before effects,
 * such as computing derived values or preparing state.
 * @param cb - The callback to execute before the main queue
 */
export function queuePreFlushCb(cb: PreFlushCallback): void {
  activePreFlushCbs.add(cb); // Set automatically deduplicates
  queueFlush();
}

/**
 * Executes all enqueued jobs and pre-flush callbacks
 *
 * This function runs in a microtask and processes the entire queue.
 * Jobs are executed in order, with error handling to prevent one failing job from blocking others.
 *
 * ## Cleanup Process
 *
 * 1. Reset flush pending flag
 * 2. Execute pre-flush callbacks and clear their queue
 * 3. Execute main jobs and clear their queue
 * 4. Handle jobs queued during flush
 *
 * ## Memory Management
 *
 * - Jobs queued during flush are executed in the same cycle
 * - Error handling prevents one failing job from blocking others
 * - All temporary state is cleared after execution
 *
 * @internal
 */
export function flushJobs(): void {
  isFlushPending = false;

  // Execute pre-flush callbacks first
  flushPreFlushCbs();

  // Process jobs until queue is empty
  // This handles jobs queued during flush
  while (queue.size > 0) {
    // Convert Set to array and clear the Set
    const jobs = Array.from(queue);
    queue.clear();

    // Execute all jobs with error handling
    for (const job of jobs) {
      try {
        job();
      } catch (_error) {
        if (__DEV__) {
          console.error('Error executing queued job:', _error);
        }
      }
    }
  }
}

/**
 * Executes all pre-flush callbacks
 *
 * Pre-flush callbacks are executed before the main job queue.
 * This is useful for setup work that needs to run before effects.
 *
 * ## Cleanup Process
 *
 * 1. Copy callbacks to array
 * 2. Clear the callback queue immediately
 * 3. Execute all callbacks with error handling
 *
 * @internal
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
        console.error('Error executing pre-flush callback:', _error);
      }
    }
  }
}

/**
 * Creates a scheduler function for an effect based on the specified flush timing
 *
 * This is used internally by the effect system to control when effects execute:
 * - 'sync': Immediate execution (blocking)
 * - 'pre': Before main queue (setup phase)
 * - 'post': After main queue (cleanup/side effects)
 * @param effect - The effect function to schedule
 * @param flush - When to execute the effect
 * @returns A scheduler function that will run the effect at the appropriate time
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
