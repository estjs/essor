import { ReactiveFlags } from './constants';
import { type Link, type ReactiveNode, isValidLink } from './link';

/**
 * Effect interface used internally for propagation
 */
export interface Effect extends ReactiveNode {
  notify(): void;
  _active?: boolean;
}

/**
 * Enqueue an Effect for execution
 *
 * Calls effect.notify() which decides whether to run synchronously or defer.
 *
 * @param effect - The Effect to enqueue
 */
export function enqueueEffect(effect: Effect): void {
  effect?.notify?.();
}

/**
 * Clear propagation flags (PENDING, RECURSED, RECURSED_CHECK) from a node
 *
 * Used by tests and internal cleanup to reset propagation state.
 *
 * @param node - The reactive node to clear flags on
 */
export function clearPropagationFlags(node: ReactiveNode): void {
  node.flag &= ~(ReactiveFlags.PENDING | ReactiveFlags.RECURSED | ReactiveFlags.RECURSED_CHECK);
}

/**
 * Propagate changes through the reactive graph
 *
 * Traverses subscriber graph marking nodes PENDING/DIRTY.
 * For WATCHING nodes (Effects), calls enqueueEffect.
 * For MUTABLE nodes (Computed), descends into their subscribers.
 *
 * Follows the alien-signals propagate algorithm: a stack is used to track
 * the "next sibling at the current level" so backtracking works correctly.
 *
 * @param link - Starting Link of the subscriber chain
 */
export function propagate(link: Link): void {
  let next: Link | undefined = link.nextSubLink;
  let stack: { value: Link | undefined; prev: typeof stack } | undefined;

  // eslint-disable-next-line no-restricted-syntax
  top: do {
    const sub = link.subNode;
    const watcherBit = sub.flag & ReactiveFlags.WATCHING;
    let flags = sub.flag;

    if (
      !(
        flags &
        (ReactiveFlags.DIRTY |
          ReactiveFlags.PENDING |
          ReactiveFlags.RECURSED |
          ReactiveFlags.RECURSED_CHECK)
      )
    ) {
      // Case 1: Clean state → mark PENDING
      sub.flag = flags | ReactiveFlags.PENDING;
      if (watcherBit) {
        enqueueEffect(sub as unknown as Effect);
      }
    } else if (!(flags & (ReactiveFlags.RECURSED | ReactiveFlags.RECURSED_CHECK))) {
      // Case 2: Already processed (DIRTY or PENDING alone) → stop downward
      flags = ReactiveFlags.NONE;
    } else if (!(flags & ReactiveFlags.RECURSED_CHECK)) {
      // Case 3: RECURSED set but not checking → clear RECURSED, mark PENDING
      sub.flag = (flags & ~ReactiveFlags.RECURSED) | ReactiveFlags.PENDING;
    } else if (!(flags & (ReactiveFlags.DIRTY | ReactiveFlags.PENDING)) && isValidLink(link, sub)) {
      // Case 4: RECURSED_CHECK set, clean, valid link → allow propagation through recursion
      sub.flag = flags | (ReactiveFlags.RECURSED | ReactiveFlags.PENDING);
      if (watcherBit) {
        enqueueEffect(sub as unknown as Effect);
      }
      flags &= ReactiveFlags.MUTABLE;
    } else {
      // Case 5: Already DIRTY/PENDING in RECURSED_CHECK → stop
      flags = ReactiveFlags.NONE;
    }

    if (flags & ReactiveFlags.MUTABLE) {
      // MUTABLE (Computed): descend into its subscribers
      const subSubs = sub.subLink;
      if (subSubs !== undefined) {
        // alien-signals pattern: save the CURRENT 'next' (sibling at outer level) to stack
        // before diving into this node's own subscriber chain.
        const nextSub = subSubs.nextSubLink;
        if (nextSub !== undefined) {
          // comp has multiple subscribers: save next and start at first
          stack = { value: next, prev: stack };
          next = nextSub;
        }
        link = subSubs;
        continue;
      }
    }

    // Advance to next sibling or restore from stack
    if ((link = next!) !== undefined) {
      next = link.nextSubLink;
      continue;
    }

    while (stack !== undefined) {
      link = stack.value!;
      stack = stack.prev;
      if (link !== undefined) {
        next = link.nextSubLink;
        continue top;
      }
    }

    break;
  } while (true);
}

/**
 * Shallow propagate from a Computed value to its direct subscribers
 *
 * Implements alien-signals' shallowPropagate semantics:
 * Only processes subscribers that are PENDING but NOT yet DIRTY.
 *
 * This guards against double-notification:
 * - propagate() marks effects PENDING and immediately calls enqueueEffect→notify().
 *   notify() sets DIRTY on the effect (our EffectImpl.notify does this).
 * - When shallowPropagate is later called from checkDirty (which runs inside the
 *   already-enqueued effect's fn()), the effect has DIRTY set → skipped by the guard.
 *   No double execution.
 * - If the effect is only PENDING (not yet run, e.g., in a multi-subscriber scenario
 *   where shallowPropagate fires before propagate reaches the effect naturally), it
 *   upgrades PENDING→DIRTY and calls enqueueEffect.
 * - If the effect is RECURSED_CHECK (currently executing via startTracking), it still
 *   gets upgraded to DIRTY but notify() is not called — the next run will recheck.
 *
 * @param link - Starting Link of the subscriber chain
 */
export function shallowPropagate(link: Link | undefined): void {
  while (link) {
    const sub = link.subNode;
    const flags = sub.flag;

    if ((flags & (ReactiveFlags.PENDING | ReactiveFlags.DIRTY)) === ReactiveFlags.PENDING) {
      // PENDING but not DIRTY: upgrade to DIRTY and notify if not mid-run
      sub.flag = flags | ReactiveFlags.DIRTY;

      if (
        (flags & (ReactiveFlags.WATCHING | ReactiveFlags.RECURSED_CHECK)) ===
        ReactiveFlags.WATCHING
      ) {
        enqueueEffect(sub as unknown as Effect);
      }
    }
    // DIRTY already → already handled. Neither PENDING nor DIRTY → clean, skip.

    link = link.nextSubLink;
  }
}
