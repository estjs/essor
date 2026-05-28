import { type Signal, effect, isSignal } from '@estjs/signals';
import { isFunction, warn } from '@estjs/shared';
import {
  type Scope,
  createScope,
  disposeScope,
  getActiveScope,
  onCleanup,
  runWithScope,
} from '../scope';
import { onMount } from '../lifecycle';
import { TRANSITION_GROUP_COMPONENT } from '../constants';
import { isComponent } from '../component';
import {
  type TransitionProps,
  addClass,
  forceReflow,
  nextFrame,
  removeClass,
  resolveDuration,
  resolveTransitionClasses,
  whenTransitionEnds,
} from './Transition';
import type { Component } from '../component';

/**
 * Props for `<TransitionGroup>`.
 *
 * Inherits every enter/leave knob from {@link TransitionProps} (name, css,
 * type, duration, JS hooks, custom class overrides) and adds:
 *
 * - `each` / `key` — same shape as `<For>`; required for stable identity.
 * - `tag` — wrapper element. Required so we have a layout root to measure
 *   positions against and to anchor leaving items absolutely. Defaults to
 *   `'div'`.
 * - `moveClass` — class applied to elements during the FLIP move animation.
 *   Defaults to `${name}-move`.
 * - `children` — render function per item. May return an Element or a
 *   Component instance (the latter is mounted, its first rendered Element
 *   participates in the animations).
 *
 * `appear` is intentionally NOT supported: items mounted on the initial
 * render do NOT animate. The appear-related props from {@link TransitionProps}
 * are therefore omitted from this type. If you need first-frame animation,
 * mount the group with an empty list and push items after mount.
 */
type GroupBaseProps = Omit<
  TransitionProps,
  'children' | 'appear' | 'appearFromClass' | 'appearActiveClass' | 'appearToClass'
>;

export interface TransitionGroupProps<T = unknown> extends GroupBaseProps {
  each: T[] | Signal<T[]> | (() => T[]);
  key: (item: T, index: number) => unknown;
  tag?: string;
  moveClass?: string;
  children: (item: T, index: number) => unknown;
}

type CancelCb = (cancelled?: boolean) => void;

interface Entry {
  key: unknown;
  item: unknown;
  /** The DOM element that participates in class manipulation + FLIP. */
  el: HTMLElement;
  /** Set when the row's render output was a Component instance. */
  comp: Component | null;
  /** Per-row scope so effects inside `children()` clean up on removal. */
  scope: Scope;
  /** Lifecycle state. */
  state: 'entering' | 'present' | 'leaving';
  /** Snapshot of bounding rect taken BEFORE the reconcile DOM mutation. */
  prevRect?: DOMRect;
  /** Cancellation hooks for in-flight enter/leave animations. */
  cancelEnter?: CancelCb;
  cancelLeave?: CancelCb;
  /**
   * Saved inline styles that we override during leave (`position:absolute`
   * + locked geometry). Restored if a leave is cancelled mid-flight.
   */
  savedStyles?: SavedStyles;
}

interface SavedStyles {
  position: string;
  top: string;
  left: string;
  width: string;
  height: string;
}

/**
 * Pull a single root Element out of whatever `children(item, index)` returned.
 *
 * Component instances are mounted into the wrapper so they observe normal
 * scope/lifecycle, then their first rendered Element is returned. Arrays
 * (the babel-emitted shape for a single child) are unwrapped recursively.
 */
