import { describe, expect, it } from 'vitest';
import { batch, computed, effect, reactive, signal } from '../src';

/**
 * Regression tests for SIG-P0-01: non-consecutive duplicate dependency reads
 * (e.g. `a, b, a`) must not rewind the dep-link tail cursor. Rewinding orphans
 * every dep tracked between the duplicate link and the tail, so endTracking()
 * would unlink them and their updates would silently stop notifying.
 */
describe('non-consecutive duplicate dependencies', () => {
  it('should keep tracking every dep after reading a, b, c, a', () => {
    const a = signal(1);
    const b = signal(2);
    const c = signal(3);
    let runs = 0;

    effect(
      () => {
        runs++;
        a.value;
        b.value;
        c.value;
        a.value;
      },
      { flush: 'sync' },
    );
    expect(runs).toBe(1);

    b.value++;
    expect(runs).toBe(2);

    c.value++;
    expect(runs).toBe(3);

    // The duplicated dep notifies exactly once per write.
    a.value++;
    expect(runs).toBe(4);
  });

  it('should recompute a computed with duplicate reads when the middle dep changes', () => {
    const a = signal(1);
    const b = signal(10);
    const sum = computed(() => a.value + b.value + a.value);

    expect(sum.value).toBe(12);

    b.value = 20;
    expect(sum.value).toBe(22);

    a.value = 2;
    expect(sum.value).toBe(24);
  });

  it('should unlink deps that are no longer read in the next round', () => {
    const a = signal(1);
    const b = signal(2);
    const useA = signal(true);
    let runs = 0;

    effect(
      () => {
        runs++;
        if (useA.value) {
          a.value;
          b.value;
          a.value;
        } else {
          b.value;
        }
      },
      { flush: 'sync' },
    );
    expect(runs).toBe(1);

    useA.value = false;
    expect(runs).toBe(2);

    // `a` is no longer a dependency; writing it must not re-run the effect.
    a.value++;
    expect(runs).toBe(2);

    b.value++;
    expect(runs).toBe(3);
  });

  it('should survive a nested computed evaluated between duplicate reads', () => {
    // Evaluating `c` mid-run appends c's own link to `a`'s subscriber chain,
    // hijacking `a.subLinkTail` between the effect's two reads of `a`. The
    // duplicate-read detection must not rely on that shared tail — otherwise
    // a second (a, effect) link is created and endTracking / unlink logic
    // operates on a corrupted dep list.
    //
    // NOTE on values: with a sync-flush effect the framework has a separate,
    // pre-existing propagation glitch (audit SIG-02, phase 1): the effect is
    // executed mid-propagate, before `c` is marked PENDING, and the read of
    // `a` consumes its DIRTY bit — so within one write the effect can observe
    // a stale `c`. That glitch hits plain `a + c` diamonds identically and is
    // NOT what this P0 fixes. Here we assert the P0-1 invariant only: the
    // dependency graph stays intact — every subsequent write keeps triggering
    // the effect (no dep silently unlinked, no unbounded duplicate reruns).
    const a = signal(1);
    const c = computed(() => a.value * 10);
    let runs = 0;

    effect(
      () => {
        runs++;
        void (a.value + c.value + a.value);
      },
      { flush: 'sync' },
    );
    expect(runs).toBe(1);

    const runsBeforeFirstWrite = runs;
    a.value = 2;
    expect(runs).toBeGreaterThan(runsBeforeFirstWrite);
    // Bounded: a corrupted dep list with duplicate (a, effect) links would
    // add extra notifications per write.
    expect(runs - runsBeforeFirstWrite).toBeLessThanOrEqual(3);

    const runsBeforeSecondWrite = runs;
    a.value = 5;
    expect(runs).toBeGreaterThan(runsBeforeSecondWrite);
    expect(runs - runsBeforeSecondWrite).toBeLessThanOrEqual(3);
  });

  it('should observe consistent values with a nested computed when the write is batched', () => {
    // batch() + default flush defers effect execution until propagation has
    // finished marking the whole graph, which sidesteps the SIG-02
    // mid-propagate glitch — so here we can assert full value consistency for
    // the duplicate-read case. (flush: 'sync' would bypass batching.)
    const a = signal(1);
    const c = computed(() => a.value * 10);
    let seen = 0;

    effect(() => {
      seen = a.value + c.value + a.value;
    });
    expect(seen).toBe(12);

    batch(() => {
      a.value = 2;
    });
    expect(seen).toBe(24);
  });

  it('should survive a nested computed of a different signal between duplicate reads', () => {
    // Evaluating `d` mid-run bumps the global link version, so the second
    // read of `a` sees a stale version stamp on its earlier link — the
    // duplicate detection must still recognize it positionally instead of
    // creating a second (a, effect) link.
    const a = signal(1);
    const b = signal(5);
    const d = computed(() => b.value * 100);
    let seen = 0;

    effect(
      () => {
        seen = a.value + d.value + a.value;
      },
      { flush: 'sync' },
    );
    expect(seen).toBe(502);

    b.value = 6;
    expect(seen).toBe(602);

    a.value = 2;
    expect(seen).toBe(604);
  });

  it('should keep tracking reactive properties read non-consecutively', () => {
    const obj = reactive({ x: 1, y: 2 });
    let runs = 0;

    effect(
      () => {
        runs++;
        obj.x;
        obj.y;
        obj.x;
      },
      { flush: 'sync' },
    );
    expect(runs).toBe(1);

    obj.y++;
    expect(runs).toBe(2);

    obj.x++;
    expect(runs).toBe(3);
  });
});

/**
 * Behavioral lock for the dep-side round-stamp optimization: a subscriber's
 * FIRST tracking round over deps that already have other (older-round)
 * subscribers takes the O(1) create path instead of backscanning — but
 * genuine non-consecutive duplicates on such shared deps must still dedup
 * to a single link (no double notification per write).
 */
describe('shared dep first-tracking dedup', () => {
  it('should dedup duplicate reads on a dep that already has another subscriber', () => {
    const a = signal(1);
    const b = signal(2);

    // A pre-existing subscriber makes `a.subLinkTail` a foreign link when the
    // second effect tracks `a` for the first time.
    let firstRuns = 0;
    effect(
      () => {
        firstRuns++;
        a.value;
      },
      { flush: 'sync' },
    );

    let secondRuns = 0;
    effect(
      () => {
        secondRuns++;
        a.value;
        b.value;
        a.value;
      },
      { flush: 'sync' },
    );
    expect(secondRuns).toBe(1);

    // Exactly one re-run per write — a duplicate (a, effect2) link would
    // corrupt propagation / notify twice.
    a.value++;
    expect(firstRuns).toBe(2);
    expect(secondRuns).toBe(2);

    b.value++;
    expect(secondRuns).toBe(3);

    // Dep list stays intact across re-tracking rounds.
    a.value++;
    expect(secondRuns).toBe(4);
  });

  it('should keep dedup correct when several effects share several deps', () => {
    const s1 = signal(1);
    const s2 = signal(2);
    const s3 = signal(3);

    const runs = [0, 0, 0];
    for (const [i, sig] of [s1, s2, s3].entries()) {
      // Each effect reads all three signals (shared deps) plus a duplicate.
      effect(
        () => {
          runs[i]++;
          s1.value;
          s2.value;
          s3.value;
          sig.value;
        },
        { flush: 'sync' },
      );
    }
    expect(runs).toEqual([1, 1, 1]);

    s2.value++;
    expect(runs).toEqual([2, 2, 2]);

    s1.value++;
    expect(runs).toEqual([3, 3, 3]);
  });
});
