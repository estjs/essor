// forked from https://github.com/stackblitz/alien-signals/blob/v3.0.0/src/system.ts
import { error, isArray, isFunction } from '@estjs/shared';
import { ARRAY_ITERATE_KEY, ITERATE_KEY, ReactiveFlags } from './constants';

export interface Link {
  version: number;
  depNode: ReactiveNode;
  subNode: ReactiveNode;
  prevSubLink?: Link;
  nextSubLink?: Link;
  prevDepLink?: Link;
  nextDepLink?: Link;
}

export type DebuggerEventType = 'get' | 'set' | 'add' | 'delete' | 'clear' | 'iterate';

export interface DebuggerEvent {
  effect: ReactiveNode;
  target: object;
  type: DebuggerEventType | string;
  key?: any;
  newValue?: any;
}

export interface ReactiveNode {
  depLink?: Link;
  subLink?: Link;
  depLinkTail?: Link;
  subLinkTail?: Link;
  flag: ReactiveFlags;
  onTrack?: (event: DebuggerEvent) => void;
  onTrigger?: (event: DebuggerEvent) => void;
  isDep?: boolean;
  _triggerVersion?: number;
  /**
   * Subscriber-side round stamp: the link version assigned to this node's
   * current tracking round by {@link startTracking}. Stays constant for the
   * whole round (unlike the global `currentLinkVersion`, which nested rounds
   * keep bumping), so it identifies "our round" inside {@link linkReactiveNode}.
   */
  _trackVersion?: number;
  /**
   * Dep-side round stamp: the `_trackVersion` of the round that most recently
   * linked this node. Used by {@link linkReactiveNode} to skip the duplicate
   * backscan on first tracking.
   */
  _linkedVersion?: number;
}

export interface Effect extends ReactiveNode {
  notify(): void;
  _active?: boolean;
}

let currentLinkVersion = 0;
export let activeSub: ReactiveNode | undefined;
let isUntracking = false;

class Dep implements ReactiveNode {
  readonly isDep = true;
  depLink?: Link;
  depLinkTail?: Link;
  subLinkTail?: Link;
  flag: ReactiveFlags = ReactiveFlags.NONE;

  private _subLink?: Link;

  constructor(
    private readonly map: Map<string | symbol, Dep>,
    private readonly key: string | symbol,
  ) {}

  get subLink(): Link | undefined {
    return this._subLink;
  }

  set subLink(value: Link | undefined) {
    this._subLink = value;
    if (value === undefined) {
      this.map.delete(this.key);
    }
  }
}

export function enqueueEffect(effect: Effect): void {
  effect.notify();
}

export function clearPropagationFlags(node: ReactiveNode): void {
  node.flag &= ~(ReactiveFlags.PENDING | ReactiveFlags.RECURSED | ReactiveFlags.RECURSED_CHECK);
}

export function getIsUntracking(): boolean {
  return isUntracking;
}

