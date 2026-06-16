import { effect } from '@estjs/signals';
import { isNumber, warn } from '@estjs/shared';
import { onCleanup } from '../scope';
import { onMount } from '../lifecycle';
import { TRANSITION_COMPONENT } from '../constants';
import { isComponent } from '../component';
import { useChildren } from '../utils';
import type { AnyNode } from '../types';
import type { Component } from '../component';

export interface TransitionProps {
  name?: string;
  css?: boolean;
  type?: 'transition' | 'animation';
  appear?: boolean;
  duration?: number | { enter: number; leave: number };
  enterFromClass?: string;
  enterActiveClass?: string;
  enterToClass?: string;
  appearFromClass?: string;
  appearActiveClass?: string;
  appearToClass?: string;
  leaveFromClass?: string;
  leaveActiveClass?: string;
  leaveToClass?: string;
  onBeforeEnter?: (el: Element) => void;
  onEnter?: (el: Element, done: () => void) => void;
  onAfterEnter?: (el: Element) => void;
  onEnterCancelled?: (el: Element) => void;
  onBeforeLeave?: (el: Element) => void;
  onLeave?: (el: Element, done: () => void) => void;
  onAfterLeave?: (el: Element) => void;
  onLeaveCancelled?: (el: Element) => void;
  children?: AnyNode | (() => AnyNode);
}

// ---------------------------------------------------------------------------
// Pure helpers (exported — tests + consumers rely on these)
// ---------------------------------------------------------------------------

export interface TransitionClassNames {
  enterFrom: string;
  enterActive: string;
  enterTo: string;
  leaveFrom: string;
  leaveActive: string;
  leaveTo: string;
  appearFrom: string;
  appearActive: string;
  appearTo: string;
}

export function resolveTransitionClasses(props: TransitionProps): TransitionClassNames {
  const n = props.name ?? 'v';
  const enterFrom = props.enterFromClass ?? `${n}-enter-from`;
  const enterActive = props.enterActiveClass ?? `${n}-enter-active`;
  const enterTo = props.enterToClass ?? `${n}-enter-to`;
  return {
    enterFrom,
    enterActive,
    enterTo,
    leaveFrom: props.leaveFromClass ?? `${n}-leave-from`,
    leaveActive: props.leaveActiveClass ?? `${n}-leave-active`,
    leaveTo: props.leaveToClass ?? `${n}-leave-to`,
    appearFrom: props.appearFromClass ?? enterFrom,
    appearActive: props.appearActiveClass ?? enterActive,
    appearTo: props.appearToClass ?? enterTo,
  };
}

export interface TransitionInfo {
  event: 'transitionend' | 'animationend';
  timeout: number;
}

const toMs = (s: string): number => {
  if (!s) return 0;
  if (s.endsWith('ms')) return Number(s.slice(0, -2).replace(',', '.'));
  return Number(s.slice(0, -1).replace(',', '.')) * 1000;
};

function sumMs(delays: string, durations: string): number {
  const d = delays.split(', ');
  const u = durations.split(', ');
  let max = 0;
  for (const [i, dur] of u.entries()) {
    const total = toMs(dur) + toMs(d[i % d.length] || '0s');
    if (total > max) max = total;
  }
  return max;
}

export function getTransitionInfo(
  el: Element,
  type?: 'transition' | 'animation',
): TransitionInfo | null {
  const s = getComputedStyle(el);
  const tt = type !== 'animation' ? sumMs(s.transitionDelay, s.transitionDuration) : 0;
  const at = type !== 'transition' ? sumMs(s.animationDelay, s.animationDuration) : 0;
  if (tt === 0 && at === 0) return null;
  return tt >= at
    ? { event: 'transitionend', timeout: tt }
    : { event: 'animationend', timeout: at };
}

// ---------------------------------------------------------------------------
// Shared DOM helpers (exported — TransitionGroup reuses these so we don't
// fork the same primitives across two files)
// ---------------------------------------------------------------------------

export function addClass(el: Element, cls: string): void {
  for (const c of cls.split(/\s+/)) if (c) el.classList.add(c);
}

