import { insert } from '../binding';
import { createContext, withContext } from '../context';
/**
 * Type definition for Fragment component
 */
export interface FragmentProps {
  children: JSX.Element | JSX.Element[] | (() => JSX.Element | JSX.Element[]) | null;
}

/**
 * Fragment component - Used to wrap multiple child elements without creating extra DOM nodes
 * Optimized performance, supports reactive updates
 */
export function Fragment(props: FragmentProps): DocumentFragment {
  const fragment = document.createDocumentFragment();

  const context = createContext();
  withContext(context, () => {
    insert(fragment, () => props.children);
  });

  return fragment;
}

/**
 * Determine if it's a Fragment node
 */
export function isFragment(node: unknown): boolean {
  return node instanceof DocumentFragment;
}
