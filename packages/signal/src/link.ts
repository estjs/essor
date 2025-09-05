import { isFunction, warn } from '@estjs/shared';
import { ReactiveFlags } from './constants';
import type { ReactiveEffect } from './effect';
import type { ComputedImpl } from './computed';

/**
 * Interface representing a reactive node that can be linked to other nodes.
 * This is the core structure for the dependency tracking system.
 */
export interface ReactiveNode {
  // dependency link head
  depLink?: Link;
  // subscriber link head
  subLink?: Link;

  // dependency link tail, fastest way to get the last link
  depLinkTail?: Link;
  // subscriber link tail, fastest way to get the last link
  subLinkTail?: Link;

  // flag
  flag: number;
}

/**
 * Interface representing a link between two reactive nodes.
 * Links form a bidirectional graph structure for efficient dependency management.
 */
export interface Link {
  depNode: ReactiveNode | ComputedImpl<any> | ReactiveEffect<any>;
  subNode: ReactiveNode | ComputedImpl<any> | ReactiveEffect<any>;

  prevSubLink?: Link;
  nextSubLink?: Link;

  prevDepLink?: Link;
  nextDepLink?: Link;
}

// Array of watched effects (effects) - optimized with pre-allocated size
const watchedEffects: (ReactiveNode | ComputedImpl<any> | ReactiveEffect<any> | undefined)[] = [];

// Current batch processing nesting depth
export let batchDepth = 0;
// Currently executing subscriber (effect)
export let activeSub: ReactiveNode | undefined = undefined;

// Current index of the array, for iteration
let watchedEffectsIndex = 0;
// Current length of the array
let watchedEffectsLength = 0;

/**
 * Links two reactive nodes together, establishing a dependency relationship.
 * This creates a bidirectional link structure for efficient dependency management.
 *
 * @param depNode - The dependency node (e.g., signal)
 * @param subNode - The subscriber node (e.g., computed, effect)
 */
export function linkReactiveNode(depNode: ReactiveNode, subNode: ReactiveNode) {
  const preDepTail = subNode.depLinkTail;

  // check if the dependency node is already linked to the subscriber node
  if (preDepTail && preDepTail.depNode === depNode) {
    return;
  }

  let nextDepLink: Link | undefined;

  // check if the subscriber node is in the recursive check process
  if (subNode.flag & ReactiveFlags.RECURSED_CHECK) {
    // ReactiveFlags.RECURSED_CHECK
    nextDepLink = preDepTail ? preDepTail?.nextDepLink : subNode.depLink;

    // check if the dependency node is already linked to the subscriber node
    if (nextDepLink && nextDepLink.depNode === depNode) {
      // update the dependency node tail
      subNode.depLinkTail = nextDepLink;
      return;
    }
  }

  const preSubTail = depNode.subLinkTail;

  const newLinkNode: Link = {
    depNode, // signal
    subNode, // computed,effect
    prevSubLink: preSubTail,
    nextSubLink: undefined,
    prevDepLink: preDepTail,
    nextDepLink,
  };

  // update the dependency node and subscriber node link
  depNode.subLink = subNode.depLinkTail = newLinkNode;

  // update the previous dependency link
  if (nextDepLink) {
    nextDepLink.prevDepLink = newLinkNode;
  }
  // update the previous dependency link
  if (preDepTail) {
    preDepTail.nextDepLink = newLinkNode;
  } else {
    subNode.depLink = newLinkNode;
  }

  // update the previous subscriber link
  if (preSubTail) {
    preSubTail.nextSubLink = newLinkNode;
  } else {
    depNode.subLink = newLinkNode;
  }
}

/**
 * Unlinks a reactive node from its dependency relationship.
 * This removes the bidirectional link and cleans up references.
 *
 * @param linkNode - The link node to unlink
 * @param subNode - The subscriber node to unlink
 * @returns The next dependency link for iteration
 */