export function removeClass(el: Element, cls: string): void {
  for (const c of cls.split(/\s+/)) if (c) el.classList.remove(c);
}

export function nextFrame(cb: () => void): void {
  requestAnimationFrame(() => requestAnimationFrame(cb));
}

export function forceReflow(el: Element): void {
  void (el as HTMLElement).offsetHeight;
}

/**
 * Wait for a transition/animation on `el` to finish, then call `resolve`.
 * If `explicit` is set, use that as a fixed timeout ; otherwise probe computed style for the longest active timing
 * and listen for the matching end event with a +1ms safety net.
 */
export function whenTransitionEnds(
  el: Element,
  type: TransitionProps['type'],
  explicit: number | null,
  resolve: () => void,
): void {
  if (explicit != null) {
    setTimeout(resolve, explicit);
    return;
  }
  const info = getTransitionInfo(el, type);
  if (!info) {
    resolve();
    return;
  }
  let done = false;
  const finish = (): void => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    el.removeEventListener(info.event, onEnd);
    resolve();
  };
  const onEnd = (): void => finish();
  el.addEventListener(info.event, onEnd);
  const timer = setTimeout(finish, info.timeout + 1);
}

export function resolveDuration(
  d: TransitionProps['duration'],
  dir: 'enter' | 'leave',
): number | null {
  if (d == null) return null;
  if (isNumber(d)) return d;
  return d[dir];
}

function validateSlot(value: unknown): Element | null {
  if (value == null || value === false) return null;
  if (Array.isArray(value)) {
    if (__DEV__) {
      throw new Error(
        '[essor] <Transition> expects a single root child. Use <TransitionGroup> for multiple children.',
      );
    }
    return value[0] instanceof Element ? value[0] : null;
  }
  if (value instanceof Element) return value;
  // A Component instance was passed (e.g. `<Transition><EFoo/></Transition>`):
  // mount it into a detached fragment so we can pluck its rendered root
  // Element, then return that. The Component owns its scope/cleanup, so
  // its disposal will happen via the outer mount tree just like a normal
  // child. We only need the DOM node for class manipulation / events.
  //
  // Note: Transition can only animate a SINGLE root element. If the child
  // component renders multiple roots (fragment-style return), only the
  // first one participates — the rest stay in the detached fragment and
  // never reach the DOM. Surface that as a dev warning.
  if (isComponent(value)) {
    const comp = value as Component;
    if (comp.scope == null) {
      const fragment = document.createDocumentFragment();
      comp.mount(fragment);
    }
    if (__DEV__ && comp.renderedNodes.length > 1) {
      warn(
        '[Transition] child component rendered multiple root nodes; ' +
          'only the first is animated. Wrap the children in a single element ' +
          'or use <TransitionGroup>.',
      );
    }
    const first = comp.firstChild;
    if (first instanceof Element) return first;
    if (__DEV__) {
      warn('[Transition] child component did not render an Element root.');
    }
    return null;
  }
  if (__DEV__) {
    warn('[Transition] received a non-element child; animation will be skipped.');
  }
  return null;
}

// ---------------------------------------------------------------------------
// Transition component
//
// Architecture:
//   - Slot is read inside a single `effect()` via `useChildren()`. The effect
//     body ONLY reads the slot and queues a microtask — it never invokes user
//     hooks. This keeps signal writes (e.g. counters incremented in onEnter)
//     out of the effect's tracking phase, eliminating dep-link corruption.
//   - The state machine runs in `flushCommit()` after the microtask drains.
//   - Cancellation uses Symbol-keyed callbacks on the element itself
//      robust across reentrancy and
//     mid-flight reversals.
//   - End-of-animation detection is centralized in `whenTransitionEnds()`:
//     explicit `duration` wins; otherwise observe the appropriate end event
//     with a `+1ms` safety net (in case the browser drops the event).
// ---------------------------------------------------------------------------

const ENTER_CB = Symbol('enter_cb');
const LEAVE_CB = Symbol('leave_cb');

