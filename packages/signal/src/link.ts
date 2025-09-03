import { ReactiveFlags } from './constants';
import type { ComputedImpl } from './computed';
import type { EffectFn } from './effect';

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
  depNode: ReactiveNode | ComputedImpl<any> | EffectFn;
  subNode: ReactiveNode | ComputedImpl<any> | EffectFn;

  prevSubLink?: Link;
  nextSubLink?: Link;

  prevDepLink?: Link;
  nextDepLink?: Link;
}

// 被观察的副作用（effects）的数组。
const watchedEffects: (EffectFn | undefined)[] = [];

// 当前批处理的嵌套深度。
export let batchDepth = 0;
// 当前正在执行的订阅者（副作用）。
export let activeSub: ReactiveNode | undefined = undefined;

// 数组的当前索引，用于遍历。
let watchedEffectsIndex = 0;
// 数组的当前长度。
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

  // update the 'nextDep' 'prevDep' pointer.
  if (nextDepLink) {
    nextDepLink.prevDepLink = prevDepLink;
  } else {
    // if there is no next, update the subscriber's dependency tail pointer.
    subNode.depLinkTail = prevDepLink;
  }

  // update the 'prevDep' 'nextDep' pointer.
  if (prevDepLink) {
    prevDepLink.nextDepLink = nextDepLink;
  } else {
    // if there is no previous, update the subscriber's dependency head pointer.
    subNode.depLink = nextDepLink;
  }

  // update the 'nextSub' 'prevSub' pointer.
  if (nextSubLink) {
    nextSubLink.prevSubLink = prevSubLink;
  } else {
    // if there is no next, update the dependency's subscriber tail pointer.
    depNode.subLinkTail = prevSubLink;
  }

  // update the 'prevSub' 'nextSub' pointer.
  if (prevSubLink) {
    prevSubLink.nextSubLink = nextSubLink;
  } else if ((depNode.subLink = nextSubLink)) {
    // if the dependency's subscriber list becomes empty, clean up all dependencies of the dependency.
    let toRemove = depNode.depLink;
    if (toRemove) {
      // Clean up all dependencies of the dependency node
      // This ensures that when a node loses all subscribers, its dependencies are also cleaned up
      while (toRemove) {
        toRemove = unlinkReactiveNode(toRemove, depNode);
      }
      // mark the dependency as "dirty", need to be re-evaluated.
      depNode.flag |= ReactiveFlags.DIRTY; // ReactiveFlags.DIRTY
    }
  }

  // return the next dependency link, for iteration deletion.
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
      // if the link is found in the dependency list, it is valid.
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
 *
 * @param linkNode - The starting link node for propagation
 */
