import { isArray, isString, warn } from '@estjs/shared';
import { insertNode } from '../utils/dom';
import { normalizeNode } from '../utils/node';
import { onMount } from '../lifecycle';
import { onCleanup } from '../scope';
import { PORTAL_COMPONENT } from '../constants';
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
 */
export function Portal(props: PortalProps): Comment | string {
  // Create placeholder comment for parent tree
  const placeholder = document.createComment('portal');
  placeholder[PORTAL_COMPONENT] = true;
  const children = props.children;
  if (children) {
    const childArray = isArray(children) ? children : [children];
    const nodes: (Node | string)[] = [];

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

      childArray.forEach(child => {
        if (child != null) {
          const normalized = normalizeNode(child);
          if (normalized) {
            insertNode(targetElement as Node, normalized);
            nodes.push(normalized);
          }
        }
      });

      onCleanup(() => {
        nodes.forEach(node => {
          if (!isString(node) && node.parentNode === targetElement) {
            targetElement.removeChild(node);
          }
        });
      });
    });
  }

  return placeholder;
}

Portal[PORTAL_COMPONENT] = true;

/**
 * Check if a node is a Portal component
 * @param node - Node to check
 * @returns true if node is a Portal
 */
export function isPortal(node: unknown): boolean {
  return !!node && !!node[PORTAL_COMPONENT];
}