type CancelCb = ((cancelled?: boolean) => void) | undefined;

type State = 'idle' | 'entering' | 'entered' | 'leaving';

export function Transition(props: TransitionProps): Node {
  const anchor = document.createComment('');
  const classes = resolveTransitionClasses(props);
  const useCss = props.css !== false;
  const readSlot = useChildren<unknown>(props);

  let state: State = 'idle';
  let currentEl: Element | null = null;
  let leavingEl: Element | null = null; // mid-leave element awaiting cleanup
  let mounted = false;

  // Microtask scheduling — keeps the state machine outside the effect's
  // tracking phase, so user hooks that write signals don't corrupt deps.
  // We stash the RAW slot value (pre-validation) so the initial validation
  // can be deferred to onMount; otherwise the multi-child throw would fire
  // during component setup instead of during the mount phase.
  let pendingRaw: unknown = undefined;
  let hasPending = false;
  let scheduled = false;
  let disposed = false;

  const enter = (el: Element, phase: 'enter' | 'appear'): void => {
    // Cancel any in-flight leave on the same element.
    const prevLeave = (el as unknown as Record<symbol, CancelCb>)[LEAVE_CB];
    if (prevLeave) prevLeave(true);

    state = 'entering';
    const fromCls = phase === 'appear' ? classes.appearFrom : classes.enterFrom;
    const activeCls = phase === 'appear' ? classes.appearActive : classes.enterActive;
    const toCls = phase === 'appear' ? classes.appearTo : classes.enterTo;

    props.onBeforeEnter?.(el);

    if (useCss) {
      addClass(el, fromCls);
      addClass(el, activeCls);
    }

    let called = false;
    const done = (cancelled?: boolean): void => {
      if (called) return;
      called = true;
      (el as unknown as Record<symbol, CancelCb>)[ENTER_CB] = undefined;
      if (useCss) {
        removeClass(el, fromCls);
        removeClass(el, activeCls);
        removeClass(el, toCls);
      }
      if (cancelled) {
        props.onEnterCancelled?.(el);
      } else {
        state = 'entered';
        props.onAfterEnter?.(el);
      }
    };
    (el as unknown as Record<symbol, CancelCb>)[ENTER_CB] = done;

    nextFrame(() => {
      if (called) return;
      if (useCss) {
        removeClass(el, fromCls);
        addClass(el, toCls);
      }

      if (props.onEnter) {
        props.onEnter(el, () => done(false));
      } else if (useCss) {
        const explicit = resolveDuration(props.duration, 'enter');
        whenTransitionEnds(el, props.type, explicit, () => done(false));
      } else {
        // css=false and no JS hook — no animation
        done(false);
      }
    });
  };

  const leave = (el: Element, after: () => void): void => {
    // Cancel any in-flight enter on the same element, then settle a reflow so
    // the swap to leave-from/leave-active takes effect cleanly
    const prevEnter = (el as unknown as Record<symbol, CancelCb>)[ENTER_CB];
    if (prevEnter) {
      prevEnter(true);
      forceReflow(el);
    }

    state = 'leaving';
    props.onBeforeLeave?.(el);

    if (useCss) {
      addClass(el, classes.leaveFrom);
      addClass(el, classes.leaveActive);
    }

    let called = false;
    const done = (cancelled?: boolean): void => {
      if (called) return;
      called = true;
      (el as unknown as Record<symbol, CancelCb>)[LEAVE_CB] = undefined;
      if (useCss) {
        removeClass(el, classes.leaveFrom);
        removeClass(el, classes.leaveActive);
        removeClass(el, classes.leaveTo);
      }
      if (cancelled) {
        props.onLeaveCancelled?.(el);
      } else {
        state = 'idle';
        after();
        props.onAfterLeave?.(el);
      }
    };
    (el as unknown as Record<symbol, CancelCb>)[LEAVE_CB] = done;

    // Decide whether there is any animation to wait for. We must query
    // computed style AFTER applying leave-active so the rule on that class
    // is visible.
    const explicit = resolveDuration(props.duration, 'leave');
    const hasCssInfo =
      useCss && !props.onLeave && explicit == null ? !!getTransitionInfo(el, props.type) : false;

    if (!props.onLeave && explicit == null && !hasCssInfo) {
      // No animation path — tear down synchronously to preserve the
      // no-animation contract relied on by tests and the SSR sanity checks.
      done(false);
      return;
    }

    nextFrame(() => {
      if (called) return;
      if (useCss) {
        removeClass(el, classes.leaveFrom);
        addClass(el, classes.leaveTo);
      }

      if (props.onLeave) {
        props.onLeave(el, () => done(false));
      } else if (useCss) {
        whenTransitionEnds(el, props.type, explicit, () => done(false));
      } else {
        done(false);
      }
    });
  };

  const commit = (next: Element | null, isFirst: boolean): void => {
    // Leave → Enter reversal — revive the still-leaving element rather than
    // mounting a fresh node from the slot .
    if (next && state === 'leaving' && leavingEl) {
      const reviving = leavingEl;
      const leaveCb = (reviving as unknown as Record<symbol, CancelCb>)[LEAVE_CB];
      if (leaveCb) leaveCb(true); // fires onLeaveCancelled + scrubs leave classes
      leavingEl = null;
      currentEl = reviving;
      enter(reviving, 'enter');
      return;
    }

    if (next === currentEl) return;

    const outgoing = currentEl;
    currentEl = next;

    if (outgoing) {
      leavingEl = outgoing;
      const captured = outgoing;
      leave(captured, () => {
        if (captured.parentNode) captured.parentNode.removeChild(captured);
        if (leavingEl === captured) leavingEl = null;
      });
    }

    if (next && anchor.parentNode) {
      anchor.parentNode.insertBefore(next, anchor);
      if (isFirst && !props.appear) {
        // Initial mount, no `appear` — render immediately, skip animation.
        state = 'entered';
      } else {
        enter(next, isFirst && props.appear ? 'appear' : 'enter');
      }
    } else if (!outgoing && !next) {
      state = 'idle';
    }
  };

  const flush = (): void => {
    scheduled = false;
    if (disposed || !hasPending) return;
    const raw = pendingRaw;
    hasPending = false;
    pendingRaw = undefined;
    try {
      commit(validateSlot(raw), false);
    } catch (error) {
      if (__DEV__) console.error('[essor] <Transition>', error);
    }
  };

  const scheduleCommit = (raw: unknown): void => {
    pendingRaw = raw;
    hasPending = true;
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(flush);
  };

  // ---------- Lifecycle ----------

  // Effect: pure read. Tracks slot deps, never writes signals. Validation is
  // deferred to commit() so the initial throw lands at mount time, matching
  // the legacy contract (T16 tests).
  const effectRunner = effect(() => {
    const raw = readSlot();
    if (mounted) {
      scheduleCommit(raw);
    } else {
      pendingRaw = raw;
      hasPending = true;
    }
  });

  onMount(() => {
    mounted = true;
    const initial = hasPending ? validateSlot(pendingRaw) : null;
    hasPending = false;
    pendingRaw = undefined;
    commit(initial, true);
  });

  onCleanup(() => {
    disposed = true;
    effectRunner.stop();
    for (const el of [currentEl, leavingEl]) {
      if (!el) continue;
      const ec = (el as unknown as Record<symbol, CancelCb>)[ENTER_CB];
      const lc = (el as unknown as Record<symbol, CancelCb>)[LEAVE_CB];
      ec?.(true);
      lc?.(true);
      if (el.parentNode) el.parentNode.removeChild(el);
    }
    currentEl = null;
    leavingEl = null;
    state = 'idle';
  });

  return anchor;
}

(Transition as unknown as Record<symbol, true>)[TRANSITION_COMPONENT] = true;

/**
 * Check if a node is a Transition component.
 *
 * @param node - Node to check.
 * @returns True if node is a Transition.
 */
export function isTransition(node: unknown): boolean {
  return !!node && !!(node as Record<symbol, unknown>)[TRANSITION_COMPONENT];
}
