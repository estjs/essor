import { error, warn } from '@estjs/shared';
import { flushJobs } from './scheduler';
/**
 * Batch update depth
 *
 * Supports nested batch calls.
 * Effects are only flushed when the outermost batch ends.
 */
let batchDepth = 0;

/**
 * Execute a function in batch mode
 *
 * Executes the function in a batch context, where all Signal changes
 * are deferred and processed together after the batch ends.
 *
 * @param fn - The function to execute in batch mode
 * @returns The return value of the function
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
 * Start batch update
 *
 * Increases batch depth.
 * During batch, Effects won't execute immediately.
 */
export function startBatch(): void {
  batchDepth++;
}

/**
 * End batch update
 *
 * Decreases batch depth.
 * When depth reaches zero, flush all queued Effects and clean up.
 *
 * ## Cleanup Process
 *
 * When the outermost batch ends:
 * 1. Flush all queued jobs (effects execute)
 * 2. Job queue is automatically cleared by flushJobs()
 * 3. Temporary flags (QUEUED, DIRTY) are cleared by effect execution
 *
 */
export function endBatch(): void {
  if (__DEV__ && batchDepth === 0) {
    warn(
      '[Batch] endBatch() called without matching startBatch(). ' +
      'This may indicate unbalanced batch calls in your code.',
    );
    return;
  }

  // Decrement and check in one operation
  if (--batchDepth === 0) {
    // Outermost batch ended, execute all Effects
    // flushJobs() will:
    // 1. Execute all queued effects
    // 2. Clear the job queue (Set.clear())
    // 3. Reset the flush pending flag
    flushJobs();

    // Development mode verification
    if (__DEV__ && batchDepth !== 0) {
      error(
        '[Batch] Batch depth is not zero after endBatch(). ' +
        `Current depth: ${batchDepth}. This indicates a bug in batch management.`,
      );
    }
  }
}

/**
 * Check if currently in batch update mode
 *
 * @returns true if currently in batch
 */
export function isBatching(): boolean {
  return batchDepth > 0;
}

/**
 * Get current batch depth
 *
 * Mainly used for debugging.
 *
 * @returns Current batch nesting depth
 */
export function getBatchDepth(): number {
  return batchDepth;
}
