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
 * Represents a callback function that should be executed after the main task queue
 */
export type PostFlushCallback = () => void;

/**
 * Represents the possible flush timing strategies for effects
 *
 * - 'pre': Execute before the main queue (useful for component updates)
 * - 'post': Execute on the main queue (default behavior)
 * - 'sync': Execute immediately and synchronously (use sparingly)
 */
export type FlushTiming = 'pre' | 'post' | 'sync';

// Main task queue storing jobs waiting to be executed
// Using Set for automatic deduplication
const queue: Set<Job> = new Set();

// Pre-flush callback queue, cleared before main task queue execution
// Using Set for automatic deduplication
const activePreFlushCbs: Set<PreFlushCallback> = new Set();

// Post-flush callback queue, executed after the main queue is fully drained.
// Used by Suspense to fire onResolved after all effects have settled.
// Using Set for automatic deduplication
const activePostFlushCbs: Set<PostFlushCallback> = new Set();

// Resolved Promise used to schedule tasks into the microtask queue
const p = Promise.resolve();

// Flag to prevent duplicate flush scheduling, ensuring only one schedule per event loop
let isFlushPending = false;

// Flag indicating a flush cycle is currently executing. Guards against
// re-entrant flushJobs calls (e.g. endBatch() firing inside a running job),
// which would otherwise run post-flush callbacks before the remaining main
// jobs of the outer flush.
let isFlushing = false;

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
 * Adds a callback to be executed after the main queue has been fully drained.
 *
 * Useful for Suspense onResolved handlers and DOM-measurement callbacks that
 * must fire after all reactive effects have settled.
 *
 * @param cb - The callback to execute after the main queue.
 */
export function queuePostFlushJob(cb: PostFlushCallback): void {
  activePostFlushCbs.add(cb); // Set automatically deduplicates
  queueFlush();
}

/**
 * Executes all enqueued jobs and pre/post-flush callbacks.
 *
 * Each round maintains the `pre → main → post` invariant:
 * - all pending pre-flush callbacks run before the next main job,
 * - post-flush callbacks only run once pre and main queues are fully drained,
 * - jobs queued by post-flush callbacks trigger a new round, and post waits again.
 *
 * Re-entrant calls (e.g. `endBatch()` firing inside a running job) return
 * immediately — the outer flush loop picks up any newly queued jobs, so a
 * nested flush can never run post-flush callbacks ahead of remaining main jobs.
 *
 * @returns {void}
 */
export function flushJobs(): void {
  if (isFlushing) {
    return;
  }
  isFlushing = true;
  // Allow re-scheduling during the flush: a job queued from inside this cycle
  // after the queues were snapshotted may need a fresh microtask flush.
  isFlushPending = false;

  try {
    // Shared across all rounds of this flush cycle (main↔post included) on
    // purpose: post-flush callbacks that re-queue main jobs which in turn
    // re-queue post callbacks would otherwise ping-pong forever without ever
    // tripping a per-round counter.
    let drainCount = 0;

    do {
      // Process pre-flush callbacks and jobs until both queues are empty.
      //
      // Each drain snapshots the currently-queued jobs into an array and clears
      // the live Set *before* running them. This is deliberate: iterating a Set
      // with `for…of` would also visit entries appended during iteration, so a
      // job that re-queues itself would spin inside a single pass and never hit
      // the recursion guard below. Snapshotting means jobs queued during a
      // drain are deferred to the next while-iteration, where `drainCount` can
      // catch a runaway loop.
      while (queue.size > 0 || activePreFlushCbs.size > 0) {
        if (++drainCount > RECURSION_LIMIT) {
          queue.clear();
          activePreFlushCbs.clear();
          // Deliberately NOT gated on __DEV__: dropping queued jobs is a
          // data-loss level event, so production must get a signal too. The
          // one-time console cost is negligible next to the silent truncation.
          warn(
            `[Scheduler] Maximum recursive flush count (${RECURSION_LIMIT}) exceeded. ` +
              'This usually means an effect or watch callback is mutating a reactive ' +
              'dependency it also reads, causing an infinite update loop. ' +
              'The remaining queued jobs have been dropped to keep the app responsive.',
          );
          // Break (not return) so post-flush callbacks still run — Suspense
          // onResolved and similar "after-all-effects" hooks must fire even
          // after a runaway loop is aborted.
          break;
        }

        // Pre-flush callbacks always run before the next batch of main jobs.
        flushPreFlushCbs();

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
          // A main job may queue pre-flush callbacks (e.g. `flush: 'pre'`
          // effects); they must run before the next main job.
          if (activePreFlushCbs.size > 0) {
            flushPreFlushCbs();
          }
        }
      }

      // Execute post-flush callbacks after pre and main queues are completely
      // drained. These are used by Suspense onResolved and similar
      // "after-all-effects" hooks.
      flushPostFlushCbs();

      // Don't start another round after a runaway loop was aborted.
      if (drainCount > RECURSION_LIMIT) {
        break;
      }

      // Post-flush callbacks may have queued new pre/main jobs (or new post
      // callbacks) — loop for another full round so the invariant holds.
    } while (queue.size > 0 || activePreFlushCbs.size > 0 || activePostFlushCbs.size > 0);
  } finally {
    isFlushing = false;
    // Safety net: if an unexpected throw escaped the loop after queueFlush()
    // set the flag, leaving it true would block every future flush.
    isFlushPending = false;
  }
}

/**
 * Executes all pre-flush callbacks.
 *
 * @returns {void}
 */
function flushPreFlushCbs(): void {
  if (activePreFlushCbs.size === 0) return;

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
 * Executes all post-flush callbacks.
 *
 * Post-flush callbacks fire after the main job queue has been fully drained.
 * They run synchronously (not via microtask) as part of the same flush cycle.
 */
function flushPostFlushCbs(): void {
  if (activePostFlushCbs.size === 0) return;

  const callbacks = Array.from(activePostFlushCbs);
  activePostFlushCbs.clear();

  for (const callback of callbacks) {
    try {
      callback();
    } catch (_error) {
      if (__DEV__) {
        error('Error executing post-flush callback:', _error);
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
      // 'post' is the default — effects run on the main job queue.
      return () => queueJob(effect);
    default:
      if (__DEV__) {
        warn(`Invalid flush timing: ${flush}. Defaulting to 'post'.`);
      }
      return () => queueJob(effect);
  }
}