export function linkReactiveNode(depNode: ReactiveNode, subNode: ReactiveNode): Link | undefined {
  if (isUntracking) {
    return undefined;
  }

  const prevDep = subNode.depLinkTail;
  if (prevDep && prevDep.depNode === depNode) {
    // Consecutive duplicate read. The tail was only advanced by a stamped
    // link/reuse of this same dep earlier in this round, so the dep-side
    // round stamp is already ours — no restamp needed.
    return prevDep;
  }

  // The subscriber's round version, fixed for the whole tracking round by
  // startTracking(). Unlike the raw `currentLinkVersion` — which nested
  // rounds keep bumping — this reliably identifies "our round" in the stamps
  // below. (Fallback for subs linked outside startTracking; none exist today.)
  const roundVersion = subNode._trackVersion ?? currentLinkVersion;

  const nextDep = prevDep ? prevDep.nextDepLink : subNode.depLink;
  if (nextDep && nextDep.depNode === depNode) {
    nextDep.version = roundVersion;
    subNode.depLinkTail = nextDep;
    depNode._linkedVersion = roundVersion;
    return nextDep;
  }

  // Non-consecutive duplicate read of `depNode` within this same tracking
  // round (e.g. `a, b, a`, or `a, c, a` where evaluating computed `c` re-read
  // `a`). Skipped entirely when the dep has no subscribers (we cannot
  // already be linked).
  const prevSub = depNode.subLinkTail;
  if (prevSub !== undefined) {
    // Dep-side round stamp (`_linkedVersion`, written on every successful
    // link/reuse below). Round versions are globally monotonic, so:
    //
    //   _linkedVersion <  roundVersion → nobody (us or a nested round) linked
    //                                    this dep since our round began — we
    //                                    provably hold no link to it this
    //                                    round, so create directly, NO scan.
    //   _linkedVersion === roundVersion → round ids are unique per
    //                                    startTracking(), so WE linked it this
    //                                    round: a true duplicate. Reuse via
    //                                    the tail fast path or the backscan
    //                                    (guaranteed hit).
    //   _linkedVersion >  roundVersion → a nested round (e.g. a computed
    //                                    evaluated mid-run) touched this dep
    //                                    after our round began, clobbering the
    //                                    stamp — it can no longer prove we did
    //                                    NOT link earlier, so fall back to the
    //                                    backscan (may hit or miss).
    //
    // Complexity guarantee: an effect's first tracking over deps that already
    // have other (older-round) subscribers hits the `<` branch and is O(1) per
    // dep — O(n) for the whole round, matching alien-signals v3. The O(i)
    // backscan below survives only for deps re-touched by nested rounds
    // within the current round (the hijack case), where the stamp
    // cannot prove freshness.
    const linkedVersion = depNode._linkedVersion;
    if (linkedVersion === undefined || linkedVersion >= roundVersion) {
      // Fast path: the dep's subscriber tail is our own link, stamped this
      // round — reuse it.
      //
      // Do NOT rewind subNode.depLinkTail when reusing: endTracking() only
      // prunes links after the tail, so rewinding would orphan every dep
      // genuinely tracked between the duplicate link and the tail (e.g.
      // reading `a, b, a` would unlink `b`).
      if (prevSub.subNode === subNode && prevSub.version === roundVersion) {
        return prevSub;
      }

      // Slow path: the shared tail was hijacked by another subscriber (a
      // computed evaluated between the two reads appended its own link).
      // Positionally, `[subNode.depLink .. depLinkTail]` is exactly the
      // segment confirmed so far this round — scan it for the dep. Missing
      // this reuse would create a duplicate (dep, sub) link and corrupt
      // propagation.
      for (let scan = prevDep; scan !== undefined; scan = scan.prevDepLink) {
        if (scan.depNode === depNode) {
          scan.version = roundVersion;
          depNode._linkedVersion = roundVersion;
          return scan;
        }
      }
    }
  }

  const newLink: Link = {
    version: roundVersion,
    depNode,
    subNode,
    prevSubLink: prevSub,
    nextSubLink: undefined,
    prevDepLink: prevDep,
    nextDepLink: nextDep,
  };

  if (nextDep) {
    nextDep.prevDepLink = newLink;
  }
  if (prevDep) {
    prevDep.nextDepLink = newLink;
  } else {
    subNode.depLink = newLink;
  }

  if (prevSub) {
    prevSub.nextSubLink = newLink;
  } else {
    depNode.subLink = newLink;
  }

  depNode.subLinkTail = newLink;
  subNode.depLinkTail = newLink;
  depNode._linkedVersion = roundVersion;

  if (__DEV__ && subNode.onTrack && isFunction(subNode.onTrack)) {
    subNode.onTrack({
      effect: subNode,
      target: depNode,
      type: 'get',
      key: undefined,
    });
  }

  return newLink;
}

