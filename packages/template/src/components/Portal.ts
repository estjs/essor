import { isFunction, isString, warn } from '@estjs/shared';
import { effect } from '@estjs/signals';
import { PORTAL_COMPONENT } from '../constants';
import { consumeTeleportAnchor, consumeTeleportBlock, isHydrating } from '../hydration';
import { onMount } from '../lifecycle';
import {
  type Scope,
  createScope,
  disposeScope,
  getActiveScope,
  onCleanup,
  runWithScope,
} from '../scope';
import { insert } from '../dom';
import type { AnyNode } from '../types';

export interface PortalProps {
  /** Children to render at the target location. */
  children?: AnyNode | AnyNode[];
  /**
   * Mount target — CSS selector string, `Element`, or reactive getter.
   * When the getter result changes, the Portal re-mounts at the new target.
   */
  target?: string | Element | (() => string | Element | null | undefined);
  /**
   * When truthy, children render inline at the call site instead of being teleported.
   * May be a static value or a reactive getter.
   */
  disabled?: boolean | (() => boolean);
}

/** Resolve `props.target` to an Element, handling string / Element / getter. */
function resolveTarget(props: PortalProps): Element | null {
  const raw = isFunction(props.target) ? (props.target as () => unknown)() : props.target;
  if (raw == null) return null;
  if (isString(raw)) return document.querySelector(raw as string);
  return raw as Element;
}

/** Evaluate `props.disabled`, supporting both static booleans and getters. */
function evalDisabled(props: PortalProps): boolean {
  return isFunction(props.disabled) ? !!(props.disabled as () => boolean)() : !!props.disabled;
}

/**
 * Portal — teleports children into a different DOM node.
 *
 * - `disabled=true` renders children inline at the call site.
 * - Otherwise children are teleported into `target`.
 * - Both `target` and `disabled` may be reactive; changes trigger re-mount.
 *
 * @returns A placeholder comment node that marks the call site.
 *
 * @example
 * ```tsx
 * <Portal target="#modal-root" disabled={isMobile}>
 *   <div>Modal content</div>
 * </Portal>
 * ```
 */
