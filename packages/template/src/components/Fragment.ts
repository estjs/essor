import { createContext, withContext } from '../context';
import { insert } from '../dom';
import type { NodeOrComponent } from '../types';

/**
 * Fragment component props interface
 */
export interface FragmentProps {
  children: NodeOrComponent | NodeOrComponent[] | (() => NodeOrComponent | NodeOrComponent[]);
  key?: string | number;
}

/**
 * Fragment component - Renders multiple children without creating an extra DOM node
 * Optimized for performance with caching and minimal DOM operations
 *
 * @param props The component props
 * @returns A document fragment containing the children
 */
export function Fragment(props: FragmentProps): DocumentFragment {
  // Create a new fragment
  const fragment = document.createDocumentFragment();

  // Create a new context for the fragment
  const context = createContext();

  // Render children within the context
  withContext(context, () => {
    insert(fragment, props.children);
  });

  return fragment;
}

/**
 * Checks if a node is a Fragment
 * Optimized with type checking for better performance
 *
 * @param node The node to check
 * @returns True if the node is a fragment, false otherwise
 */
export function isFragment(node: unknown): boolean {
  if (!node) {
    return false;
  }

  // Fast path for DocumentFragment
  if (node instanceof DocumentFragment) {
    return true;
  }

  // Check for fragment-like objects
  if (typeof node === 'object') {
    const nodeObj = node as any;
    return nodeObj.nodeType === 11 || Boolean(nodeObj.isFragment);
  }

  return false;
}