export function unlinkReactiveNode(
  linkNode: Link,
  subNode: ReactiveNode = linkNode.subNode,
): Link | undefined {
  const depNode = linkNode.depNode;

  const prevSub = linkNode.prevSubLink;
  const nextSub = linkNode.nextSubLink;
  const prevDep = linkNode.prevDepLink;
  const nextDep = linkNode.nextDepLink;

  if (nextDep) {
    nextDep.prevDepLink = prevDep;
  } else {
    subNode.depLinkTail = prevDep;
  }
  if (prevDep) {
    prevDep.nextDepLink = nextDep;
  } else {
    subNode.depLink = nextDep;
  }

  if (nextSub) {
    nextSub.prevSubLink = prevSub;
  } else {
    depNode.subLinkTail = prevSub;
  }
  if (prevSub) {
    prevSub.nextSubLink = nextSub;
  } else {
    depNode.subLink = nextSub;

    if (nextSub === undefined) {
      let toRemove = depNode.depLink;
      while (toRemove) {
        toRemove = unlinkReactiveNode(toRemove, depNode);
      }

      depNode.depLinkTail = undefined;

      if (!depNode.isDep) {
        depNode.flag |= ReactiveFlags.DIRTY;
      }

      if (__DEV__ && depNode.depLink) {
        error(
          '[Link] Cascading cleanup failed: depNode still has dependency links. ' +
            'This indicates a bug in the unlinking logic.',
        );
      }
    }
  }

  return nextDep;
}

interface CheckStackNode {
  link: Link;
  prev?: CheckStackNode;
}

export function checkDirty(link: Link, sub: ReactiveNode): boolean {
  let stack: CheckStackNode | undefined;
  let checkDepth = 0;
  let dirty = false;

  /* eslint-disable no-constant-condition */
  // eslint-disable-next-line no-restricted-syntax
  top: do {
    let currentDirty = false;

    if (sub.flag & ReactiveFlags.DIRTY) {
      currentDirty = true;
    } else {
      const dep = link.depNode;
      const depFlags = dep.flag;

      if (
        (depFlags & (ReactiveFlags.MUTABLE | ReactiveFlags.DIRTY)) ===
        (ReactiveFlags.MUTABLE | ReactiveFlags.DIRTY)
      ) {
        const subs = dep.subLink;
        if (subs && subs.nextSubLink) {
          shallowPropagate(subs);
        }
        currentDirty = true;
      } else if (
        (depFlags & (ReactiveFlags.MUTABLE | ReactiveFlags.PENDING)) ===
        (ReactiveFlags.MUTABLE | ReactiveFlags.PENDING)
      ) {
        if (dep.depLink) {
          stack = { link, prev: stack };
          link = dep.depLink;
          sub = dep;
          ++checkDepth;
          continue top;
        } else {
          dep.flag &= ~ReactiveFlags.PENDING;
        }
      } else if (depFlags & ReactiveFlags.PENDING) {
        dep.flag &= ~ReactiveFlags.PENDING;
      }
    }

    if (!currentDirty && link.nextDepLink !== undefined) {
      link = link.nextDepLink;
      continue top;
    }

    dirty = currentDirty;

    while (checkDepth--) {
      link = stack!.link;
      stack = stack!.prev;
      sub = link.subNode;
      const checkedDep = link.depNode;

      if (dirty) {
        checkedDep.flag = (checkedDep.flag & ~ReactiveFlags.PENDING) | ReactiveFlags.DIRTY;
      } else {
        checkedDep.flag &= ~ReactiveFlags.PENDING;
      }

      if (checkedDep.flag & ReactiveFlags.DIRTY) {
        dirty = true;
      }

      if (!dirty && link.nextDepLink !== undefined) {
        link = link.nextDepLink;
        continue top;
      }
    }

    if (dirty) {
      sub.flag = (sub.flag & ~ReactiveFlags.PENDING) | ReactiveFlags.DIRTY;
    } else {
      sub.flag &= ~ReactiveFlags.PENDING;
    }

    return dirty;
  } while (true);
  /* eslint-enable no-constant-condition */
}

