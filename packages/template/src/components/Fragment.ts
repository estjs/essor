import { error } from '@estjs/shared';
import { FRAGMENT_COMPONENT } from '../constants';
import type { AnyNode, ComponentProps } from '../types';

export interface FragmentProps extends ComponentProps {
  children?: AnyNode | AnyNode[];
}

/**
 * Fragment component - renders multiple children without wrapper elements (Client-side only)
 *
 * **Client-side behavior:**
 * - Returns children directly for rendering
 * - Hydration system matches children using hydration keys
 * - The template system handles array children automatically
 *
 * @param props - Component props with children
 * @returns Children directly without wrapper
 *
 * @example
 * ```tsx
 * // Basic usage
 * <Fragment>
 *   <div>First</div>
 *   <span>Second</span>
 * </Fragment>
 *
 * // Nested fragments
 * <Fragment>
 *   <Fragment>
 *     <div>Nested 1</div>
 *     <div>Nested 2</div>
 *   </Fragment>
 *   <div>Third</div>
 * </Fragment>
 *
 * // Empty fragment (renders nothing)
 * <Fragment />
 * ```
 */
export function Fragment(props?: FragmentProps): AnyNode {
  if (__DEV__) {
    if (!props) {
      error('Fragment component requires props');
      return null;
    }
  }

  // Handle empty fragment - return null
  if (!props?.children) {
    error('Fragment component requires children');
    return null;
  }

  const { children } = props;

  // Client-side rendering: Return children directly
  // The template system will handle them appropriately
  return children as AnyNode;
}

Fragment[FRAGMENT_COMPONENT] = true;

/**
 * Check if a node is a Fragment component
 * @param node - Node to check
 * @returns true if node is a Fragment
 */
export function isFragment(node: unknown): boolean {
  return !!node && !!node[FRAGMENT_COMPONENT];
}