export function unlinkReactiveNode(linkNode: Link, subNode: ReactiveNode = linkNode.subNode) {
  const depNode = linkNode.depNode;

  // update the previous subscriber link
  const prevSubLink = linkNode.prevSubLink;
  const nextSubLink = linkNode.nextSubLink;
  // update the previous dependency link
  const prevDepLink = linkNode.prevDepLink;
  const nextDepLink = linkNode.nextDepLink;

  // update the 'nextDep' 'prevDep' pointer
  if (nextDepLink) {
    nextDepLink.prevDepLink = prevDepLink;
  } else {
    // if there is no next, update the subscriber's dependency tail pointer
    subNode.depLinkTail = prevDepLink;
  }

  // update the 'prevDep' 'nextDep' pointer
  if (prevDepLink) {
    prevDepLink.nextDepLink = nextDepLink;
  } else {
    // if there is no previous, update the subscriber's dependency head pointer
    subNode.depLink = nextDepLink;
  }

  // update the 'nextSub' 'prevSub' pointer
  if (nextSubLink) {
    nextSubLink.prevSubLink = prevSubLink;
  } else {
    // if there is no next, update the dependency's subscriber tail pointer
    depNode.subLinkTail = prevSubLink;
  }

  // update the 'prevSub' 'nextSub' pointer
  if (prevSubLink) {
    prevSubLink.nextSubLink = nextSubLink;
  } else if ((depNode.subLink = nextSubLink)) {
    // if the dependency's subscriber list becomes empty, clean up all dependencies of the dependency
    // But only if we're not already in a cleanup operation to prevent infinite recursion
    if (!(depNode.flag & ReactiveFlags.RECURSED_CHECK)) {
      depNode.flag |= ReactiveFlags.RECURSED_CHECK;
      let toRemove = depNode.depLink;
      if (toRemove) {
        // Clean up all dependencies of the dependency node
        // This ensures that when a node loses all subscribers, its dependencies are also cleaned up
        while (toRemove) {
          toRemove = unlinkReactiveNode(toRemove, depNode);
        }
        // mark the dependency as "dirty", need to be re-evaluated
        depNode.flag |= ReactiveFlags.DIRTY; // ReactiveFlags.DIRTY
      }
      depNode.flag &= ~ReactiveFlags.RECURSED_CHECK;
    }
  }

  // return the next dependency link, for iteration deletion
  return nextDepLink;
}

/**
 * Checks if a link is valid for a given subscriber node.
 * This validates the link structure during dependency traversal.
 *
 * @param checkLink - The link to check
 * @param sub - The subscriber node
 * @returns True if the link is valid
 */
function isValidLink(checkLink: Link, sub: ReactiveNode): boolean {
  const depsTail = sub.depLinkTail;
  if (depsTail) {
    let link = sub.depLink!;
    // Iterate through the dependency list to check if the link is valid
    // We need to check each dependency link until we find a match or reach the end
    while (link) {
      // if the link is found in the dependency list, it is valid
      if (link === checkLink) {
        return true;
      }
      // If we've reached the tail, we've checked all dependencies
      if (link === depsTail) {
        break;
      }
      link = link.nextDepLink!;
    }
  }
  return false;
}

/**
 * Propagates state changes through the dependency graph.
 * This function traverses the link structure and updates node states.
 * Optimized with better memory management and faster iteration.
 *
 * @param linkNode - The starting link node for propagation
 */
export function propagate(link: Link): void {
  const stack: Link[] = [link];
  let stackIndex = 0;

  while (stackIndex < stack.length) {
    let currentLink: Link | undefined = stack[stackIndex++];

    // Traverse all nodes in the current level
    while (currentLink) {
      const sub = currentLink.subNode;
      let flags = sub.flag;

      if (flags & (ReactiveFlags.MUTABLE | ReactiveFlags.WATCHING)) {
        const hasRecursedFlags = flags & (ReactiveFlags.RECURSED_CHECK | ReactiveFlags.RECURSED);
        const hasDirtyFlags = flags & (ReactiveFlags.DIRTY | ReactiveFlags.PENDING);

        if (!hasRecursedFlags && !hasDirtyFlags) {
          sub.flag = flags | ReactiveFlags.PENDING;
        } else if (!hasRecursedFlags) {
          flags = ReactiveFlags.NONE;
        } else if (!(flags & ReactiveFlags.RECURSED_CHECK)) {
          sub.flag = (flags & ~ReactiveFlags.RECURSED) | ReactiveFlags.PENDING;
          flags &= ReactiveFlags.MUTABLE;
        } else if (!hasDirtyFlags && isValidLink(currentLink, sub)) {
          sub.flag = flags | ReactiveFlags.RECURSED | ReactiveFlags.PENDING;
          flags &= ReactiveFlags.MUTABLE;
        } else {
          flags = ReactiveFlags.NONE;
        }

        // Batch process watching effects to reduce array operation overhead
        if (flags & ReactiveFlags.WATCHING) {
          watchedEffects[watchedEffectsLength++] = sub;
        }

        // Use stack iteration instead of recursive calls
        if (flags & ReactiveFlags.MUTABLE) {
          const subSubs = sub.subLink;
          if (subSubs) {
            stack[stack.length] = subSubs;
          }
        }
      }

      currentLink = currentLink.nextSubLink;
    }
  }
}