export function shallowPropagate(link: Link | undefined): void {
  while (link) {
    const sub = link.subNode;
    const flags = sub.flag;

    if ((flags & (ReactiveFlags.PENDING | ReactiveFlags.DIRTY)) === ReactiveFlags.PENDING) {
      sub.flag = flags | ReactiveFlags.DIRTY;

      if (
        (flags & (ReactiveFlags.WATCHING | ReactiveFlags.RECURSED_CHECK)) ===
        ReactiveFlags.WATCHING
      ) {
        enqueueEffect(sub as Effect);
      }
    }

    link = link.nextSubLink;
  }
}

export function propagate(link: Link): void {
  let next: Link | undefined = link.nextSubLink;
  let stack: { value: Link | undefined; prev: typeof stack } | undefined;

  /* eslint-disable no-constant-condition */
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
      sub.flag = flags | ReactiveFlags.PENDING;
      if (watcherBit) {
        enqueueEffect(sub as Effect);
      }
    } else if (!(flags & (ReactiveFlags.RECURSED | ReactiveFlags.RECURSED_CHECK))) {
      flags = ReactiveFlags.NONE;
    } else if (!(flags & ReactiveFlags.RECURSED_CHECK)) {
      sub.flag = (flags & ~ReactiveFlags.RECURSED) | ReactiveFlags.PENDING;
    } else if (!(flags & (ReactiveFlags.DIRTY | ReactiveFlags.PENDING)) && isValidLink(link, sub)) {
      sub.flag = flags | (ReactiveFlags.RECURSED | ReactiveFlags.PENDING);
      if (watcherBit) {
        enqueueEffect(sub as Effect);
      }
      flags &= ReactiveFlags.MUTABLE;
    } else {
      flags = ReactiveFlags.NONE;
    }

    if (flags & ReactiveFlags.MUTABLE) {
      const subSubs = sub.subLink;
      if (subSubs !== undefined) {
        const nextSub = subSubs.nextSubLink;
        if (nextSub !== undefined) {
          stack = { value: next, prev: stack };
          next = nextSub;
        }
        link = subSubs;
        continue;
      }
    }

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
  /* eslint-enable no-constant-condition */
}

export function setActiveSub(sub?: ReactiveNode): ReactiveNode | undefined {
  const prev = activeSub;
  activeSub = sub;
  return prev;
}

export function startTracking(sub: ReactiveNode): ReactiveNode | undefined {
  currentLinkVersion++;
  // Freeze this round's version on the subscriber: nested tracking rounds
  // keep bumping the global counter, but `sub._trackVersion` stays constant,
  // so linkReactiveNode can always tell "our round" apart (see the dep-side
  // round stamps there). Round ids are unique — no two rounds share one.
  sub._trackVersion = currentLinkVersion;
  sub.depLinkTail = undefined;

  sub.flag =
    (sub.flag & ~(ReactiveFlags.RECURSED | ReactiveFlags.DIRTY | ReactiveFlags.PENDING)) |
    ReactiveFlags.RECURSED_CHECK;

  return setActiveSub(sub);
}

export function endTracking(sub: ReactiveNode, prevSub: ReactiveNode | undefined): void {
  activeSub = prevSub;

  const depsTail = sub.depLinkTail;
  let toRemove = depsTail ? depsTail.nextDepLink : sub.depLink;

  while (toRemove) {
    toRemove = unlinkReactiveNode(toRemove, sub);
  }

  sub.flag &= ~ReactiveFlags.RECURSED_CHECK;
}

export function untrack<T>(fn: () => T): T {
  const prevSub = setActiveSub(undefined);
  const prevUntracking = isUntracking;
  isUntracking = true;

  try {
    return fn();
  } finally {
    isUntracking = prevUntracking;
    setActiveSub(prevSub);
  }
}

