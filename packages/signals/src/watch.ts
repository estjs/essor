import { hasChanged, isArray, isFunction, isMap, isObject, isSet, warn } from '@estjs/shared';
import { type FlushTiming, createScheduler } from './scheduler';
import { isSignal } from './signal';
import { isReactive } from './reactive';
import { isComputed } from './computed';
import { effect } from './effect';

// A unique initial value used to identify if watcher is running for the first time.
const INITIAL_WATCHER_VALUE = {};

// Watch function options interface.
interface WatchOptions {
  /** Whether to execute the callback immediately once on setup. */
  immediate?: boolean;
  /** Whether to deeply traverse the source to track nested changes. */
  deep?: boolean;
  /**
   * When the callback fires relative to the reactive flush cycle.
   * - `'post'` (default) — queued on the microtask job queue (essor's historical
   *   behavior).
   * - `'pre'`  — queued before the main job queue.
   * - `'sync'` — run synchronously the instant the source changes. Use sparingly:
   *   a callback that mutates a tracked dependency can recurse.
   */
  flush?: FlushTiming;
  /** Stop the watcher automatically after the callback fires once. */
  once?: boolean;
}

// Watch source type, can be value, ref/signal, getter function or array.
type WatchSource<T = any> = T | { value: T } | (() => T);
/**
 * Register a cleanup handler that runs right before the next callback invocation
 */
type OnCleanup = (cleanupFn: () => void) => void;
// Watch callback function type.
type WatchCallback<T = any> = (newValue: T, oldValue: T | undefined, onCleanup: OnCleanup) => void;

/**
 * Iteratively traverse a value, accessing all its properties to trigger
 * dependency tracking. Returns the original value.
 *
 * Uses an explicit stack instead of recursion so deeply nested chains cannot
 * overflow the call stack, and a per-call `seen` Set for cycle detection so no
 * object graph is retained after the walk completes (a module-level Set would
 * pin the entire last-traversed graph in memory). Per-call state also makes
 * re-entrant traversal (a computed read during the walk triggering another
 * traverse) safe with no extra guards.
 */
function traverse(value: any): any {
  if (!isObject(value)) {
    return value;
  }
  const seen = new Set<any>();
  const stack: any[] = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    // If not an object or already traversed, skip.
    if (!isObject(current) || seen.has(current)) {
      continue;
    }
    seen.add(current);
    // If it's a signal or computed, traverse its .value.
    if (isSignal(current) || isComputed(current)) {
      stack.push(current.value);
      // If it's an array, traverse all its elements.
    } else if (isArray(current)) {
      for (const element of current) {
        stack.push(element);
      }
      // If it's a Map, traverse all its values, and access keys and values to track changes.
    } else if (isMap(current)) {
      current.forEach((v: any) => {
        stack.push(v);
      });
      current.keys();
      current.values();
      // If it's a Set, traverse all its values to track changes.
    } else if (isSet(current)) {
      current.forEach((v: any) => {
        stack.push(v);
      });
      current.values();
      // If it's a plain object, traverse all its keys.
    } else {
      for (const key of Object.keys(current)) {
        stack.push(current[key]);
      }
    }
  }
  return value;
}

/**
 * Create a clone of a value for comparison purposes.
 *
 * Intentionally an identity function: `watch` does NOT deep-clone the watched
 * value between runs (deep cloning every tick is a major performance
 * bottleneck). See the `oldValue` caveat in {@link watch}'s docs.
 *
 * @param value - The value to clone.
 * @returns The value itself.
 */
function cloneValue<T>(value: T): T {
  return value;
}

/**
 * Resolve a single (non-array) watch source into a standard getter function.
 *
 * @param source - The watch source.
 * @returns A getter function.
 */
