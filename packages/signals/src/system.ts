// forked from https://github.com/stackblitz/alien-signals/blob/v3.0.0/src/system.ts
import { error, isFunction } from '@estjs/shared';
import { ARRAY_ITERATE_KEY, ITERATE_KEY, ReactiveFlags, SignalFlags } from './constants';

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
  effect?.notify?.();
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
    return prevDep;
  }

  const nextDep = prevDep ? prevDep.nextDepLink : subNode.depLink;
  if (nextDep && nextDep.depNode === depNode) {
    nextDep.version = currentLinkVersion;
    subNode.depLinkTail = nextDep;
    return nextDep;
  }

  const prevSub = depNode.subLinkTail;
  if (prevSub && prevSub.version === currentLinkVersion && prevSub.subNode === subNode) {
    subNode.depLinkTail = prevSub;
    return prevSub;
  }

  const newLink: Link = {
    version: currentLinkVersion,
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
}

export function setActiveSub(sub?: ReactiveNode): ReactiveNode | undefined {
  const prev = activeSub;
  activeSub = sub;
  return prev;
}

export function startTracking(sub: ReactiveNode): ReactiveNode | undefined {
  currentLinkVersion++;
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

function collectTriggeredEffects(
  dep: Dep | undefined,
  effects: ReactiveNode[],
  version: number,
): void {
  if (!dep) {
    return;
  }

  for (let link = dep.subLink; link; link = link.nextSubLink) {
    const effect = link.subNode;
    if (effect._triggerVersion === version) {
      continue;
    }
    effect._triggerVersion = version;
    effects.push(effect);
  }
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

export function trigger(
  target: object,
  type: string,
  key?: string | symbol | (string | symbol)[],
  newValue?: unknown,
): void {
  const depsMap = targetMap.get(target);
  if (!depsMap) {
    return;
  }

  const effects: ReactiveNode[] = [];
  const version = ++triggerVersion;

  if (key !== undefined) {
    if (Array.isArray(key)) {
      for (const element of key) {
        collectTriggeredEffects(depsMap.get(element), effects, version);
      }
    } else {
      collectTriggeredEffects(depsMap.get(key), effects, version);
    }
  }

  if (type === 'ADD' || type === 'DELETE' || type === 'CLEAR') {
    const iterationKey = Array.isArray(target) ? ARRAY_ITERATE_KEY : ITERATE_KEY;
    collectTriggeredEffects(depsMap.get(iterationKey), effects, version);
  }

  for (const effect of effects) {
    if (__DEV__ && isFunction(effect.onTrigger)) {
      effect.onTrigger({
        effect,
        target,
        type,
        key,
        newValue,
      });
    }

    if (effect.flag & ReactiveFlags.WATCHING) {
      (effect as Effect).notify?.();
    } else if (effect.flag & ReactiveFlags.MUTABLE) {
      effect.flag |= ReactiveFlags.DIRTY;
      if (effect.subLink) {
        propagate(effect.subLink);
      }
    }
  }
}

export function getTargetDepSize(target: object, key: string | symbol): number {
  const rawTarget =
    (target as Record<string, unknown> | null)?.[SignalFlags.RAW] instanceof Object
      ? ((target as Record<string, unknown>)[SignalFlags.RAW] as object)
      : target;
  const dep = targetMap.get(rawTarget)?.get(key);
  if (!dep) {
    return 0;
  }

  let size = 0;
  for (let link = dep.subLink; link; link = link.nextSubLink) {
    size++;
  }
  return size;
}