export function isValidLink(checkLink: Link, sub: ReactiveNode): boolean {
  let link = sub.depLinkTail;

  while (link) {
    if (link === checkLink) {
      return true;
    }
    link = link.prevDepLink;
  }

  return false;
}

const targetMap = new WeakMap<object, Map<string | symbol, Dep>>();
let triggerVersion = 0;
const triggerEffects: ReactiveNode[] = [];
let triggerDepth = 0;

function startTriggerEffects(): ReactiveNode[] {
  const effects = triggerDepth === 0 ? triggerEffects : [];
  triggerDepth++;
  return effects;
}

function endTriggerEffects(effects: ReactiveNode[]): void {
  effects.length = 0;
  triggerDepth--;
}

/**
 * Walk a subLink chain and collect each subscriber exactly once into
 * `effects`, using the `_triggerVersion` stamp for same-round dedup.
 *
 * Shared by {@link collectTriggeredEffects}, {@link trigger} (extraDep
 * channel) and {@link triggerNode}.
 */
function collectSubscribers(
  link: Link | undefined,
  effects: ReactiveNode[],
  version: number,
): void {
  for (; link; link = link.nextSubLink) {
    const effect = link.subNode;
    if (effect._triggerVersion === version) {
      continue;
    }
    effect._triggerVersion = version;
    effects.push(effect);
  }
}

function collectTriggeredEffects(
  dep: Dep | undefined,
  effects: ReactiveNode[],
  version: number,
): void {
  if (!dep) {
    return;
  }

  collectSubscribers(dep.subLink, effects, version);
}

export function track(target: object, key: string | symbol): void {
  if (!activeSub || isUntracking) {
    return;
  }

  let depsMap = targetMap.get(target);
  if (!depsMap) {
    depsMap = new Map();
    targetMap.set(target, depsMap);
  }

  let dep = depsMap.get(key);
  if (!dep) {
    dep = new Dep(depsMap, key);
    depsMap.set(key, dep);
  }

  linkReactiveNode(dep, activeSub);
}

/**
 * Notify all subscribers tracked for `target`/`key`.
 *
 * @param extraDep - An extra dep node whose subscribers are merged into the
 * same trigger round. Passed by the reactive proxy's deleteProperty trap:
 * when an own key is deleted, its {@link ReactiveNode} (a ReactiveProperty)
 * is removed from the per-target map, and its subscribers must be dispatched
 * together with the targetMap DELETE subscribers, deduplicated per round.
 */
export function trigger(
  target: object,
  type: string,
  key?: string | symbol | (string | symbol)[],
  newValue?: unknown,
  extraDep?: ReactiveNode,
): void {
  const depsMap = targetMap.get(target);
  if (!depsMap && !extraDep) {
    return;
  }

  const effects = startTriggerEffects();
  const version = ++triggerVersion;

  try {
    // Collect the extra dep's subscribers into the SAME version round so an
    // effect subscribed via both channels (e.g. a ReactiveProperty node and a
    // targetMap Dep during a property delete) is dispatched exactly once.
    if (extraDep) {
      collectSubscribers(extraDep.subLink, effects, version);
    }

    if (depsMap) {
      if (key !== undefined) {
        if (isArray(key)) {
          for (const element of key) {
            collectTriggeredEffects(depsMap.get(element), effects, version);
          }
        } else {
          collectTriggeredEffects(depsMap.get(key), effects, version);
        }
      }

      if (type === 'ADD' || type === 'DELETE' || type === 'CLEAR') {
        const iterationKey = isArray(target) ? ARRAY_ITERATE_KEY : ITERATE_KEY;
        collectTriggeredEffects(depsMap.get(iterationKey), effects, version);
      }
    }

    dispatchCollectedEffects(effects, target, type, key, newValue);
  } finally {
    endTriggerEffects(effects);
  }
}

/**
 * Notify every collected effect from a stable snapshot.
 *
 * A synchronously flushing subscriber may throw from inside notify(); the
 * remaining subscribers must still be dispatched (SIG-23), so errors are
 * collected and the first one is rethrown after the loop completes.
 */
