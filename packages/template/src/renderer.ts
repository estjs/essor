import { ComponentNode } from './componentNode';
import { insertChild } from './patch';
import type { ComponentProps } from './types';

/**
 * Creates an HTML template element from a given HTML string.
 */
export function template(html: string) {
  let node: Node | undefined;
  const create = (): Node => {
    const template = document.createElement('template');
    template.innerHTML = html;
    const firstChild = template.content.firstChild;
    if (!firstChild) {
      throw new Error('Invalid template: empty content');
    }
    return firstChild;
  };

  return () => (node || (node = create())).cloneNode(true);
}

/**
 * Checks if the given node is an instance of `ComponentNode`.
 * @param node The node to check
 * @returns `true` if the node is a ComponentNode instance, `false` otherwise
 */
export function isComponent(node: unknown): node is ComponentNode {
  return node instanceof ComponentNode;
}

/**
 * Creates a component instance
 * @param Comp The component to create
 * @param props The component properties
 * @returns A new `ComponentNode` instance
 */
export function createComponent<P extends ComponentProps>(Comp: (props: P) => Node, props?: P) {
  return new ComponentNode(Comp, props);
}

/**
 * Creates a new application instance
 */
export function createApp(
  rootComponent: (props: ComponentProps) => Node,
  container: string | Element,
  props: ComponentProps = {},
) {
  const root = typeof container === 'string' ? document.querySelector(container) : container;
  if (!root) {
    throw new Error('Container element not found');
  }

  if (__DEV__) {
    if (root.innerHTML) {
      console.warn('Root element already has innerHTML, it will be overridden');
    }
  }
  root.innerHTML = '';

  const componentNode = new ComponentNode(rootComponent, props);
  const el = componentNode.mount(root);

  // Only insert if el is not null
  if (el) {
    insertChild(root, el);
  }

  return {
    unmount: () => componentNode.unmount(),
  };
}
