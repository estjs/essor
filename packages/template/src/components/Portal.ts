import { isFunction, isString, warn } from '@estjs/shared';
import { effect } from '@estjs/signals';
import { insert } from '../binding';
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
  // Hydration: adopt SSR-emitted anchors + target block.
  if (isHydrating()) {
    const adopted = tryHydratePortal(props);
    if (adopted) return adopted;
  }

  const placeholder = document.createComment('portal');
  placeholder[PORTAL_COMPONENT] = true;

  const { children } = props;
  if (children == null) return placeholder;

  const ownerScope = getActiveScope();
  let innerScope: Scope | null = null;

  /**
   * Mount children into the given parent, inside a fresh inner scope
   * that inherits from the owning scope. This allows `insert()` effects
   * to be properly disposed on teardown.
   */
  const mountAt = (parent: Node, before?: Node): void => {
    innerScope = createScope(ownerScope);
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
    teardown();

    if (disabled) {
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
    mountAt(target);
  };

  // Track reactive deps immediately but defer DOM work until placeholder
  // is attached. On subsequent runs (reactive change) the effect runs
  // apply() directly with the freshly evaluated values — no redundant
  // double-evaluation.
  let mounted = false;

  effect(() => {
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
      if (!placeholder.parentNode) return;
      apply(evalDisabled(props), resolveTarget(props));
    });
  });

  onCleanup(teardown);

  return placeholder;
}

Portal[PORTAL_COMPONENT] = true;

/**
 * Hydration adoption for Portal.
 *
 * Returns the SSR call-site anchor as placeholder on match, `null` on mismatch
 * (falls back to CSR mount path).
 */
function tryHydratePortal(props: PortalProps): Comment | null {
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

  anchor[PORTAL_COMPONENT] = true;
  return anchor;
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
