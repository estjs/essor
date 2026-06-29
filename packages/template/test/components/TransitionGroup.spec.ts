import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signal } from '@estjs/signals';
import { TransitionGroup, isTransitionGroup } from '../../src/components/TransitionGroup';
import { createComponent } from '../../src/component';
import { onCleanup as onCleanupFromTestScope } from '../../src/scope';
import {
  cleanupContext,
  createContext,
  popContextStack,
  pushContextStack,
  resetEnvironment,
} from '../test-utils';

// Fire all onMount callbacks under a scope (mirrors test helper used by
// Transition.spec). TransitionGroup itself registers exactly one onMount.
function flushMount(scope: any): void {
  scope.onMount?.forEach((cb: () => void) => cb());
  scope.children?.forEach((c: any) => flushMount(c));
}

/**
 * Stub `Element.prototype.getBoundingClientRect` so the FLIP path can see a
 * non-zero delta. Stubbed elements report their rect as
 * `(indexInParent * 10, 0, 10, 10)` — so reordering a child to a different
 * slot produces a real `dx`. The snapshot taken BEFORE reconcile sees the
 * pre-mutation index; the post-mutation read sees the new index.
 *
 * Only elements that carry `data-rect-key` use the stub; everything else
 * falls back to the original (jsdom zero-rects).
 */
function stubIndexBasedRects(): () => void {
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function () {
    if (!Object.hasOwn(this.dataset, 'rectKey')) return original.call(this);
    const parent = this.parentElement;
    const idx = parent ? [...parent.children].indexOf(this) : 0;
    return {
      x: idx * 10,
      y: 0,
      left: idx * 10,
      top: 0,
      right: idx * 10 + 10,
      bottom: 10,
      width: 10,
      height: 10,
      toJSON() {
        return {};
      },
    } as DOMRect;
  };
  return () => {
    Element.prototype.getBoundingClientRect = original;
  };
}