function resolveItemElement(
  raw: unknown,
  parent: Element,
): { el: HTMLElement | null; comp: Component | null } {
  if (raw == null || raw === false) return { el: null, comp: null };
  if (Array.isArray(raw) && raw.length === 1) {
    return resolveItemElement(raw[0], parent);
  }
  if (isFunction(raw)) {
    return resolveItemElement((raw as () => unknown)(), parent);
  }
  if (raw instanceof HTMLElement) {
    return { el: raw, comp: null };
  }
  if (isComponent(raw)) {
    const comp = raw as Component;
    if (comp.scope == null) {
      // Mount into the wrapper directly. The Component lays itself out as a
      // normal child; we just snag the first rendered HTMLElement for FLIP.
      comp.mount(parent);
    }
    if (__DEV__ && comp.renderedNodes.length > 1) {
      warn(
        '[TransitionGroup] child component rendered multiple root nodes; ' +
          'only the first participates in enter/leave/move animations.',
      );
    }
    const first = comp.firstChild;
    if (first instanceof HTMLElement) return { el: first, comp };
    return { el: null, comp };
  }
  if (__DEV__) {
    warn(
      '[TransitionGroup] child render returned a non-element value; ' +
        'animations require Element or Component roots.',
    );
  }
  return { el: null, comp: null };
}

function saveStyles(el: HTMLElement): SavedStyles {
  return {
    position: el.style.position,
    top: el.style.top,
    left: el.style.left,
    width: el.style.width,
    height: el.style.height,
  };
}

function restoreStyles(el: HTMLElement, s: SavedStyles): void {
  el.style.position = s.position;
  el.style.top = s.top;
  el.style.left = s.left;
  el.style.width = s.width;
  el.style.height = s.height;
}

/**
 * Animated keyed list with three coordinated animations:
 *
 *   - **enter** — new items fade/slide in using `${name}-enter-*` classes
 *   - **leave** — removed items animate out (positioned absolutely so the
 *     remaining items can reflow under FLIP), then are detached
 *   - **move** — items that stayed but changed position run FLIP: snapshot
 *     `getBoundingClientRect()` before reconcile, compute delta after,
 *     invert via `transform`, then transition to identity under `moveClass`
 *
 * Each row owns its own scope (mirroring `<For>`), so signals/effects
 * created inside `children()` are torn down when the row leaves.
 *
 * @example
 * ```tsx
 * <TransitionGroup name="list" each={items} key={(it) => it.id} tag="ul">
 *   {(item) => <li>{item.label}</li>}
 * </TransitionGroup>
 * ```
 */
