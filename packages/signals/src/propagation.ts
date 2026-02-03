import { ReactiveFlags } from './constants';
import { type Link, type ReactiveNode, isValidLink } from './link';

interface LinkStackNode {
  /** Link value */
  value: Link | undefined;
  /** Previous stack node */
  prev?: LinkStackNode;
}

/**
 * Propagate changes to all subscribers
 *
 * This is the core propagation algorithm of the reactive system.
 * When a Signal value changes, propagate the DIRTY flag along the subscriber chain.
 *
 * @param link - Starting Link of the subscriber chain
 */
export function propagate(link: Link): void {
  // Next sibling Link
  let next: Link | undefined = link.nextSubLink;
  // Explicit stack for depth-first traversal
  let stack: LinkStackNode | undefined;

  // Main loop - traverse the entire dependency graph
  // eslint-disable-next-line no-restricted-syntax
  top: do {
    const sub = link.subNode;

    // Extract state flags
    const queueBit = sub.flag & ReactiveFlags.QUEUED;
    const watcherBit = sub.flag & ReactiveFlags.WATCHING;
    let flags = sub.flag & ~ReactiveFlags.QUEUED;

    // State machine - decide operation based on current node state
    if (
      !(
        flags &
        (ReactiveFlags.DIRTY |
          ReactiveFlags.PENDING |
          ReactiveFlags.RECURSED |
          ReactiveFlags.RECURSED_CHECK)
      )
    ) {
      // Case 1: Clean state -> mark as PENDING
      sub.flag = queueBit | watcherBit | flags | ReactiveFlags.PENDING;
    } else if (flags & (ReactiveFlags.DIRTY | ReactiveFlags.PENDING)) {
      // Case 2: Already DIRTY or PENDING -> no change, but continue propagation
      // This branch is important: when a node has multiple dependencies (diamond dependency),
      // the first dependency propagation marks it as PENDING, the second should not clear this flag
      // Keep original flags unchanged
    } else if (!(flags & (ReactiveFlags.RECURSED | ReactiveFlags.RECURSED_CHECK))) {
      // Case 3: Already processed but not in recursion chain -> clear flags
      flags = ReactiveFlags.NONE;
      sub.flag = queueBit | watcherBit;
    } else if (!(flags & ReactiveFlags.RECURSED_CHECK)) {
      // Case 4: In recursion chain but not checked -> mark PENDING
      sub.flag =
        queueBit | watcherBit | ((flags & ~ReactiveFlags.RECURSED) | ReactiveFlags.PENDING);
    } else if (!(flags & (ReactiveFlags.DIRTY | ReactiveFlags.PENDING)) && isValidLink(link, sub)) {
      // Case 5: Recursion check and Link valid -> allow propagation
      sub.flag = queueBit | watcherBit | (flags | ReactiveFlags.RECURSED | ReactiveFlags.PENDING);
      flags &= ReactiveFlags.MUTABLE;
    } else {
      // Case 6: Other cases -> clear flags
      flags = ReactiveFlags.NONE;
      sub.flag = queueBit | watcherBit;
    }

    // If it's an Effect, add to execution queue
    if (sub.flag & ReactiveFlags.WATCHING) {
      enqueueEffect(sub as Effect);
    }

    // Continue propagating downward
    if (flags & ReactiveFlags.MUTABLE) {
      const subSubs = sub.subLink;
      if (subSubs) {
        // Has subscribers, go one level deeper
        const nextSub = (link = subSubs).nextSubLink;
        if (nextSub) {
          // Save current context to stack
          stack = { value: next, prev: stack };
          next = nextSub;
        }
        continue;
      }
    }

    // Process sibling nodes
    if (next) {
      link = next;
      next = link.nextSubLink;
      continue;
    }

    // Backtrack to parent level
    while (stack) {
      link = stack.value!;
      stack = stack.prev;
      if (link) {
        next = link.nextSubLink;
        continue top;
      }
    }

    // All nodes processed
    break;
    // eslint-disable-next-line no-constant-condition
  } while (true);
}

/**
 * Shallow propagate - only mark direct subscribers
 *
 * Does not recursively propagate, only affects one level of subscribers.
 * Mainly used for Computed values to update their direct subscribers.
 *
 * @param link - Starting Link of the subscriber chain
 */
export function shallowPropagate(link: Link | undefined): void {
  while (link) {
    const sub = link.subNode;
    const queueBit = sub.flag & ReactiveFlags.QUEUED;
    const flags = sub.flag & ~ReactiveFlags.QUEUED;

    // Process PENDING or clean state nodes, mark them as DIRTY
    if (!(flags & ReactiveFlags.DIRTY) && flags & (ReactiveFlags.MUTABLE | ReactiveFlags.PENDING)) {
      // Mark as DIRTY, clear PENDING flag using bitwise operations
      const newFlags = queueBit | (flags & ~ReactiveFlags.PENDING) | ReactiveFlags.DIRTY;
      sub.flag = newFlags;

      // If it's an Effect, add to execution queue
      if (newFlags & ReactiveFlags.WATCHING) {
        enqueueEffect(sub as Effect);
      }

      // If it's a MUTABLE node (like Computed), continue shallow propagation
      if (flags & ReactiveFlags.MUTABLE && sub.subLink) {
        shallowPropagate(sub.subLink);
      }
    }

    link = link.nextSubLink;
  }
}

/**
 * Effect interface
 *
 * Objects implementing this interface can be scheduled for execution.
 */
export interface Effect extends ReactiveNode {
  /** Whether the Effect is active */
  active: boolean;

  /** Execute the Effect */
  notify(): void;

  /** Trigger debug hook (optional) */
  onTrigger?(event: any): void;
}

export function enqueueEffect(effect: Effect): void {
  // Check if Effect is active
  if (!effect.active) {
    return;
  }

  // Directly call notify, let effect decide how to handle
  effect.notify();
}

/**
 * Clear propagation flags
 *
 * After batch update ends, clear all flags set during propagation.
 *
 * @param node - The node to clear
 */
export function clearPropagationFlags(node: ReactiveNode): void {
  node.flag &= ~(ReactiveFlags.PENDING | ReactiveFlags.RECURSED | ReactiveFlags.RECURSED_CHECK);
}