describe('transitionGroup', () => {
  let container: HTMLElement;

  beforeEach(() => {
    resetEnvironment();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container.parentNode) container.parentNode.removeChild(container);
    vi.restoreAllMocks();
  });

  function mountGroup(node: Node) {
    container.appendChild(node);
  }

  it('is marked with TRANSITION_GROUP_COMPONENT symbol', () => {
    expect(isTransitionGroup(TransitionGroup)).toBe(true);
    expect(isTransitionGroup({})).toBe(false);
  });

  it('renders the initial list inside a default <div> wrapper, in order', () => {
    const items = signal([1, 2, 3]);
    const ctx = createContext(null);
    pushContextStack(ctx);
    const wrapper = TransitionGroup({
      each: items,
      key: (n) => n,
      children: (n) => {
        const li = document.createElement('li');
        li.textContent = `r${n}`;
        return li;
      },
    });
    mountGroup(wrapper);
    flushMount(ctx);

    expect(wrapper.tagName).toBe('DIV');
    const rows = wrapper.querySelectorAll('li');
    expect(rows.length).toBe(3);
    expect([...rows].map((n) => n.textContent)).toEqual(['r1', 'r2', 'r3']);

    popContextStack();
    cleanupContext(ctx);
  });

  it('honors a custom `tag`', () => {
    const ctx = createContext(null);
    pushContextStack(ctx);
    const wrapper = TransitionGroup({
      each: [1],
      key: (n) => n,
      tag: 'ul',
      children: (n) => {
        const li = document.createElement('li');
        li.textContent = String(n);
        return li;
      },
    });
    mountGroup(wrapper);
    flushMount(ctx);
    expect(wrapper.tagName).toBe('UL');

    popContextStack();
    cleanupContext(ctx);
  });

  it('does NOT run enter on the initial mount (first frame is silent)', () => {
    const ctx = createContext(null);
    pushContextStack(ctx);
    const wrapper = TransitionGroup({
      each: [1, 2],
      key: (n) => n,
      name: 'fade',
      children: (n) => {
        const div = document.createElement('div');
        div.textContent = String(n);
        return div;
      },
    });
    mountGroup(wrapper);
    flushMount(ctx);

    for (const child of wrapper.children) {
      expect(child.classList.contains('fade-enter-from')).toBe(false);
      expect(child.classList.contains('fade-enter-active')).toBe(false);
    }

    popContextStack();
    cleanupContext(ctx);
  });

  it('runs enter on items added after mount (synchronous class application)', async () => {
    const items = signal([1, 2]);
    const ctx = createContext(null);
    pushContextStack(ctx);
    const wrapper = TransitionGroup({
      each: items,
      key: (n) => n,
      name: 'fade',
      children: (n) => {
        const div = document.createElement('div');
        div.dataset.key = String(n);
        return div;
      },
    });
    mountGroup(wrapper);
    flushMount(ctx);

    items.value = [1, 2, 3];
    await Promise.resolve();

    // The new row (key=3) should immediately have the enter-from + enter-active
    // classes applied. Existing rows must NOT.
    const added = wrapper.querySelector('[data-key="3"]') as HTMLElement;
    expect(added).not.toBeNull();
    expect(added.classList.contains('fade-enter-from')).toBe(true);
    expect(added.classList.contains('fade-enter-active')).toBe(true);

    const existing = wrapper.querySelector('[data-key="1"]') as HTMLElement;
    expect(existing.classList.contains('fade-enter-from')).toBe(false);

    popContextStack();
    cleanupContext(ctx);
  });

  it('runs leave on items removed after mount (pins position absolute + adds leave classes)', async () => {
    const items = signal([1, 2, 3]);
    const ctx = createContext(null);
    pushContextStack(ctx);
    const wrapper = TransitionGroup({
      each: items,
      key: (n) => n,
      name: 'fade',
      // Force the JS-hook path so leave doesn't auto-resolve via the no-css
      // shortcut. `onLeave` keeps the entry pinned until the test allows it.
      onLeave: () => {
        /* never call done — keeps the leaving element observable */
      },
      children: (n) => {
        const div = document.createElement('div');
        div.dataset.key = String(n);
        return div;
      },
    });
    mountGroup(wrapper);
    flushMount(ctx);

    items.value = [1, 3];
    await Promise.resolve();

    const leaving = wrapper.querySelector('[data-key="2"]') as HTMLElement;
    expect(leaving).not.toBeNull();
    expect(leaving.classList.contains('fade-leave-from')).toBe(true);
    expect(leaving.classList.contains('fade-leave-active')).toBe(true);
    expect(leaving.style.position).toBe('absolute');

    popContextStack();
    cleanupContext(ctx);
  });

  it('css:false fast path detaches removed items synchronously (no leave animation)', async () => {
    const items = signal([1, 2, 3]);
    const ctx = createContext(null);
    pushContextStack(ctx);
    const wrapper = TransitionGroup({
      each: items,
      key: (n) => n,
      css: false,
      children: (n) => {
        const div = document.createElement('div');
        div.dataset.key = String(n);
        return div;
      },
    });
    mountGroup(wrapper);
    flushMount(ctx);
    expect(wrapper.children.length).toBe(3);

    items.value = [1, 3];
    await Promise.resolve();
    expect(wrapper.children.length).toBe(2);
    expect(wrapper.querySelector('[data-key="2"]')).toBeNull();

    popContextStack();
    cleanupContext(ctx);
  });

  it('reorder preserves DOM identity (no remount)', async () => {
    const items = signal([1, 2, 3]);
    const renderCount: Record<number, number> = {};
    const ctx = createContext(null);
    pushContextStack(ctx);
    const wrapper = TransitionGroup({
      each: items,
      key: (n) => n,
      children: (n) => {
        renderCount[n] = (renderCount[n] ?? 0) + 1;
        const div = document.createElement('div');
        div.dataset.key = String(n);
        return div;
      },
    });
    mountGroup(wrapper);
    flushMount(ctx);
    const initial1 = wrapper.querySelector('[data-key="1"]');
    const initial2 = wrapper.querySelector('[data-key="2"]');
    const initial3 = wrapper.querySelector('[data-key="3"]');

    items.value = [3, 1, 2];
    await Promise.resolve();

    expect([...wrapper.children].map((c) => c.dataset.key)).toEqual(['3', '1', '2']);
    // Same elements were moved, not recreated.
    expect(wrapper.querySelector('[data-key="1"]')).toBe(initial1);
    expect(wrapper.querySelector('[data-key="2"]')).toBe(initial2);
    expect(wrapper.querySelector('[data-key="3"]')).toBe(initial3);
    expect(renderCount).toEqual({ 1: 1, 2: 1, 3: 1 });

    popContextStack();
    cleanupContext(ctx);
  });

  it('fLIP move applies moveClass when reorder produces a non-zero delta', async () => {
    // Index-based rect stub: items at index N report rect (N*10, 0, 10, 10).
    // After reorder, items occupy different indices, so dx becomes non-zero.
    const restore = stubIndexBasedRects();

    const items = signal([1, 2]);
    const ctx = createContext(null);
    pushContextStack(ctx);
    const wrapper = TransitionGroup({
      each: items,
      key: (n) => n,
      name: 'list',
      // duration: 0 — `whenTransitionEnds` schedules the moveClass removal on
      // setTimeout(_, 0), which is a macrotask. `await Promise.resolve()`
      // only flushes microtasks, so the class is still present when we read.
      duration: 0,
      children: (n) => {
        const div = document.createElement('div');
        div.dataset.rectKey = String(n);
        return div;
      },
    });
    mountGroup(wrapper);
    flushMount(ctx);

    items.value = [2, 1];
    await Promise.resolve();

    const el1 = wrapper.querySelector('[data-rect-key="1"]') as HTMLElement;
    const el2 = wrapper.querySelector('[data-rect-key="2"]') as HTMLElement;
    expect(el1.classList.contains('list-move') || el2.classList.contains('list-move')).toBe(true);

    restore();
    popContextStack();
    cleanupContext(ctx);
  });

  it('honors a custom `moveClass`', () => {
    const restore = stubIndexBasedRects();

    const items = signal([1, 2]);
    const ctx = createContext(null);
    pushContextStack(ctx);
    const wrapper = TransitionGroup({
      each: items,
      key: (n) => n,
      moveClass: 'pony-move',
      duration: 0,
      children: (n) => {
        const div = document.createElement('div');
        div.dataset.rectKey = String(n);
        return div;
      },
    });
    mountGroup(wrapper);
    flushMount(ctx);

    items.value = [2, 1];

    const el = wrapper.querySelector('[data-rect-key="1"]') as HTMLElement;
    expect(el.classList.contains('pony-move')).toBe(true);
    expect(el.classList.contains('v-move')).toBe(false);

    restore();
    popContextStack();
    cleanupContext(ctx);
  });

  it('supports children returning a Component instance', () => {
    const items = signal([1, 2]);
    const Row = (props: { value: number }) => {
      const div = document.createElement('div');
      div.className = 'cmp-row';
      div.textContent = `c${props.value}`;
      return div;
    };

    const ctx = createContext(null);
    pushContextStack(ctx);
    const wrapper = TransitionGroup({
      each: items,
      key: (v) => v,
      children: (v) => createComponent(Row, { value: v }),
    });
    mountGroup(wrapper);
    flushMount(ctx);

    const rows = wrapper.querySelectorAll('.cmp-row');
    expect(rows.length).toBe(2);
    expect([...rows].map((n) => n.textContent)).toEqual(['c1', 'c2']);

    popContextStack();
    cleanupContext(ctx);
  });

  // Regression: a Component child rendering multiple root nodes used to leak
  // its trailing siblings into the wrapper on leave — only `entry.el` (the
  // first root) was removed. Cleanup must reclaim every rendered root.
  it('detaches ALL rendered nodes of a multi-root Component on leave', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const items = signal([1, 2]);
    const MultiRoot = (props: { value: number }) => {
      const a = document.createElement('span');
      a.className = `mrow mrow-a-${props.value}`;
      a.textContent = `a${props.value}`;
      const b = document.createElement('span');
      b.className = `mrow mrow-b-${props.value}`;
      b.textContent = `b${props.value}`;
      return [a, b];
    };

    const ctx = createContext(null);
    pushContextStack(ctx);
    const wrapper = TransitionGroup({
      each: items,
      key: (v) => v,
      css: false, // synchronous detach via the no-animation fast path
      children: (v) => createComponent(MultiRoot, { value: v }),
    });
    mountGroup(wrapper);
    flushMount(ctx);

    // Both rows' two roots are mounted.
    expect(wrapper.querySelectorAll('.mrow').length).toBe(4);

    items.value = [2];
    await Promise.resolve();

    // Row 1's BOTH roots (a1 + b1) must be detached, not just the first.
    expect(wrapper.querySelector('.mrow-a-1')).toBeNull();
    expect(wrapper.querySelector('.mrow-b-1')).toBeNull();
    // Row 2 still intact.
    expect(wrapper.querySelectorAll('.mrow').length).toBe(2);

    popContextStack();
    cleanupContext(ctx);
    warnSpy.mockRestore();
  });

  it('detaches ALL rendered nodes of a multi-root Component on full group cleanup', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ctx = createContext(null);
    pushContextStack(ctx);
    const MultiRoot = () => {
      const a = document.createElement('em');
      a.className = 'leak-test';
      const b = document.createElement('em');
      b.className = 'leak-test';
      return [a, b];
    };
    const wrapper = TransitionGroup({
      each: [1],
      key: (v) => v,
      children: () => createComponent(MultiRoot, {}),
    });
    mountGroup(wrapper);
    flushMount(ctx);

    expect(wrapper.querySelectorAll('.leak-test').length).toBe(2);

    popContextStack();
    cleanupContext(ctx);

    // After group teardown, both rendered roots are gone.
    expect(wrapper.querySelectorAll('.leak-test').length).toBe(0);
    warnSpy.mockRestore();
  });

  it('disposes per-row scope when an item is removed (onCleanup fires)', async () => {
    const cleaned: number[] = [];
    const items = signal([1, 2]);
    const ctx = createContext(null);
    pushContextStack(ctx);
    const wrapper = TransitionGroup({
      each: items,
      key: (n) => n,
      // Use css:false so the leave path disposes the row's scope synchronously
      // (the animated path defers disposal to transitionend, which jsdom
      // doesn't fire). The contract — "scope dies when item leaves" — is the
      // same in both modes.
      css: false,
      children: (n) => {
        onCleanupFromTestScope(() => cleaned.push(n));
        const div = document.createElement('div');
        return div;
      },
    });
    mountGroup(wrapper);
    flushMount(ctx);

    items.value = [2];
    await Promise.resolve();
    expect(cleaned).toEqual([1]);

    popContextStack();
    cleanupContext(ctx);
  });

  it('disposes ALL per-row scopes on group cleanup', () => {
    const cleaned: number[] = [];
    const ctx = createContext(null);
    pushContextStack(ctx);
    const wrapper = TransitionGroup({
      each: [1, 2, 3],
      key: (n) => n,
      children: (n) => {
        onCleanupFromTestScope(() => cleaned.push(n));
        return document.createElement('div');
      },
    });
    mountGroup(wrapper);
    flushMount(ctx);

    popContextStack();
    cleanupContext(ctx);
    expect(cleaned.sort()).toEqual([1, 2, 3]);
  });

  it('cancels explicit enter duration timers on group cleanup', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'requestAnimationFrame'] });
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    try {
      const items = signal([1]);
      const after = vi.fn();
      const ctx = createContext(null);
      pushContextStack(ctx);
      const wrapper = TransitionGroup({
        each: items,
        key: (n) => n,
        duration: 10_000,
        onAfterEnter: after,
        children: (n) => {
          const div = document.createElement('div');
          div.dataset.key = String(n);
          return div;
        },
      });
      mountGroup(wrapper);
      flushMount(ctx);

      items.value = [1, 2];
      await Promise.resolve();
      vi.advanceTimersByTime(34);
      await Promise.resolve();

      popContextStack();
      cleanupContext(ctx);

      expect(clearSpy).toHaveBeenCalled();

      vi.runOnlyPendingTimers();
      await Promise.resolve();

      expect(after).not.toHaveBeenCalled();
      expect(wrapper.querySelector('[data-key="2"]')).toBeNull();
    } finally {
      clearSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it('throws on missing key or children prop', () => {
    expect(() =>
      TransitionGroup({
        each: [1],
        // @ts-expect-error — intentionally bad
        key: undefined,
        children: () => document.createElement('div'),
      }),
    ).toThrow(TypeError);
    expect(() =>
      TransitionGroup({
        each: [1],
        key: (n) => n,
        // @ts-expect-error — intentionally bad
        children: undefined,
      }),
    ).toThrow(TypeError);
  });

  it('leave→re-enter cancels the in-flight leave (key reappears mid-flight)', async () => {
    const items = signal([1, 2]);
    let leaveCancelled = 0;
    const ctx = createContext(null);
    pushContextStack(ctx);
    const wrapper = TransitionGroup({
      each: items,
      key: (n) => n,
      name: 'fade',
      // Block leave on a JS hook so we can poke the list while it's leaving.
      onLeave: () => {
        /* intentionally never call done */
      },
      onLeaveCancelled: () => {
        leaveCancelled++;
      },
      children: (n) => {
        const div = document.createElement('div');
        div.dataset.key = String(n);
        return div;
      },
    });
    mountGroup(wrapper);
    flushMount(ctx);

    // Remove key=2 → it enters the leaving state but never completes.
    items.value = [1];
    await Promise.resolve();
    const leaving = wrapper.querySelector('[data-key="2"]') as HTMLElement;
    expect(leaving.style.position).toBe('absolute');

    // Re-add key=2 → leave should be cancelled, styles restored.
    items.value = [1, 2];
    await Promise.resolve();
    expect(leaveCancelled).toBe(1);
    const resurrected = wrapper.querySelector('[data-key="2"]') as HTMLElement;
    expect(resurrected).toBe(leaving); // same element
    expect(resurrected.style.position).toBe('');

    popContextStack();
    cleanupContext(ctx);
  });

  // ---------------------------------------------------------------------------
  // Mid-list ops + combined updates
  // ---------------------------------------------------------------------------

  it('add in the middle: only the new item gets enter classes', async () => {
    const items = signal([1, 3]);
    const ctx = createContext(null);
    pushContextStack(ctx);
    const wrapper = TransitionGroup({
      each: items,
      key: (n) => n,
      name: 'fade',
      children: (n) => {
        const div = document.createElement('div');
        div.dataset.key = String(n);
        return div;
      },
    });
    mountGroup(wrapper);
    flushMount(ctx);

    items.value = [1, 2, 3];
    await Promise.resolve();

    expect([...wrapper.children].map((c) => c.dataset.key)).toEqual(['1', '2', '3']);
    const inserted = wrapper.querySelector('[data-key="2"]') as HTMLElement;
    expect(inserted.classList.contains('fade-enter-from')).toBe(true);
    expect(
      (wrapper.querySelector('[data-key="1"]') as HTMLElement).classList.contains(
        'fade-enter-from',
      ),
    ).toBe(false);
    expect(
      (wrapper.querySelector('[data-key="3"]') as HTMLElement).classList.contains(
        'fade-enter-from',
      ),
    ).toBe(false);

    popContextStack();
    cleanupContext(ctx);
  });

  it('remove from the middle: only the removed item gets leave classes', async () => {
    const items = signal([1, 2, 3]);
    const ctx = createContext(null);
    pushContextStack(ctx);
    const wrapper = TransitionGroup({
      each: items,
      key: (n) => n,
      name: 'fade',
      onLeave: () => {
        /* never call done — pin the leaving element so the test can read it */
      },
      children: (n) => {
        const div = document.createElement('div');
        div.dataset.key = String(n);
        return div;
      },
    });
    mountGroup(wrapper);
    flushMount(ctx);

    items.value = [1, 3];
    await Promise.resolve();

    const left = wrapper.querySelector('[data-key="2"]') as HTMLElement;
    expect(left.classList.contains('fade-leave-from')).toBe(true);
    expect(left.style.position).toBe('absolute');

    for (const k of ['1', '3']) {
      const stayed = wrapper.querySelector(`[data-key="${k}"]`) as HTMLElement;
      expect(stayed.classList.contains('fade-leave-from')).toBe(false);
      expect(stayed.classList.contains('fade-enter-from')).toBe(false);
    }

    popContextStack();
    cleanupContext(ctx);
  });

  it('combined add + remove + move in a single update', async () => {
    const restore = stubIndexBasedRects();
    const items = signal([1, 2, 3]);
    const ctx = createContext(null);
    pushContextStack(ctx);
    const wrapper = TransitionGroup({
      each: items,
      key: (n) => n,
      name: 'combo',
      duration: 0,
      onLeave: () => {
        /* keep leaving entry observable */
      },
      children: (n) => {
        const div = document.createElement('div');
        div.dataset.rectKey = String(n);
        div.dataset.key = String(n);
        return div;
      },
    });
    mountGroup(wrapper);
    flushMount(ctx);

    // 1) remove 1, 2) keep 2 but move it, 3) keep 3 but move it, 4) add 4
    items.value = [3, 2, 4];
    await Promise.resolve();

    // The removed item is pinned with leave-active.
    const removed = wrapper.querySelector('[data-key="1"]') as HTMLElement;
    expect(removed.classList.contains('combo-leave-active')).toBe(true);
    expect(removed.style.position).toBe('absolute');

    // The added item runs enter.
    const added = wrapper.querySelector('[data-key="4"]') as HTMLElement;
    expect(added.classList.contains('combo-enter-from')).toBe(true);

    // Staying items 2 and 3 are reordered AND get move animation (delta ≠ 0).
    // Order in DOM (excluding leaving absolute): 3, 2, 4.
    const inOrder = [...wrapper.children].filter(
      (c) => (c as HTMLElement).style.position !== 'absolute',
    );
    expect(inOrder.map((c) => c.dataset.key)).toEqual(['3', '2', '4']);

    const stay2 = wrapper.querySelector('[data-key="2"]') as HTMLElement;
    const stay3 = wrapper.querySelector('[data-key="3"]') as HTMLElement;
    expect(stay2.classList.contains('combo-move') || stay3.classList.contains('combo-move')).toBe(
      true,
    );

    restore();
    popContextStack();
    cleanupContext(ctx);
  });

  it('items signal updated synchronously twice: only the latest list is rendered', async () => {
    const items = signal([1, 2]);
    const ctx = createContext(null);
    pushContextStack(ctx);
    const wrapper = TransitionGroup({
      each: items,
      key: (n) => n,
      css: false,
      children: (n) => {
        const div = document.createElement('div');
        div.dataset.key = String(n);
        return div;
      },
    });
    mountGroup(wrapper);
    flushMount(ctx);

    items.value = [1, 2, 3];
    items.value = [3, 2, 1];
    await Promise.resolve();

    expect([...wrapper.children].map((c) => c.dataset.key)).toEqual(['3', '2', '1']);

    popContextStack();
    cleanupContext(ctx);
  });

  it('clears the entire list (every item leaves)', async () => {
    const items = signal([1, 2, 3]);
    const ctx = createContext(null);
    pushContextStack(ctx);
    const wrapper = TransitionGroup({
      each: items,
      key: (n) => n,
      css: false,
      children: (n) => {
        const div = document.createElement('div');
        div.dataset.key = String(n);
        return div;
      },
    });
    mountGroup(wrapper);
    flushMount(ctx);
    expect(wrapper.children.length).toBe(3);

    items.value = [];
    await Promise.resolve();
    expect(wrapper.children.length).toBe(0);

    popContextStack();
    cleanupContext(ctx);
  });

  it('fires onBeforeEnter / onAfterEnter for added items but NOT for initial mount', async () => {
    const events: string[] = [];
    const items = signal([1, 2]);
    const ctx = createContext(null);
    pushContextStack(ctx);
    const wrapper = TransitionGroup({
      each: items,
      key: (n) => n,
      css: false, // sync the enter through the no-css path
      onBeforeEnter: (el) => events.push(`before:${(el as HTMLElement).dataset.key}`),
      onAfterEnter: (el) => events.push(`after:${(el as HTMLElement).dataset.key}`),
      children: (n) => {
        const div = document.createElement('div');
        div.dataset.key = String(n);
        return div;
      },
    });
    mountGroup(wrapper);
    flushMount(ctx);
    // No enter on initial mount.
    expect(events).toEqual([]);

    items.value = [1, 2, 3];
    await Promise.resolve();
    // With css:false, the no-animation enter path calls onAfterEnter
    // (and skips onBeforeEnter, matching `<Transition>`'s css:false contract).
    expect(events).toEqual(['after:3']);

    popContextStack();
    cleanupContext(ctx);
  });
});
