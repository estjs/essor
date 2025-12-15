import { error } from '@estjs/shared';
import { COMPONENT_TYPE } from '../constants';
import type { ComponentProps, componentResultNodeType } from '../component';
import type { AnyNode } from '../types';

export interface FragmentProps extends ComponentProps {
  children?: AnyNode | AnyNode[];
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
export function Fragment(props?: FragmentProps) {
  if (__DEV__) {
    if (!props) {
      error('Fragment component requires props');
      return [];
    }
    if (!props.children) {
      error('Fragment component requires children');
      return [];
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

  return props?.children as componentResultNodeType;
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
