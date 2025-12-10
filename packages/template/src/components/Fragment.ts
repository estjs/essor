import { error } from 'node:console';
import { insertNode, normalizeNode } from '../utils';
import { COMPONENT_TYPE } from '../constants';
import type { ComponentProps } from '../component';
import type { AnyNode } from '../types';

export interface FragmentProps extends ComponentProps {
  children?: AnyNode | AnyNode[];
  key?: string;
}

/**
 * Fragment component - renders multiple children without wrapper elements
 *
 * @param props - Component props with children
 * @returns DocumentFragment containing all children
 *
 * @example
 * ```tsx
 * <Fragment>
 *   <div>First</div>
 *   <span>Second</span>
 * </Fragment>
 * ```
 */
export function Fragment(props?: FragmentProps): DocumentFragment {
  if (__DEV__) {
    if (!props) {
      error('Fragment component requires props');
      return document.createDocumentFragment();
    }
    if (!props.children) {
      error('Fragment component requires children');
      return document.createDocumentFragment();
    }
  }

  // TODO:
  // Check i  f we're in SSR mode (no document)
  // if (typeof document === 'undefined') {
  //   const children = props.children;
  //   if (!children) return '';
  //   const childArray = Array.isArray(children) ? children : [children];
  //   // In SSR, convert children to string
  //   return childArray.map(child => String(child || '')).join('');
  // }

  const fragment = document.createDocumentFragment();
  const children = props!.children;

  if (children) {
    const childArray = Array.isArray(children) ? children : [children];
    childArray.forEach(child => {
      if (child != null) {
        // Skip null/undefined
        const normalized = normalizeNode(child);
        if (normalized) {
          insertNode(fragment, normalized);
        }
      }
    });
  }

  return fragment;
}

Fragment[COMPONENT_TYPE.FRAGMENT] = true;

/**
 * Check if a node is a Fragment component
 * @param node - Node to check
 * @returns true if node is a Fragment
 */
export function isFragment(node: unknown): boolean {
  return !!node && !!(node as any)[COMPONENT_TYPE.FRAGMENT];
}
