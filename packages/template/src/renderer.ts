import { error, isString } from '@estjs/shared';
import { type ComponentFn, createComponent } from './component';

/**
 * Create a template factory function from HTML string
 *
 * This function creates a reusable template factory that efficiently clones
 * DOM nodes from the provided HTML string. The template is parsed once and
 *
 * @param html - The HTML string to create template from
 * @returns Factory function that returns a cloned node of the template
 * @throws {Error} When template content is empty or invalid
 *
 * @example
 * ```typescript
 * const buttonTemplate = template('<button>Click me</button>');
 * const button1 = buttonTemplate(); // Creates first button instance
 * const button2 = buttonTemplate(); // Creates second button instance
 * ```
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
 * Create and mount an application with the specified component
 *
 * This function initializes an application by mounting a root component
 * to a target DOM element. It handles target validation and cleanup.
 *
 * @param component - The root component function to mount
 * @param target - CSS selector string or DOM element to mount to
 * @returns The mount root component instance, or undefined if target not found
 *
 * @example
 * ```typescript
 * const App = () => template('<div>Hello World</div>')
 * const app = createApp(App, '#root');
 *
 * // Or with DOM element
 * const container = document.getElementById('app');
 * const app = createApp(App, container);
 * ```
 */
export function createApp(component: ComponentFn, target: string | Element) {
  const container = isString(target)
    ? document.querySelector(target as string)
    : (target as Element);
  if (!container) {
    error(`Target element not found: ${target}`);
    return;
  }

  const existingContext = container.innerHTML;
  if (existingContext) {
    error(`Target element is not empty, it will be delete: ${target}`);
    container.innerHTML = '';
  }

  const rootComponent = createComponent(component);
  rootComponent.mount(container);

  return rootComponent;
}
