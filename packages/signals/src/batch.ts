import { warn } from '@estjs/shared';
import { flushJobs } from './scheduler';
/**
 * Batch update depth
 *
 * Supports nested batch calls.
 * Effects are only flushed when the outermost batch ends.
 */
let batchDepth = 0;

/**
 * Execute a function in batch mode.
 *
 * @param fn - The function to execute in batch mode.
 * @returns The return value of the function.
 *
 * @example
 * ```typescript
 * const x = signal(0);
 * const y = signal(0);
 *
 * effect(() => {
 *   console.log('Sum:', x.value + y.value);
 * });
 *
 * // Without batch - Effect executes 2 times
 * x.value = 1; // Effect executes
 * y.value = 2; // Effect executes
 *
 * // With batch - Effect executes only 1 time
 * batch(() => {
 *   x.value = 10;
 *   y.value = 20;
 * }); // Effect executes once
 * ```
 */
export function batch<T>(fn: () => T): T {
  startBatch();
  try {
    return fn();
  } finally {
    endBatch();
  }
}

/**
 * Start batch update.
 *
 * @returns {void}
 */
export function startBatch(): void {
  batchDepth++;
}

/**
 * End batch update.
 *
 * @returns {void}
 */
export function endBatch(): void {
  // Guard against unbalanced batch calls in all modes: an extra endBatch()
  // must never push batchDepth negative, otherwise a single later startBatch()
  // would "close" the batch and trigger an unexpected flush.
  if (batchDepth === 0) {
    // Development mode: warn about the unbalanced call
    if (__DEV__) {
      warn(
        '[Batch] endBatch() called without matching startBatch(). ' +
          'This indicates unbalanced batch calls in your code. ' +
          'Make sure every startBatch() has a corresponding endBatch(), ' +
          'or use the batch() function which handles this automatically.',
      );
    }
    return;
  }

  // Decrement batch depth
  batchDepth--;

  // When outermost batch ends, flush all queued effects.
  // flushJobs is re-entrancy-safe: if a flush is already running (i.e. this
  // batch ended inside a flushing job), the call is a no-op and the outer
  // flush loop picks up any newly queued jobs.
  if (batchDepth === 0) {
    flushJobs();
  }
}

/**
 * Check if currently in batch update mode.
 *
 * @returns True if currently in batch mode.
 */
export function isBatching(): boolean {
  return batchDepth > 0;
}

/**
 * Get current batch depth.
 *
 * @returns Current batch nesting depth.
 */
export function getBatchDepth(): number {
  return batchDepth;
}
