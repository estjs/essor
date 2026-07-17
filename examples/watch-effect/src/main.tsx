import { createApp, effect, signal, untrack, watch } from 'essor';

function App() {
  // ── ① watch a single source, keep a newValue/oldValue history ────────
  const count = signal(0);
  const watchLog = signal<string[]>([]);
  watch(count, (newValue, oldValue) => {
    watchLog.value = [...watchLog.value, `${oldValue} -> ${newValue}`];
  });

  // ── ② watch options: immediate ────────
  // Fires once on setup with oldValue === undefined, then on every change.
  const immediateLog = signal<string[]>([]);
  watch(
    count,
    (newValue, oldValue) => {
      immediateLog.value = [...immediateLog.value, `${String(oldValue)} -> ${newValue}`];
    },
    { immediate: true },
  );

  // ── ② watch options: once ────────
  // The watcher stops itself after the first callback.
  const onceSource = signal(0);
  const onceCalls = signal(0);
  watch(
    onceSource,
    () => {
      onceCalls.value++;
    },
    { once: true },
  );

  // ── ③ watch multiple sources as an array ────────
  const firstSource = signal(0);
  const secondSource = signal(0);
  const multiLog = signal<string[]>([]);
  watch([firstSource, secondSource], (newValues: any) => {
    const [newFirst, newSecond] = newValues as [number, number];
    multiLog.value = [...multiLog.value, `${newFirst},${newSecond}`];
  });

  // ── ④ effect + cleanup ────────
  // The function returned by the effect body runs right before the next
  // re-run (and on stop). We count how many times that happens.
  const effectTick = signal(0);
  const effectRuns = signal(0);
  const cleanupCalls = signal(0);
  effect(() => {
    void effectTick.value;
    // Writes do not create dependencies, only reads do — so incrementing a
    // counter the effect never reads is safe and cannot cause a loop.
    effectRuns.value++;
    return () => {
      cleanupCalls.value++;
    };
  });

  // ── ⑤ untrack inside an effect ────────
  // `ignored` is read through untrack, so changing it never re-runs the
  // effect. Its latest value is only picked up when `tracked` changes.
  const tracked = signal(0);
  const ignored = signal(0);
  const untrackRuns = signal(0);
  const seenIgnored = signal(0);
  effect(() => {
    void tracked.value;
    // untrack: read `ignored` without subscribing to it.
    const snapshot = untrack(() => ignored.value);
    untrackRuns.value++;
    seenIgnored.value = snapshot;
  });

  return (
    <main data-test="example-root" class="page">
      <h1>Watch &amp; Effect Example</h1>
      <p class="note">watch options, multi-source watch, effect cleanup, and untrack.</p>

      <section class="stack">
        <h2>watch: single source</h2>
        <div class="row">
          <button data-test="watch-increment" onClick={() => count.value++}>
            Increment count
          </button>
        </div>
        <p>
          Count: <strong data-test="watch-count">{count.value}</strong>
        </p>
        <p>
          History: <strong data-test="watch-log">{watchLog.value.join(' | ')}</strong>
        </p>
        <p>
          Immediate history:{' '}
          <strong data-test="immediate-log">{immediateLog.value.join(' | ')}</strong>
        </p>
      </section>

      <section class="stack">
        <h2>watch: once</h2>
        <div class="row">
          <button data-test="once-increment" onClick={() => onceSource.value++}>
            Increment once source
          </button>
        </div>
        <p>
          Source: <strong data-test="once-source">{onceSource.value}</strong>
        </p>
        <p>
          Callback calls: <strong data-test="once-calls">{onceCalls.value}</strong>
        </p>
      </section>

      <section class="stack">
        <h2>watch: multiple sources</h2>
        <div class="row">
          <button data-test="multi-increment-first" onClick={() => firstSource.value++}>
            Increment first
          </button>
          <button data-test="multi-increment-second" onClick={() => secondSource.value++}>
            Increment second
          </button>
        </div>
        <p>
          Pairs: <strong data-test="multi-log">{multiLog.value.join(' | ')}</strong>
        </p>
      </section>

      <section class="stack">
        <h2>effect + cleanup</h2>
        <div class="row">
          <button data-test="effect-trigger" onClick={() => effectTick.value++}>
            Trigger effect
          </button>
        </div>
        <p>
          Effect runs: <strong data-test="effect-runs">{effectRuns.value}</strong>
        </p>
        <p>
          Cleanup calls: <strong data-test="cleanup-calls">{cleanupCalls.value}</strong>
        </p>
      </section>

      <section class="stack">
        <h2>untrack</h2>
        <div class="row">
          <button data-test="tracked-increment" onClick={() => tracked.value++}>
            Increment tracked
          </button>
          <button data-test="ignored-increment" onClick={() => ignored.value++}>
            Increment ignored
          </button>
        </div>
        <p>
          Ignored value: <strong data-test="ignored-value">{ignored.value}</strong>
        </p>
        <p>
          Effect runs: <strong data-test="untrack-runs">{untrackRuns.value}</strong>
        </p>
        <p>
          Ignored value seen by effect:{' '}
          <strong data-test="seen-ignored">{seenIgnored.value}</strong>
        </p>
      </section>
    </main>
  );
}

createApp(App, '#app');
