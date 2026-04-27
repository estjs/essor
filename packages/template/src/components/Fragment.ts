import { FRAGMENT_COMPONENT } from '../constants';
import type { AnyNode, ComponentProps } from '../types';

export interface FragmentProps extends ComponentProps {
  children?: AnyNode | AnyNode[];
}

/**
 * Fragment component - renders multiple children without wrapper elements (Client-side only).
 *
 * **Client-side behavior:**
 * - Returns children directly for rendering.
 * - Hydration system matches children using hydration keys.
 * - The template system handles array children automatically.
 *
 * @param props - Component props with children.
 * @returns {AnyNode} Children directly without wrapper.
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
  // `<Fragment />` and `<Fragment>{null}</Fragment>` are legitimate:
  // they render nothing. Returning `null` here keeps the caller tree
  // valid and lets the template runtime drop the placeholder.
  if (!props || props.children == null) return null;

  // Client-side rendering: return children directly — the template
  // system handles arrays/signals/components on its own.
  return props.children as AnyNode;
}

Fragment[FRAGMENT_COMPONENT] = true;

/**
 * Check if a node is a Fragment component.
 *
 * @param node - Node to check.
 * @returns {boolean} True if node is a Fragment.
 */
export function isFragment(node: unknown): boolean {
  return !!node && !!node[FRAGMENT_COMPONENT];
}