export function TransitionGroup<T>(props: TransitionGroupProps<T>): Element {
  const tag = props.tag ?? 'div';
  const wrapper = document.createElement(tag);
  // `resolveTransitionClasses` only reads class-prop / name fields; cast to
  // bridge the structural mismatch on `children` (which it ignores anyway).
  const classes = resolveTransitionClasses(props as unknown as TransitionProps);
  const useCss = props.css !== false;
  const moveClass = props.moveClass ?? `${props.name ?? 'v'}-move`;

  const keyFn = props.key;
  // Babel wraps a single arrow child in a 1-element array — `{(item) => …}`
  // compiles to `children: [(item) => …]`. Unwrap so the rest of this
  // component only sees the function.
  const rawChildren = props.children as unknown;
  const childrenFn: TransitionGroupProps<T>['children'] =
    Array.isArray(rawChildren) && rawChildren.length === 1 && isFunction(rawChildren[0])
      ? (rawChildren[0] as TransitionGroupProps<T>['children'])
      : (props.children as TransitionGroupProps<T>['children']);
  if (!isFunction(childrenFn) || !isFunction(keyFn)) {
    throw new TypeError(
      '<TransitionGroup> requires `children: (item, index) => Node` and `key: (item, index) => unknown`',
    );
  }

  const getList = (): T[] => {
    const input = props.each;
    if (isSignal(input)) return (input as Signal<T[]>).value ?? [];
    if (isFunction(input)) return (input as () => T[])() ?? [];
    return (input as T[]) ?? [];
  };

  let entries: Entry[] = [];
  let mounted = false;

  // -----------------------------------------------------------------------
  // Per-item lifecycle helpers
  // -----------------------------------------------------------------------

  /** Render one row inside a fresh scope and return its initial Entry. */
  const renderEntry = (item: T, index: number): Entry | null => {
    const parentScope = getActiveScope();
    const scope = createScope(parentScope);
    let raw: unknown;
    runWithScope(scope, () => {
      raw = childrenFn(item, index);
    });
    const { el, comp } = resolveItemElement(raw, wrapper);
    if (!el) {
      disposeScope(scope);
      return null;
    }
    return {
      key: keyFn(item, index),
      item,
      el,
      comp,
      scope,
      state: 'entering',
    };
  };

  /**
   * Detach a row's DOM nodes from the wrapper. For Component-backed rows we
   * remove every rendered root, not just `entry.el` — multi-root Components
   * would otherwise leak their trailing siblings into the wrapper indefinitely
   * (FLIP only animates the first root, but cleanup must reclaim all of them).
   */
  const detachEntryDom = (entry: Entry): void => {
    if (entry.comp) {
      for (const node of entry.comp.renderedNodes) {
        if (node.parentNode === wrapper) wrapper.removeChild(node);
      }
      return;
    }
    if (entry.el.parentNode === wrapper) wrapper.removeChild(entry.el);
  };

  const disposeEntry = (entry: Entry): void => {
    entry.cancelEnter?.(true);
    entry.cancelLeave?.(true);
    if (entry.comp) entry.comp.destroy();
    detachEntryDom(entry);
    disposeScope(entry.scope);
  };

  const runEnter = (entry: Entry): void => {
    const el = entry.el;
    // If the same element was in the middle of a leave, cancel it first so
    // saved styles are restored and the leave classes are scrubbed.
    entry.cancelLeave?.(true);

    if (!useCss) {
      entry.state = 'present';
      props.onAfterEnter?.(el);
      return;
    }

    props.onBeforeEnter?.(el);
    addClass(el, classes.enterFrom);
    addClass(el, classes.enterActive);

    let called = false;
    const done: CancelCb = (cancelled) => {
      if (called) return;
      called = true;
      entry.cancelEnter = undefined;
      removeClass(el, classes.enterFrom);
      removeClass(el, classes.enterActive);
      removeClass(el, classes.enterTo);
      if (cancelled) {
        props.onEnterCancelled?.(el);
      } else {
        entry.state = 'present';
        props.onAfterEnter?.(el);
      }
    };
    entry.cancelEnter = done;
    entry.state = 'entering';

    nextFrame(() => {
      if (called) return;
      removeClass(el, classes.enterFrom);
      addClass(el, classes.enterTo);
      if (props.onEnter) {
        props.onEnter(el, () => done(false));
      } else {
        const explicit = resolveDuration(props.duration, 'enter');
        whenTransitionEnds(el, props.type, explicit, () => done(false));
      }
    });
  };

  const runLeave = (entry: Entry, prevRect: DOMRect): void => {
    const el = entry.el;
    // Cancel any pending enter on the same element so leave-from/leave-active
    // actually take effect.
    if (entry.cancelEnter) {
      entry.cancelEnter(true);
      forceReflow(el);
    }
    entry.state = 'leaving';

    // Pin the leaving element at its previous slot so its siblings can reflow
    // freely while it animates out.
    entry.savedStyles = saveStyles(el);
    const parentRect = wrapper.getBoundingClientRect();
    el.style.position = 'absolute';
    el.style.top = `${prevRect.top - parentRect.top}px`;
    el.style.left = `${prevRect.left - parentRect.left}px`;
    el.style.width = `${prevRect.width}px`;
    el.style.height = `${prevRect.height}px`;

    if (!useCss) {
      // No-animation contract: tear down immediately.
      if (entry.savedStyles) restoreStyles(el, entry.savedStyles);
      detachEntryDom(entry);
      disposeScope(entry.scope);
      if (entry.comp) entry.comp.destroy();
      props.onAfterLeave?.(el);
      return;
    }

    props.onBeforeLeave?.(el);
    addClass(el, classes.leaveFrom);
    addClass(el, classes.leaveActive);

    let called = false;
    const done: CancelCb = (cancelled) => {
      if (called) return;
      called = true;
      entry.cancelLeave = undefined;
      removeClass(el, classes.leaveFrom);
      removeClass(el, classes.leaveActive);
      removeClass(el, classes.leaveTo);

      if (cancelled) {
        // Cancelled mid-leave (likely because the same key was re-added).
        if (entry.savedStyles) restoreStyles(el, entry.savedStyles);
        entry.savedStyles = undefined;
        props.onLeaveCancelled?.(el);
        return;
      }

      if (entry.savedStyles) restoreStyles(el, entry.savedStyles);
      entry.savedStyles = undefined;
      detachEntryDom(entry);
      disposeScope(entry.scope);
      if (entry.comp) entry.comp.destroy();
      props.onAfterLeave?.(el);
    };
    entry.cancelLeave = done;

    nextFrame(() => {
      if (called) return;
      removeClass(el, classes.leaveFrom);
      addClass(el, classes.leaveTo);
      if (props.onLeave) {
        props.onLeave(el, () => done(false));
      } else {
        const explicit = resolveDuration(props.duration, 'leave');
        whenTransitionEnds(el, props.type, explicit, () => done(false));
      }
    });
  };

  /**
   * FLIP move. Called for items that stayed but may have changed position.
   * Caller passes the rect snapshotted BEFORE the DOM mutation; we measure
   * the current rect and animate the delta away.
   *
   * NOTE: There is no separate `move` direction on `duration`. To keep
   *  move animations honor the **enter** duration when `duration` is set.
   */
  const runMove = (entry: Entry, prevRect: DOMRect): void => {
    if (!useCss || entry.state !== 'present') return;
    const el = entry.el;
    const newRect = el.getBoundingClientRect();
    const dx = prevRect.left - newRect.left;
    const dy = prevRect.top - newRect.top;
    if (!dx && !dy) return;

    // Invert: jump back to old position with no transition, then play.
    const savedTransform = el.style.transform;
    const savedTransition = el.style.transitionDuration;
    el.style.transform = `translate(${dx}px, ${dy}px)`;
    el.style.transitionDuration = '0s';
    addClass(el, moveClass);
    forceReflow(el);
    // Play: restore transition, clear transform → browser animates to identity.
    el.style.transform = savedTransform;
    el.style.transitionDuration = savedTransition;

    const explicit = resolveDuration(props.duration, 'enter');
    whenTransitionEnds(el, props.type, explicit, () => {
      removeClass(el, moveClass);
    });
  };

  // -----------------------------------------------------------------------
  // Reconcile
  // -----------------------------------------------------------------------

  /**
   * Snapshot rects for entries that are currently laid out — anything
   * `entering` or `present`. Skipped for `leaving` because their geometry is
   * already pinned via inline styles.
   */
  const snapshotPositions = (): void => {
    for (const entry of entries) {
      if (entry.state === 'leaving') continue;
      entry.prevRect = entry.el.getBoundingClientRect();
    }
  };

  /**
   * Diff `entries` against the new item list and produce the next entry
   * array. Side effects:
   *   - Reorders DOM children to match `newItems` order.
   *   - Creates fresh entries for new keys (each is queued for enter).
   *   - Returns entries that disappeared so the caller can drive leave.
   *
   * One map serves both present and leaving entries. A re-added key pulls the
   * old entry out of the map regardless of its state — `runEnter` (called by
   * the caller for non-`present` entries) handles the leave-cancel.
   */
  const reconcile = (newItems: T[]): { next: Entry[]; leaving: Entry[] } => {
    const byKey = new Map<unknown, Entry>();
    for (const entry of entries) byKey.set(entry.key, entry);

    const next: Entry[] = [];
    for (const [i, item] of newItems.entries()) {
      const key = keyFn(item, i);
      const reused = byKey.get(key);
      if (reused) {
        byKey.delete(key);
        reused.item = item;
        next.push(reused);
      } else {
        const fresh = renderEntry(item, i);
        if (fresh) next.push(fresh);
      }
    }

    // Whatever stayed in `byKey` no longer appears in newItems. Skip entries
    // that were already leaving — they're mid-animation; don't restart them.
    const leaving: Entry[] = [];
    for (const entry of byKey.values()) {
      if (entry.state !== 'leaving') leaving.push(entry);
    }

    // Apply DOM ordering — walk `next` from the tail so each `insertBefore`
    // uses the already-correct following sibling as the anchor.
    let anchor: Node | null = null;
    for (let i = next.length - 1; i >= 0; i--) {
      const el = next[i].el;
      if (el.parentNode !== wrapper || el.nextSibling !== anchor) {
        wrapper.insertBefore(el, anchor);
      }
      anchor = el;
    }

    return { next, leaving };
  };

  /**
   * The full update pass: snapshot → reconcile → apply enter/leave/move.
   * Initial mount short-circuits all three (no snapshot, no leave, just
   * insert + skip enter to match the convention that first-frame items
   * appear without animation).
   */
  const update = (newItems: T[], isInitial: boolean): void => {
    if (isInitial) {
      // Fresh mount — no animation by default.
      const initial: Entry[] = [];
      for (const [i, item] of newItems.entries()) {
        const entry = renderEntry(item, i);
        if (!entry) continue;
        if (entry.el.parentNode !== wrapper) wrapper.appendChild(entry.el);
        entry.state = 'present';
        initial.push(entry);
      }
      entries = initial;
      return;
    }

    snapshotPositions();
    const { next, leaving } = reconcile(newItems);

    // Run enter on freshly-created or resurrected entries.
    for (const entry of next) {
      if (entry.state !== 'present') runEnter(entry);
    }

    // Run leave on departing entries. By construction every entry coming
    // out of `reconcile` as `leaving` had a non-`leaving` state during the
    // immediately preceding `snapshotPositions`, so its `prevRect` is always
    // set. We assert that invariant here rather than masking a future bug
    // behind a silent fallback.
    for (const entry of leaving) {
      const rect = entry.prevRect;
      if (!rect) {
        if (__DEV__) {
          warn('[TransitionGroup] leaving entry without prevRect — skipping leave animation');
        }
        continue;
      }
      runLeave(entry, rect);
    }

    // FLIP move for entries that stayed.
    for (const entry of next) {
      if (entry.state !== 'present' || !entry.prevRect) continue;
      runMove(entry, entry.prevRect);
      entry.prevRect = undefined;
    }

    // Stash leaving entries alongside the next set so cleanup can find them.
    entries = next.concat(leaving);
  };

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  let pendingItems: T[] | null = null;

  const effectRunner = effect(() => {
    const list = getList();
    if (!mounted) {
      pendingItems = list;
      return;
    }
    // Reactive update — run synchronously inside the effect. The render
    // function below is called inside a fresh per-row scope so any signals
    // it reads do NOT register against the outer TransitionGroup effect.
    update(list, false);
  });

  onMount(() => {
    mounted = true;
    if (pendingItems) {
      update(pendingItems, true);
      pendingItems = null;
    }
  });

  onCleanup(() => {
    effectRunner.stop();
    for (const entry of entries) disposeEntry(entry);
    entries = [];
    if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
  });

  return wrapper;
}

(TransitionGroup as unknown as Record<symbol, true>)[TRANSITION_GROUP_COMPONENT] = true;

/**
 * Type guard for the TransitionGroup component reference.
 */
export function isTransitionGroup(node: unknown): boolean {
  return !!node && !!(node as Record<symbol, unknown>)[TRANSITION_GROUP_COMPONENT];
}
