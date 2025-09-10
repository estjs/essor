import { error } from '@estjs/shared';
import { type ComponentProps, createComponent } from './component';
import { insertNode } from './patch';

/**
 * create a template
 * @param {string} html - the html string
 * @returns {Function} a factory function that returns a cloned node of the template
 */
export function template(html: string) {
  let node: Node | undefined;

  const create = (): Node => {
    // Regular HTML template
    const template = document.createElement('template');
    template.innerHTML = html;
    const firstChild = template.content.firstChild;
    if (!firstChild) {
      throw new Error('Invalid template: empty content');
    }
    return firstChild;
  };

  // return a factory function: create the template when first called, reuse the cached template when called later
  return () => (node || (node = create())).cloneNode(true);
}

/**
 * create a app
 * @param {Function} component - the component to create the app
 * @param {string|Element} target - the target to mount the app
 * @returns {void}
 */
export function createApp(component: (props: ComponentProps) => Node, target: string | Element) {
  const container = typeof target === 'string' ? document.querySelector(target) : target;
  if (!container) {
    error(`Target element not found: ${target}`);
    return;
  }

  const existingContext = container.innerHTML;
  if (existingContext) {
    error(`Target element is not empty, it will be delete: ${target}`);
    container.innerHTML = '';
  }

  const rootComponent = createComponent(component as any);
  const rootNode = rootComponent.mount(container);

  if (rootNode) {
    insertNode(container, rootNode);
  }

  return rootComponent;
}