export function Portal(props: PortalProps): Comment {
  // Hydration: adopt SSR-emitted anchors + target block. Adoption only claims
  // the markers here — ownership (scope/effect/cleanup) is wired below through
  // the SAME path as CSR, so reactive `target`/`disabled` changes and unmount
  // teardown keep working for hydrated portals.
  const adopted = isHydrating() ? tryHydratePortal(props) : null;

  const placeholder = adopted?.anchor ?? document.createComment('portal');
  placeholder[PORTAL_COMPONENT] = true;

  const { children } = props;
  if (children == null) {
    // No client children: an adopted SSR block would otherwise leak its
    // markers/nodes in the target forever — discard it before bailing out.
    if (adopted?.block) {
      for (const node of adopted.block.nodes) {
        if (node.parentNode) (node as ChildNode).remove();
      }
      adopted.block.start.remove();
      adopted.block.end.remove();
    }
    return placeholder;
  }

  const parentScope = getActiveScope();
  let innerScope: Scope | null = null;
  let disposed = false;

  // Pending SSR block (start/end markers + inner nodes) claimed during
  // hydration; consumed by the first mount so insert()'s claim path adopts
  // the SSR children instead of re-creating them.
  let adoptedBlock = adopted?.block ?? null;
  const adoptedTarget = adopted?.target ?? null;

  /** Remove an SSR block's start/end comment markers. */
  const removeMarkers = (block: { start: Comment; end: Comment }): void => {
    block.start.remove();
    block.end.remove();
  };

  /** Remove an unconsumed adopted SSR block (nodes + markers). */
  const discardAdoptedBlock = (): void => {
    if (!adoptedBlock) return;
    for (const node of adoptedBlock.nodes) {
      if (node.parentNode) (node as ChildNode).remove();
    }
    removeMarkers(adoptedBlock);
    adoptedBlock = null;
  };

  /**
   * Mount children into the given parent, inside a fresh inner scope
   * that inherits from the parent scope. This allows `insert()` effects
   * to be properly disposed on teardown.
   */
  const mountAt = (parent: Node, before?: Node): void => {
    if (disposed || parentScope?.isDestroyed) return;
    innerScope = createScope(parentScope);
    runWithScope(innerScope, () => {
      insert(parent, () => children, before);
    });
  };

  /**
   * Tear down the inner scope, removing all mounted children and their
   * reactive effects.
   */
  const teardown = (): void => {
    if (innerScope) {
      disposeScope(innerScope);
      innerScope = null;
    }
  };

  /**
   * Evaluate disabled/target and (re-)mount, tearing down the previous
   * mount first. Accepts pre-evaluated values to avoid redundant getter
   * invocations when called from within the tracking effect.
   */
  const apply = (disabled: boolean, target: Element | null): void => {
    if (disposed) return;
    teardown();

    if (disabled) {
      discardAdoptedBlock();
      const parent = placeholder.parentNode;
      if (!parent) return;
      mountAt(parent, placeholder);
      return;
    }

    if (!target) {
      if (__DEV__) {
        warn(`[Portal] Target element not found: ${String(props.target)}`);
      }
      return;
    }

    // First mount of a hydrated portal: mount before the SSR end marker so
    // insert()'s hydration claim re-uses the SSR children in place, and tie
    // the markers' removal to the inner scope's lifetime.
    if (adoptedBlock) {
      if (target === adoptedTarget && isHydrating()) {
        const block = adoptedBlock;
        adoptedBlock = null;
        mountAt(target, block.end);
        if (innerScope) {
          runWithScope(innerScope, () => {
            onCleanup(() => removeMarkers(block));
          });
        } else {
          // mountAt bailed silently (disposed / parent scope destroyed):
          // nothing owns the adopted SSR children now, so remove them along
          // with the markers — otherwise they'd linger in the DOM forever.
          for (const node of block.nodes) {
            if (node.parentNode) (node as ChildNode).remove();
          }
          removeMarkers(block);
        }
        return;
      }
      // Target changed (or hydration already ended) — the SSR block cannot
      // be reused; remove it so content is not duplicated.
      discardAdoptedBlock();
    }
    mountAt(target);
  };

  // Track reactive deps immediately but defer DOM work until placeholder
  // is attached. On subsequent runs (reactive change) the effect runs
  // apply() directly with the freshly evaluated values — no redundant
  // double-evaluation.
  let mounted = false;

  const effectRunner = effect(() => {
    const disabled = evalDisabled(props);
    const target = disabled ? null : resolveTarget(props);

    if (mounted) {
      apply(disabled, target);
    }
  });

  onMount(() => {
    mounted = true;

    const disabled = evalDisabled(props);
    const target = disabled ? null : resolveTarget(props);

    // Try mounting synchronously — works when target is already in the document.
    if (disabled || target) {
      apply(disabled, target);
      return;
    }

    // Target may not be in the document yet (sibling elements mount bottom-up).
    // Defer to microtask — flushes before paint.
    queueMicrotask(() => {
      if (disposed) return;
      if (!placeholder.parentNode) return;
      apply(evalDisabled(props), resolveTarget(props));
    });
  });

  onCleanup(() => {
    disposed = true;
    effectRunner.stop();
    teardown();
  });

  return placeholder;
}

Portal[PORTAL_COMPONENT] = true;

/** Result of a successful Portal hydration claim. */
interface AdoptedPortal {
  anchor: Comment;
  target: Element;
  block: { start: Comment; end: Comment; nodes: Node[] };
}

/**
 * Hydration adoption for Portal.
 *
 * Claims the SSR call-site anchor and the target's teleport block. Returns
 * the claim on match, `null` on mismatch (falls back to the CSR mount path).
 * Ownership wiring (scope/effect/cleanup) happens in Portal() itself.
 */
function tryHydratePortal(props: PortalProps): AdoptedPortal | null {
  if (evalDisabled(props)) return null;

  const anchor = consumeTeleportAnchor();
  if (!anchor) {
    if (__DEV__) {
      warn('[Portal] hydration mismatch: no <!--teleport-anchor--> at call site.');
    }
    return null;
  }

  const target = resolveTarget(props);
  if (!target) {
    if (__DEV__) {
      warn(`[Portal] hydration mismatch: target not found: ${String(props.target)}`);
    }
    return null;
  }

  const block = consumeTeleportBlock(target);
  if (!block) {
    if (__DEV__) {
      warn(
        `[Portal] hydration mismatch: no <!--teleport-start--> in target ${String(props.target)}`,
      );
    }
    return null;
  }

  // Portal() marks the adopted anchor with PORTAL_COMPONENT itself.
  return { anchor, target, block };
}

/**
 * Check if a node is a Portal component.
 *
 * @param node - Node to check.
 * @returns True if node is a Portal.
 */
export function isPortal(node: unknown): boolean {
  return !!node && !!node[PORTAL_COMPONENT];
}
