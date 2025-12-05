import { isArray, isString, warn } from '@estjs/shared';
import { insertNode, normalizeNode } from '../utils';
import { COMPONENT_TYPE } from '../constants';
import { onMount } from '../lifecycle';
import type { AnyNode } from '../types';

export interface PortalProps {
  children?: AnyNode | AnyNode[];
  target: string | HTMLElement;
  key?: string;
}

/**
 * Portal component - renders children into a different DOM node
 *
 * @param props - Component props with children and target
 * @returns Comment node as placeholder in parent tree
 *
 * @example
 * ```tsx
 * <Portal target="#modal-root">
 *   <div>Modal content</div>
 * </Portal>
 * ```
 */
export function Portal(props: PortalProps): Comment | string {
  // Check if we're in SSR mode (no document)
  if (typeof document === 'undefined') {
    const children = props.children;
    if (!children) return '';
    const childArray = isArray(children) ? children : [children];
    // In SSR, convert children to string
    return childArray.map(child => String(child || '')).join('');
  }
  // Create placeholder comment for parent tree
  const placeholder = document.createComment('portal');
  // Mark as portal for isPortal check
  (placeholder as any)[COMPONENT_TYPE.PORTAL] = true;

  onMount(() => {
    // Get target element
    const targetElement = isString(props.target)
      ? document.querySelector(props.target)
      : props.target;

    if (!targetElement) {
      if (__DEV__) {
        warn(`[Portal] Target element not found: ${props.target}`);
      }
      return;
    }

    const children = props.children;
    if (children) {
      const childArray = isArray(children) ? children : [children];
      childArray.forEach(child => {
        if (child != null) {
          const normalized = normalizeNode(child);
          if (normalized) {
            insertNode(targetElement, normalized);
          }
        }
      });
    }
  });

  return placeholder;
}

Portal[COMPONENT_TYPE.PORTAL] = true;

/**
 * Check if a node is a Portal component
 * @param node - Node to check
 * @returns true if node is a Portal
 */
export function isPortal(node: unknown): boolean {
  return !!node && !!(node as any)[COMPONENT_TYPE.PORTAL];
}