/**
 * Sets the currently active subscriber node.
 * This is used during dependency tracking to establish relationships.
 *
 * @param sub - The subscriber node to set as active
 * @returns The previously active subscriber
 */
export function setActiveSub(sub?: ReactiveNode): ReactiveNode | undefined {
  try {
    // Return the previous activeSub
    return activeSub;
  } finally {
    // Set the new activeSub
    activeSub = sub;
  }
}

/**
 * Flushes all watched effects in the current batch.
 * This executes all pending effects that were queued during propagation.
 * Optimized with better memory management.
 */
export function flushWatchedEffects(): void {
  // Iterate and execute all pending effects
  while (watchedEffectsIndex < watchedEffectsLength) {
    const effect = watchedEffects[watchedEffectsIndex]!;
    watchedEffects[watchedEffectsIndex++] = undefined; // Clean up array items

    // Check if the effect has a notify method (like ReactiveEffect)
    if (isFunction((effect as ReactiveEffect).notify)) {
      (effect as ReactiveEffect).notify(); // Notify effect to execute
    }
  }
  // Reset index and length
  watchedEffectsIndex = 0;
  watchedEffectsLength = 0;
}

// Check if a subscriber's dependencies are "dirty" (i.e., need to be updated).
export function checkDirty(link: Link, sub: ReactiveNode): boolean {
  /**
   * Recursively check the entire dependency chain starting from link.
   * When needing to go deeper into the next layer, recursively call itself.
   */
  function checkDown(link: Link, sub: ReactiveNode): boolean {
    let curLink: Link | undefined = link; // Current Link being checked
    while (curLink !== undefined) {
      const dep = curLink.depNode;
      const depFlags = dep.flag;

      /* -------- 1. First check if self or dependencies are already dirty -------- */
      if (sub.flag & ReactiveFlags.DIRTY) {
        return true;
      }

      if (
        (depFlags & (ReactiveFlags.MUTABLE | ReactiveFlags.DIRTY)) ===
        (ReactiveFlags.MUTABLE | ReactiveFlags.DIRTY)
      ) {
        // Dependency itself is dirty, needs update
        if ((dep as ComputedImpl<any>).shouldUpdate()) {
          const subs = dep.subLink!;
          if (subs.nextSubLink) {
            shallowPropagate(subs);
          }
          return true;
        }
      }

      /* -------- 2. If dependency is Mutable|Pending, need to recursively go deeper -------- */
      if (
        (depFlags & (ReactiveFlags.MUTABLE | ReactiveFlags.PENDING)) ===
        (ReactiveFlags.MUTABLE | ReactiveFlags.PENDING)
      ) {
        // Go deeper to check dep's dependencies
        const innerDirty = checkDown(dep.depLink!, dep);

        // After returning, handle according to results consistent with original logic
        if (innerDirty) {
          if ((dep as ComputedImpl<any>).shouldUpdate()) {
            const subs = dep.subLink!;
            if (subs.nextSubLink) {
              shallowPropagate(subs);
            }
            // Continue traversing with dep's upper layer sub (i.e., outer sub)
            // No additional processing needed here, as outer while will continue checking curLink.nextDep
            return true;
          }
        } else {
          dep.flag &= ~ReactiveFlags.PENDING; // Clear pending
        }
      }

      /* -------- 3. Continue to next sibling dependency -------- */
      curLink = curLink.nextDepLink;
    }

    // Finished checking entire chain without finding any dirty
    return false;
  }

  return checkDown(link, sub);
}

