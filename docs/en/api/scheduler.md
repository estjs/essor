# Scheduler

The scheduler batches reactive side effects into microtask-based flush cycles. Instead of running every effect synchronously, Essor queues jobs and drains them once per microtask, deduplicating repeated work and guaranteeing a stable execution order.

Most application code only needs `nextTick`. The queue functions (`queueJob`, `queuePreFlushCb`, `queuePostFlushJob`) are lower-level building blocks — the same primitives the framework uses internally to schedule effects, component updates, and Suspense resolution.

## nextTick

Schedules a function to run in the next microtask, after the current flush cycle has completed. Returns a Promise, so it can also be awaited without a callback.

```ts
import { nextTick, signal, effect } from '@estjs/signals';

const count = signal(0);

effect(() => {
  console.log('count is', count.value);
});
// logs: count is 0

count.value = 1;
// The effect has not run yet — it is queued for the next microtask.

await nextTick();
// logs: count is 1
console.log('all effects have settled');
```

With a callback:

```ts
nextTick(() => {
  // Runs after the pending flush cycle.
  console.log('DOM and effects are up to date');
});
```

## queueJob

Adds a job to the **main queue** and schedules a flush for the next microtask. The queue is a `Set`, so queuing the same function multiple times before a flush runs it only once:

```ts
import { queueJob, nextTick } from '@estjs/signals';

const job = () => console.log('run');

queueJob(job);
queueJob(job); // deduplicated — same function reference

await nextTick();
// logs: run   (exactly once)
```

This is the default scheduling channel: effects created with `flush: 'post'` (the default) run as main-queue jobs.

## queuePreFlushCb

Adds a callback to the **pre-flush queue**. Pre-flush callbacks always run **before the next main job**. They are used for work that must observe state before effects re-render — for example, effects created with `flush: 'pre'`.

A key behavior: if a main job queues a pre-flush callback, that callback runs before the *next* main job, not at the end of the cycle:

```ts
import { queueJob, queuePreFlushCb, nextTick } from '@estjs/signals';

const order: string[] = [];

queueJob(() => {
  order.push('main1');
  queuePreFlushCb(() => order.push('pre'));
});
queueJob(() => order.push('main2'));

await nextTick();

console.log(order); // ['main1', 'pre', 'main2']
```

## queuePostFlushJob

Adds a callback to the **post-flush queue**, executed only after the pre and main queues are fully drained. Use it for "after all effects have settled" work — DOM measurement, or Suspense `onResolved`-style hooks:

```ts
import { queueJob, queuePostFlushJob, nextTick } from '@estjs/signals';

const order: string[] = [];

queueJob(() => {
  order.push('A');
  queuePostFlushJob(() => order.push('post'));
  queueJob(() => order.push('B'));
});

await nextTick();

console.log(order); // ['A', 'B', 'post']
// 'post' waits for 'B', even though 'B' was queued after it.
```

If a post-flush callback queues new pre/main jobs, the scheduler starts **another full round**, and any newly queued post callbacks wait for that round to drain:

```ts
queueJob(() => order.push('main1'));
queuePostFlushJob(() => {
  order.push('post1');
  queuePreFlushCb(() => order.push('pre2'));
  queueJob(() => order.push('main2'));
  queuePostFlushJob(() => order.push('post2'));
});

await nextTick();
// order: ['main1', 'post1', 'pre2', 'main2', 'post2']
```

## Flush Order

Every flush cycle maintains a strict `pre → main → post` invariant:

1. **pre** — all pending pre-flush callbacks run before the next main job. If a main job queues new pre-flush callbacks, they run before the following main job.
2. **main** — the main job queue is drained. Jobs queued during a drain are deferred to the next iteration of the same cycle.
3. **post** — post-flush callbacks run only once the pre and main queues are completely empty. If they queue new work, a new `pre → main → post` round begins.

```
┌───────────── flush cycle (one microtask) ─────────────┐
│                                                       │
│  round:  pre ──▶ main ──▶ pre ──▶ main ──▶ … ──▶ post │
│            ▲                                     │    │
│            └── post queued new jobs? new round ──┘    │
└───────────────────────────────────────────────────────┘
```

Additional guarantees:

- **Re-entrancy safety** — while a flush is executing (`isFlushing`), nested flush requests (for example `endBatch()` firing inside a running job) return immediately as no-ops. The outer flush loop picks up any newly queued jobs, so a nested flush can never run post-flush callbacks ahead of remaining main jobs.
- **Deduplication** — all three queues are `Set`s; queuing the same function twice before a flush runs it once.
- **Runaway-loop protection** — if the queues are drained more than 100 times within a single flush cycle (typically an effect writing a signal it also reads), the remaining jobs are dropped with a warning instead of freezing the page. Post-flush callbacks still run after the abort.
- **Error isolation** — a throwing job or callback does not prevent the remaining queued jobs from running.

## Relationship with `batch`

`batch` defers the flush until the outermost batch ends, then flushes synchronously. The scheduler queues are the machinery underneath: signal writes queue effect jobs, and `batch` simply controls *when* the drain happens. `nextTick` always resolves after any pending flush, so `await nextTick()` is the reliable way to wait for all effects regardless of how they were scheduled.

## Type Definitions

```ts
/** A task (job) that can be scheduled for execution */
type Job = () => void;

/** A callback executed before the main task queue */
type PreFlushCallback = () => void;

/** A callback executed after the main task queue is fully drained */
type PostFlushCallback = () => void;

/**
 * Flush timing strategies for effects:
 * - 'pre':  execute before the main queue (useful for component updates)
 * - 'post': execute on the main queue (default behavior)
 * - 'sync': execute immediately and synchronously (use sparingly)
 */
type FlushTiming = 'pre' | 'post' | 'sync';

function nextTick(fn?: () => void): Promise<void>;
function queueJob(job: Job): void;
function queuePreFlushCb(cb: PreFlushCallback): void;
function queuePostFlushJob(cb: PostFlushCallback): void;
```

::: tip
In application code, prefer `await nextTick()` to wait for updates and `effect(fn, { flush })` to choose timing. Reach for the raw queue functions only when building framework-level utilities that must slot into a specific phase of the flush cycle.
:::