export function propagate(linkNode: Link) {
  // iteration stack
  const stack = [linkNode];
  let stackIndex = 0;

  while (stackIndex < stack.length) {
    const currentLinkNode = stack[stackIndex++];

    while (currentLinkNode) {
      const subNode = currentLinkNode.subNode;
      let flag = subNode.flag;

      // 如果子节点是正在观察或可变节点
      if (flag & (ReactiveFlags.WATCHING | ReactiveFlags.MUTABLE)) {
        // ReactiveFlags.WATCHING | ReactiveFlags.MUTABLE
        // 如果子节点是正在递归检查或递归节点
        const hasRecursedFlags = flag & (ReactiveFlags.RECURSED_CHECK | ReactiveFlags.RECURSED); // ReactiveFlags.RECURSED_CHECK | ReactiveFlags.RECURSED
        // 如果子节点是脏或挂起节点
        const hasDirtyFlags = flag & (ReactiveFlags.DIRTY | ReactiveFlags.PENDING); // ReactiveFlags.DIRTY | ReactiveFlags.PENDING

        // 如果子节点不是正在递归检查或递归节点，且不是脏或挂起节点，则标记为挂起
        if (!hasRecursedFlags && !hasDirtyFlags) {
          subNode.flag = flag | ReactiveFlags.PENDING; // ReactiveFlags.PENDING
          // 如果子节点不是正在递归检查或递归节点，则标记为无
        } else if (!hasRecursedFlags) {
          subNode.flag = ReactiveFlags.NONE; // ReactiveFlags.NONE
          // 如果子节点不是正在递归检查或递归节点，则标记为挂起
        } else if (!(flag & ReactiveFlags.RECURSED_CHECK)) {
          // ReactiveFlags.RECURSED_CHECK
          subNode.flag = (flag & ~ReactiveFlags.RECURSED) | ReactiveFlags.PENDING; // (flag & ~ReactiveFlags.RECURSED) | ReactiveFlags.PENDING
          flag &= ReactiveFlags.MUTABLE; // ReactiveFlags.MUTABLE
          // 如果子节点不是正在递归检查或递归节点，且不是脏或挂起节点，且链接有效，则标记为递归和挂起
        } else if (!hasDirtyFlags && isValidLink(currentLinkNode, subNode)) {
          subNode.flag = flag | ReactiveFlags.RECURSED | ReactiveFlags.PENDING; // ReactiveFlags.RECURSED | ReactiveFlags.PENDING
          flag &= ReactiveFlags.MUTABLE; // ReactiveFlags.MUTABLE
        } else {
          subNode.flag = ReactiveFlags.NONE; // ReactiveFlags.NONE
        }

        // 批量处理watching effects，减少数组操作开销
        if (flag & ReactiveFlags.WATCHING) {
          // ReactiveFlags.WATCHING
          watchedEffects[watchedEffectsLength++] = subNode as unknown as EffectFn;
        }

        // 当订阅者是可变时，需要递归深入
        if (flag & ReactiveFlags.MUTABLE) {
          // ReactiveFlags.MUTABLE
          const subSubs = subNode.subLink;
          if (subSubs) {
            stack[stack.length] = subSubs;
          }
        }
      }
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
    // 返回之前的 activeSub。
    return activeSub;
  } finally {
    // 设置新的 activeSub。
    activeSub = sub;
  }
}

/**
 * Flushes all watched effects in the current batch.
 * This executes all pending effects that were queued during propagation.
 */
export function flushWatchedEffects(): void {
  // 遍历并执行所有待处理的副作用。
  while (watchedEffectsIndex < watchedEffectsLength) {
    const effect = watchedEffects[watchedEffectsIndex]!;
    watchedEffects[watchedEffectsIndex++] = undefined; // 清理数组项
    if (effect.notify) {
      effect.notify(); // 通知副作用执行
    } else {
      effect(); // 直接执行
    }
  }
  // 重置索引和长度。
  watchedEffectsIndex = 0;
  watchedEffectsLength = 0;
}

/**
 * Checks if a subscriber's dependencies are "dirty" (need updating).
 * This function recursively traverses the dependency chain to determine update status.
 *
 * @param link - The starting link for dependency checking
 * @param sub - The subscriber node to check
 * @returns True if any dependency is dirty
 */
export function checkDirty(link: Link, sub: ReactiveNode): boolean {
  /**
   * 递归检查以 link 为起点的整条依赖链。
   * 遇到需要深入下一层时，递归调用自身。
   */
  function checkDown(link: Link, sub: ReactiveNode): boolean {
    let curLink: Link | undefined = link; // 当前正在检查的 Link
    while (curLink) {
      const dep = curLink.depNode;
      const depFlags = dep.flag;

      /* -------- 1. 先看自己或依赖是否已脏 -------- */
      if (sub.flag & ReactiveFlags.DIRTY) {
        // ReactiveFlags.DIRTY
        return true;
      }
      // 当依赖是可变或脏时，需要更新
      if (
        (depFlags & (ReactiveFlags.MUTABLE | ReactiveFlags.DIRTY)) ===
        (ReactiveFlags.MUTABLE | ReactiveFlags.DIRTY) // ReactiveFlags.MUTABLE | ReactiveFlags.DIRTY
      ) {
        // 依赖本身脏了，需要更新
        // Check if the dependency has a shouldUpdate method (computed)
        if ('shouldUpdate' in dep && typeof (dep as any).shouldUpdate === 'function') {
          if ((dep as any).shouldUpdate()) {
            const subs = dep.subLink!;
            if (subs.nextSubLink) {
              shallowPropagate(subs);
            }
            return true;
          }
        } else {
          // For non-computed dependencies, assume they need updating
          const subs = dep.subLink!;
          if (subs.nextSubLink) {
            shallowPropagate(subs);
          }
          return true;
        }
      }

      // 当依赖是可变或挂起时，需要递归深入
      if (
        (depFlags & (ReactiveFlags.MUTABLE | ReactiveFlags.PENDING)) ===
        (ReactiveFlags.MUTABLE | ReactiveFlags.PENDING) // ReactiveFlags.MUTABLE | ReactiveFlags.PENDING
      ) {
        // 深入检查依赖的依赖
        const innerDirty = checkDown(dep.depLink!, dep);

        // 返回后根据结果做与原逻辑一致的处理
        if (innerDirty) {
          if ('shouldUpdate' in dep && typeof (dep as any).shouldUpdate === 'function') {
            if ((dep as any).shouldUpdate()) {
              const subs = dep.subLink!;
              if (subs.nextSubLink) {
                shallowPropagate(subs);
              }
              // 继续用 dep 的上一层 sub（即外层 sub）继续遍历
              // 这里无需额外处理，因为外层 while 会继续检查 curLink.nextDep
              return true;
            }
          } else {
            // For non-computed dependencies, assume they need updating
            const subs = dep.subLink!;
            if (subs.nextSubLink) {
              shallowPropagate(subs);
            }
            return true;
          }
        } else {
          dep.flag &= ~ReactiveFlags.PENDING; // 清除待定 ReactiveFlags.PENDING
        }
      }

      /* -------- 3. 继续下一个兄弟依赖 -------- */
      curLink = curLink.nextDepLink;
    }

    // 整条链检查完都没发现脏
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

  const sub = link.subNode;
  const subFlags = sub.flag;

  // 当订阅者是挂起或脏时，标记为脏
  if ((subFlags & (ReactiveFlags.PENDING | ReactiveFlags.DIRTY)) === ReactiveFlags.PENDING) {
    // ReactiveFlags.PENDING | ReactiveFlags.DIRTY
    sub.flag = subFlags | ReactiveFlags.DIRTY; // ReactiveFlags.DIRTY
  }

  // 递归处理下一个订阅者，取代原来的 do/while
  shallowPropagate(link.nextSubLink);
}

/**
 * Batch function that combines multiple operations into a single update.
 * This optimizes performance by deferring effect execution until the batch completes.
 *
 * @param fn - Function containing reactive updates to batch
 */
export function batch(fn: () => void) {
  // 增加批处理深度。
  ++batchDepth;
  try {
    // 执行函数。
    fn();
  } catch (error_) {
    // 捕获并打印错误。
    console.error(`Error during batch: ${error_}`);
  } finally {
    // 当最外层批处理结束时，刷新所有待处理的副作用。
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
  // 如果深度为0且有待处理的副作用，则刷新它们。
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
  // 重置订阅者的依赖尾指针
  sub.depLinkTail = undefined;
  // 设置标志为递归检查状态，并清除脏和挂起状态
  sub.flag =
    (sub.flag & ~(ReactiveFlags.RECURSED | ReactiveFlags.DIRTY | ReactiveFlags.PENDING)) |
    ReactiveFlags.RECURSED_CHECK; // (sub.flag & ~(ReactiveFlags.RECURSED | ReactiveFlags.DIRTY | ReactiveFlags.PENDING)) | ReactiveFlags.RECURSED_CHECK
  // 设置当前订阅者并返回上一个
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
  // 恢复上一个activeSub
  activeSub = prevSub;

  // 清理掉在本次追踪中不再需要的依赖
  const depsTail = sub.depLinkTail;
  let toRemove = depsTail !== undefined ? depsTail.nextDepLink : sub.depLink;
  while (toRemove !== undefined) {
    toRemove = unlinkReactiveNode(toRemove, sub);
  }
  // 清除递归检查标志
  sub.flag &= ~ReactiveFlags.RECURSED_CHECK; // ReactiveFlags.RECURSED_CHECK
}
