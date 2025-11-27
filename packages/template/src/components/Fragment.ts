import { insertNode, normalizeNode } from '../utils';
import { COMPONENT_TYPE } from '../constants';
import type { AnyNode } from '../types';

export function Fragment(props: { children?: AnyNode | AnyNode[]; key?: string }) {
  // Check if we're in SSR mode (no document)
  if (typeof document === 'undefined') {
    const children = props.children;
    if (!children) return '';
    const childArray = Array.isArray(children) ? children : [children];
    // In SSR, convert children to string
    return childArray.map(child => String(child || '')).join('');
  }

  const fragment = document.createDocumentFragment();
  const children = props.children;

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

export function isFragment(node: unknown): boolean {
  return !!node && !!(node as any)[COMPONENT_TYPE.FRAGMENT];
}
