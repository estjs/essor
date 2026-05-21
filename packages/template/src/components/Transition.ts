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
  for (let i = 0; i < u.length; i++) {
    const total = toMs(u[i]) + toMs(d[i % d.length] || '0s');
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

// keep references to suppress "unused variable" warnings until the state machine uses them
void addClass;
void removeClass;
void nextFrame;
void forceReflow;

// ---------------------------------------------------------------------------
// Transition component
// ---------------------------------------------------------------------------

function resolveSlot(props: TransitionProps): unknown {
  const c = props.children;
  return typeof c === 'function' ? (c as () => unknown)() : c;
}

export function Transition(props: TransitionProps): Node {
  const anchor = document.createComment('');
  let currentEl: Element | null = null;

  onMount(() => {
    effect(() => {
      const next = resolveSlot(props);
      const nextEl = next instanceof Element ? next : null;
      if (nextEl === currentEl) return;
      if (currentEl?.parentNode) currentEl.parentNode.removeChild(currentEl);
      if (nextEl && anchor.parentNode) anchor.parentNode.insertBefore(nextEl, anchor);
      currentEl = nextEl;
    });
  });

  onCleanup(() => {
    if (currentEl?.parentNode) currentEl.parentNode.removeChild(currentEl);
    currentEl = null;
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

