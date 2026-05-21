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