function resolveSingleSource<T>(source: WatchSource<T>): () => T {
  // Function source: use directly.
  if (isFunction(source)) {
    return source as () => T;
  }
  // Signal or computed: read .value.
  if (isSignal(source) || isComputed(source)) {
    return () => source.value as T;
  }
  // Reactive object: deep traverse to track nested changes.
  if (isReactive(source)) {
    return () => traverse(source) as unknown as T;
  }
  // Plain value: identity getter.
  return () => source as T;
}

/**
 * Resolve watch sources of various forms into a standard getter function.
 *
 * @param source - The watch source passed by the user.
 * @returns A getter function that returns the current source value.
 */
function resolveSource<T>(source: WatchSource<T>): () => T {
  // A reactive array is a single reactive source (deep-traversed), not a
  // multi-source list — check reactivity BEFORE isArray (SIG-15).
  if (isArray(source) && !isReactive(source)) {
    // Pre-build per-element getters; call sites only allocate the output array.
    const getters = (source as WatchSource[]).map((s) => resolveSingleSource(s));
    return () => getters.map((g) => g()) as unknown as T;
  }
  return resolveSingleSource(source);
}

/**
 * Watch one or more reactive data sources and execute callback when sources change.
 *
 * To capture a previous snapshot for object sources, derive the specific
 * primitive you care about in a getter:
 *
 * ```ts
 * // ❌ old === new — both point at the mutated object
 * watch(state, (n, o) => { ... });
 *
 * // ✅ watch a derived primitive; oldValue is a real previous value
 * watch(() => state.count, (n, o) => { ... }); // o is the prior count
 * ```
 *
 * For primitive sources (signals/computed/getters returning primitives),
 * `oldValue` behaves as expected.
 *
 * **Cleanup for async side effects.** The callback receives a third argument,
 * `onCleanup`, to cancel stale work before the next run (and on stop):
 *
 * ```ts
 * watch(id, async (id, _old, onCleanup) => {
 *   const controller = new AbortController();
 *   onCleanup(() => controller.abort());
 *   const data = await fetch(`/api/${id}`, { signal: controller.signal });
 * });
 * ```
 *
 * @param source - The source(s) to watch.
 * @param callback - The callback function to execute when source changes.
 * @param options - Configuration options (`immediate`, `deep`, `flush`, `once`).
 * @returns {Function} A function to stop watching.
 */