/**
 * Shallow propagation that only marks subscribers as "dirty" without immediate execution.
 * This is used for efficient batch processing of state changes.
 *
 * @param link - The starting link for shallow propagation
 */
export function shallowPropagate(link: Link | undefined): void {
  if (!link) return;

  // Use iterative approach to avoid infinite recursion
  let currentLink: Link | undefined = link;
  while (currentLink) {
    const sub = currentLink.subNode;
    const subFlags = sub.flag;

    // When the subscriber is pending or dirty, mark as dirty
    if ((subFlags & (ReactiveFlags.PENDING | ReactiveFlags.DIRTY)) === ReactiveFlags.PENDING) {
      // ReactiveFlags.PENDING | ReactiveFlags.DIRTY
      sub.flag = subFlags | ReactiveFlags.DIRTY; // ReactiveFlags.DIRTY
    }

    // Move to the next subscriber
    currentLink = currentLink.nextSubLink;
  }
}

/**
 * Batch function that combines multiple operations into a single update.
 * This optimizes performance by deferring effect execution until the batch completes.
 *
 * @param fn - Function containing reactive updates to batch
 */
export function batch(fn: () => void) {
  // Increase batch processing depth
  ++batchDepth;
  try {
    // Execute the function
    fn();
  } catch (error_) {
    // Catch and print errors
    console.error(`Error during batch: ${error_}`);
  } finally {
    // When the outermost batch ends, flush all pending effects
    if (!--batchDepth && watchedEffectsLength) {
      flushWatchedEffects();
    }
  }
}

/**
 * Helper function to check if we're currently in a batch operation.
 *
 * @returns True if currently batching
 */
export function isBatching(): boolean {
  return batchDepth > 0;
}

/**
 * Starts a batch operation, increasing the batch depth.
 * This is used internally by the batch system.
 */
export function startBatch(): void {
  ++batchDepth;
}

/**
 * Ends a batch operation, decreasing the batch depth.
 * If this is the outermost batch and there are pending effects, they are flushed.
 */
export function endBatch(): void {
  // If depth is 0 and there are pending effects, flush them
  if (!--batchDepth && watchedEffectsLength) {
    flushWatchedEffects();
  }
}

/**
 * Starts dependency tracking for a subscriber node.
 * This sets up the node for dependency collection and marks it as being tracked.
 *
 * @param sub - The subscriber node to start tracking
 * @returns The previously active subscriber
 */
export function startTracking(sub: ReactiveNode): ReactiveNode | undefined {
  // Reset the subscriber's dependency tail pointer
  sub.depLinkTail = undefined;
  // Set flag to recursive check state, and clear dirty and pending state
  sub.flag =
    (sub.flag & ~(ReactiveFlags.RECURSED | ReactiveFlags.DIRTY | ReactiveFlags.PENDING)) |
    ReactiveFlags.RECURSED_CHECK; // (sub.flag & ~(ReactiveFlags.RECURSED | ReactiveFlags.DIRTY | ReactiveFlags.PENDING)) | ReactiveFlags.RECURSED_CHECK
  // Set current subscriber and return the previous one
  return setActiveSub(sub);
}

/**
 * Ends dependency tracking for a subscriber node.
 * This cleans up dependencies that are no longer needed and restores the previous state.
 *
 * @param sub - The subscriber node to end tracking
 * @param prevSub - The previously active subscriber
 */
export function endTracking(sub: ReactiveNode, prevSub: ReactiveNode | undefined): void {
  // In development mode, check if activeSub was restored correctly.
  if (__DEV__ && activeSub !== sub) {
    warn('Active effect was not restored correctly - this is likely a Vue internal bug.');
  }
  // Restore previous activeSub.
  activeSub = prevSub;

  // Clean up dependencies that are no longer needed in this tracking session.
  const depsTail = sub.depLinkTail;
  let toRemove = depsTail ? depsTail.nextDepLink : sub.depLink;
  while (toRemove) {
    toRemove = unlinkReactiveNode(toRemove, sub);
  }
  // Clear recursive check flag.
  sub.flag &= ~ReactiveFlags.RECURSED_CHECK;
}