function dispatchCollectedEffects(
  effects: ReactiveNode[],
  target?: object,
  type?: string,
  key?: string | symbol | (string | symbol)[],
  newValue?: unknown,
): void {
  let firstError: unknown;
  let hasError = false;

  for (const effect of effects) {
    if (__DEV__ && target !== undefined && isFunction(effect.onTrigger)) {
      effect.onTrigger({
        effect,
        target,
        type: type!,
        key,
        newValue,
      });
    }

    try {
      if (effect.flag & ReactiveFlags.WATCHING) {
        (effect as Effect).notify?.();
      } else if (effect.flag & ReactiveFlags.MUTABLE) {
        effect.flag |= ReactiveFlags.DIRTY;
        if (effect.subLink) {
          propagate(effect.subLink);
        }
      }
    } catch (error_) {
      if (!hasError) {
        hasError = true;
        firstError = error_;
      } else if (__DEV__) {
        error('[Signals] additional error while notifying subscribers:', error_);
      }
    }
  }

  if (hasError) {
    throw firstError;
  }
}

// ── Direct node tracking (bypasses targetMap + Dep) ──────────────────────
//
// The standard track()/trigger() path goes:
//   track(target, key) → targetMap → Map → Dep → linkReactiveNode
//
// For per-property signals (ReactiveProperty), we can skip the targetMap
// lookup because the node itself IS the depNode.  This is the same pattern
// VitarX uses with trackSignal/triggerSignal on per-property signal objects.

/**
 * Track a ReactiveNode directly as a dependency of the active subscriber.
 *
 * Unlike {@link track}, this bypasses the targetMap and Dep layers —
 * the node itself already has depLink/subLink chains.
 *
 * Used by ReactiveProperty for per-property signal granularity.
 *
 * @param node - The node to track (acts as its own depNode).
 */
export function trackNode(node: ReactiveNode): void {
  if (!activeSub || isUntracking) return;
  linkReactiveNode(node, activeSub);
}

/**
 * Trigger all subscribers of a ReactiveNode.
 *
 * Unlike {@link trigger}, this bypasses the targetMap + Dep lookup — the node
 * itself already owns the subLink chain.
 *
 * It deliberately does NOT delegate to {@link propagate}. propagate marks
 * computed subscribers PENDING (lazy) and relies on checkDirty() later reading
 * the dep's DIRTY flag. But a ReactiveProperty reads its value live from the
 * target and clears no cache, so — exactly like a plain signal — a synchronous
 * effect reading the property first can clear coordination state before a
 * sibling computed is validated, producing a stale (glitchy) read. Instead we
 * force each computed subscriber DIRTY so it unconditionally recomputes. This
 * makes reactive-object derivations glitch-free even in the mixed
 * "direct-effect + computed on the same property" case.
 *
 * Iteration safety: effects run synchronously via notify(), and a subscriber's
 * re-run can unlink/relink nodes in this exact subLink chain mid-iteration
 * (endTracking → unlinkReactiveNode). Walking the live chain would risk skipping
 * or revisiting links, so we snapshot subscribers into an array first — with the
 * same _triggerVersion dedup used by collectTriggeredEffects — then notify from
 * the stable snapshot. The caller marks nothing; DIRTY is set on subscribers here.
 *
 * Used by ReactiveProperty for per-property signal granularity.
 *
 * @param node - The node whose subscribers should be notified.
 */
export function triggerNode(node: ReactiveNode): void {
  const link = node.subLink;
  if (!link) return;

  // Snapshot before notifying so synchronous effect re-runs can freely mutate
  // this subLink chain without corrupting the iteration.
  const effects = startTriggerEffects();
  const version = ++triggerVersion;

  try {
    collectSubscribers(link, effects, version);

    dispatchCollectedEffects(effects);
  } finally {
    endTriggerEffects(effects);
  }
}
