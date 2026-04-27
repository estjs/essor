import { isString, warn } from '@estjs/shared';
import { insert } from '../binding';
import { PORTAL_COMPONENT } from '../constants';
import type { AnyNode } from '../types';

export interface PortalProps {
  children?: AnyNode | AnyNode[];
  target: string | HTMLElement;
  key?: string;
}

/**
 * Portal component - renders children into a different DOM node.
 *
 * @param props - Component props with children and target.
 * @returns {Comment | string} Comment node as placeholder in parent tree.
 *
 * @example
 * ```tsx
 * <Portal target="#modal-root">
 *   <div>Modal content</div>
 * </Portal>
 */
export function Portal(props: PortalProps): Comment | string {
  if (typeof document === 'undefined') {
    const children = props.children;
    if (Array.isArray(children)) {
      return children.map((child) => (child == null ? '' : String(child))).join('');
    }
    return children == null ? '' : String(children);
  }

  // Create placeholder comment for parent tree
  const placeholder = document.createComment('portal');
  placeholder[PORTAL_COMPONENT] = true;
  const children = props.children;

  if (children) {
    // Get target element
    const targetElement = isString(props.target)
      ? document.querySelector(props.target)
      : props.target;

    if (!targetElement) {
      if (__DEV__) {
        warn(`[Portal] Target element not found: ${props.target}`);
      }
      return placeholder;
    }

    // insert() runs inside Portal's scope. Because the factory is a function,
    // it sets up an effect whose cleanup removes the mounted nodes from the
    // target when Portal itself unmounts — no extra onCleanup needed here.
    insert(targetElement, () => children);
  }

  return placeholder;
}

Portal[PORTAL_COMPONENT] = true;

/**
 * Check if a node is a Portal component.
 *
 * @param node - Node to check.
 * @returns {boolean} True if node is a Portal.
 */
export function isPortal(node: unknown): boolean {
  return !!node && !!node[PORTAL_COMPONENT];
}
