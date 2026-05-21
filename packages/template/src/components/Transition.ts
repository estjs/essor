import type { AnyNode } from '../types';
import { effect } from '@estjs/signals';
import { onCleanup } from '../scope';
import { onMount } from '../lifecycle';
import { TRANSITION_COMPONENT } from '../constants';

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
// Exported pure helpers
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
// Private DOM helpers (used by the state machine in later tasks)
// ---------------------------------------------------------------------------

function addClass(el: Element, cls: string): void {
  for (const c of cls.split(/\s+/)) if (c) el.classList.add(c);
}

function removeClass(el: Element, cls: string): void {
  for (const c of cls.split(/\s+/)) if (c) el.classList.remove(c);
}

function nextFrame(cb: () => void): void {
  requestAnimationFrame(() => requestAnimationFrame(cb));
}

function forceReflow(el: Element): void {
  void (el as HTMLElement).offsetHeight;
}

// forceReflow is reserved for future use (e.g. appear transitions)
void forceReflow;

function resolveDuration(d: TransitionProps['duration'], dir: 'enter' | 'leave'): number | null {
  if (d == null) return null;
  if (typeof d === 'number') return d;
  return d[dir];
}

// ---------------------------------------------------------------------------
// Transition component
// ---------------------------------------------------------------------------

function resolveSlot(props: TransitionProps): unknown {
  const c = props.children;
  return typeof c === 'function' ? (c as () => unknown)() : c;
}

type State = 'idle' | 'entering' | 'entered' | 'leaving';

export function Transition(props: TransitionProps): Node {
  const anchor = document.createComment('');
  const classes = resolveTransitionClasses(props);
  const useCss = props.css !== false;

  let currentEl: Element | null = null;
  let state: State = 'idle';
  let finishEnter: (() => void) | null = null;
  let finishLeave: (() => void) | null = null;

  const enter = (el: Element): void => {
    state = 'entering';
    finishEnter = null;
    props.onBeforeEnter?.(el);

    if (useCss) {
      addClass(el, classes.enterFrom);
      addClass(el, classes.enterActive);
    }

    nextFrame(() => {
      if (state !== 'entering' || currentEl !== el) return;

      if (useCss) {
        removeClass(el, classes.enterFrom);
        addClass(el, classes.enterTo);
      }

      let called = false;
      const done = (): void => {
        if (called) return;
        called = true;
        if (useCss) {
          removeClass(el, classes.enterActive);
          removeClass(el, classes.enterTo);
        }
        finishEnter = null;
        state = 'entered';
        props.onAfterEnter?.(el);
      };
      finishEnter = done;

      props.onEnter?.(el, done);

      if (useCss && !props.onEnter) {
        const explicit = resolveDuration(props.duration, 'enter');
        if (explicit != null) {
          setTimeout(done, explicit);
        } else {
          const info = getTransitionInfo(el, props.type);
          if (info) {
            const onEnd = (): void => {
              el.removeEventListener(info.event, onEnd);
              done();
            };
            el.addEventListener(info.event, onEnd);
          } else {
            done();
          }
        }
      }
    });
  };

  const leave = (el: Element, after: () => void): void => {
    state = 'leaving';
    finishLeave = null;
    props.onBeforeLeave?.(el);

    // Check whether there's actually a CSS transition/animation before going async
    const explicit = resolveDuration(props.duration, 'leave');
    const info = useCss && !props.onLeave && explicit == null ? getTransitionInfo(el, props.type) : null;

    if (!info && !props.onLeave && explicit == null) {
      // No CSS transition and no JS hook — remove synchronously
      if (useCss) {
        // Still apply leave-from/leave-active in case caller inspects them,
        // but clean up immediately and remove
      }
      state = 'idle';
      after();
      props.onAfterLeave?.(el);
      return;
    }

    if (useCss) {
      addClass(el, classes.leaveFrom);
      addClass(el, classes.leaveActive);
    }

    nextFrame(() => {
      if (state !== 'leaving' || currentEl !== null) {
        // either re-entered (currentEl set) or another cycle started
        return;
      }

      if (useCss) {
        removeClass(el, classes.leaveFrom);
        addClass(el, classes.leaveTo);
      }

      let called = false;
      const done = (): void => {
        if (called) return;
        called = true;
        if (useCss) {
          removeClass(el, classes.leaveActive);
          removeClass(el, classes.leaveTo);
        }
        finishLeave = null;
        state = 'idle';
        after();
        props.onAfterLeave?.(el);
      };
      finishLeave = done;

      props.onLeave?.(el, done);

      if (useCss && !props.onLeave) {
        if (explicit != null) {
          setTimeout(done, explicit);
        } else if (info) {
          const onEnd = (): void => {
            el.removeEventListener(info.event, onEnd);
            done();
          };
          el.addEventListener(info.event, onEnd);
        } else {
          done();
        }
      }
    });
  };

  onMount(() => {
    effect(() => {
      const next = resolveSlot(props);
      const nextEl = next instanceof Element ? next : null;
      if (nextEl === currentEl) return;

      const outgoing = currentEl;
      currentEl = nextEl;

      if (outgoing) {
        leave(outgoing, () => {
          if (outgoing.parentNode) outgoing.parentNode.removeChild(outgoing);
        });
      }

      if (nextEl && anchor.parentNode) {
        anchor.parentNode.insertBefore(nextEl, anchor);
        enter(nextEl);
      } else if (!outgoing) {
        state = 'idle';
      }
    });
  });

  onCleanup(() => {
    finishEnter?.();
    finishLeave?.();
    if (currentEl?.parentNode) currentEl.parentNode.removeChild(currentEl);
    currentEl = null;
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