export function watch<T = any>(
  source: WatchSource<T>,
  callback: WatchCallback<T>,
  options: WatchOptions = {},
): () => void {
  const { immediate = false, deep = false, flush = 'post', once = false } = options;

  // Initialize oldValue as a special object to determine if it's the first execution.
  let oldValue: any = INITIAL_WATCHER_VALUE;
  // Holds the value produced by the most recent effect run (including the eager
  // run that `effect()` performs on creation, which seeds the initial value
  // without a second invocation of the getter).
  let lastValue: T;
  let active = true;

  // A single reactive source already deep-traverses inside its own getter
  // (resolveSingleSource), so the effect body must NOT traverse it again —
  // that was the old double-walk for `watch(reactiveObj, cb, { deep: true })`.
  // For every other source, an explicit `deep: true` triggers the body traverse.
  //
  // Order matters: a reactive ARRAY is also `isArray`, but it is a single
  // reactive source (watch its contents), not a multi-source list (SIG-15).
  const isSingleReactive = isReactive(source);
  const isMultiSource = !isSingleReactive && isArray(source);
  const needTraverse = deep && !isSingleReactive;
  // Reactive sources in a multi-source array yield the same proxy reference on
  // every run, so element-wise comparison can never observe their in-place
  // mutations — such arrays must keep the always-fire path (mirroring the
  // single-reactive `isObject(newValue)` branch below).
  //
  // Known limitation: this only detects DIRECT reactive elements. A getter
  // element that returns a stable reactive reference (e.g.
  // `watch([() => state.obj])`) still goes through the element-wise comparison
  // — the reference never changes, so in-place mutations of `state.obj` do not
  // fire the callback. Watch `state.obj` directly (or a derived primitive)
  // instead.
  const forceMultiTrigger = isMultiSource && (source as WatchSource[]).some((s) => isReactive(s));

  // Resolve source to a getter function.
  const getter = resolveSource(source);

  // ── Cleanup handling ────────
  let cleanup: (() => void) | undefined;
  const onCleanup: OnCleanup = (fn: () => void) => {
    cleanup = () => {
      cleanup = undefined;
      try {
        fn();
      } catch (error) {
        if (__DEV__) warn('[watch] cleanup handler threw:', error);
      }
    };
  };
  const runCleanup = (): void => {
    if (cleanup) cleanup();
  };

  // Guards `once` against double-firing when the callback throws or
  // re-triggers the watcher synchronously (sync flush re-entrancy).
  let onceFired = false;

  /**
   * Invoke the user callback with proper cleanup/oldValue bookkeeping.
   */
  const invoke = (newValue: T): void => {
    if (once) {
      if (onceFired) return;
      onceFired = true;
    }
    const prevValue: any = oldValue;
    // Commit the newValue → oldValue snapshot BEFORE running the callback so a
    // re-entrant write from a sync-flush callback sees the up-to-date oldValue
    // instead of the uncommitted previous one.
    oldValue = cloneValue(newValue);
    runCleanup();
    try {
      callback(
        newValue,
        prevValue === INITIAL_WATCHER_VALUE ? undefined : (prevValue as T),
        onCleanup,
      );
    } finally {
      // Stop after the callback so an onCleanup registered inside it still
      // runs; `onceFired` already prevents any re-entrant second invocation.
      if (once) stop();
    }
  };

  /**
   * Runs the scheduled watch job.
   */
  const job = (): void => {
    if (!active) return;
    const currentEffect = runner.effect;
    if (!currentEffect.active) return;

    // Run effect to get new value.
    const newValue = currentEffect.run();

    if (isMultiSource && !deep && !forceMultiTrigger) {
      // The multi-source getter allocates a fresh array every run, so the
      // generic isObject check below would fire the callback even when every
      // source is unchanged. Compare element-wise against the previous
      // snapshot instead. With `deep: true` (or a reactive element, see
      // `forceMultiTrigger`) we keep the always-fire path — nested mutations
      // cannot be detected cheaply by comparing snapshots.
      if (
        oldValue !== INITIAL_WATCHER_VALUE &&
        (newValue as any[]).every((v, i) => !hasChanged(v, (oldValue as any[])[i]))
      ) {
        return;
      }
      invoke(newValue);
      return;
    }

    if (deep || isObject(newValue) || hasChanged(newValue, oldValue)) {
      invoke(newValue);
    }
  };

  // Create an effect to track getter dependencies. The scheduler queues the
  // job according to the requested flush timing.
  const runner = effect(
    () => {
      const value = getter();
      // Explicit deep on a non-reactive source. Reactive sources already deep-
      // traverse inside their getter, so they are excluded via `needTraverse`.
      if (needTraverse) {
        traverse(value);
      }
      lastValue = value;
      return value;
    },
    {
      scheduler: createScheduler(job, flush),
      // The getter's return value is the watched data — a function value
      // must not be captured as an effect cleanup.
      captureCleanup: false,
    },
  );
  // `effect()` already ran the body once on creation, so `lastValue` holds the
  // initial value — no second getter invocation needed here.

  /**
   * Stop watching and run any pending cleanup.
   */
  function stop(): void {
    if (!active) return;
    active = false;
    runCleanup();
    runner.stop();
  }

  if (immediate) {
    // First callback: oldValue is still INITIAL → reported as undefined.
    // If the callback throws we have not yet returned the stop handle, so the
    // caller could never tear the watcher down — stop it here before rethrowing.
    try {
      invoke(lastValue!);
    } catch (error) {
      stop();
      throw error;
    }
  } else {
    // Seed oldValue from the eager run for the first real comparison.
    oldValue = cloneValue(lastValue!);
  }

  return stop;
}
