import { SSGNode } from './ssg-node';
import { renderContext } from './shared-config';
import { h } from './jsx-renderer';
import type { EssorComponent, Props } from '../types';

/**
 * Render a component to a string.
 *
 * This function renders a component to an HTML string. It is used for server-side rendering (SSR) and static site generation (SSG).
 *
 * @param component The component to render.
 * @param props Optional props to pass to the component.
 * @returns The rendered HTML string.
 */
export function renderToString(component: EssorComponent, props?: Record<string, unknown>): string {
  renderContext.setSSG();
  const ssrNode = new SSGNode(component, props || {});
  const html = ssrNode.mount();
  renderContext.setClient();
  return html;
}

/**
 * Hydrate a component in a container.
 *
 * This function hydrates a component in a container element. It is used for server-side rendering (SSR) and client-side rendering (CSR).
 *
 * @param component The component to hydrate.
 * @param container The container element to hydrate in. Can be a string selector or an Element.
 */
export function hydrate(component: EssorComponent, container: string | Element): void {
  const rootElement = typeof container === 'string' ? document.querySelector(container) : container;

  // if the container is not found, throw an error
  if (!rootElement) {
    throw new Error(`Could not find container: ${container}`);
  }
  renderContext.setSSR();
  h(component).mount(rootElement);
  renderContext.setClient();
}

/**
 * Create a server-side generation (SSG) node from a component.
 *
 * If the render context is set to SSG, this function will create a new SSGNode from the component. Otherwise, it will create a new JSX element using the h function.
 *
 * @param component The component to create the SSGNode from.
 * @param props Optional props to pass to the component.
 * @returns The SSGNode or JSX element.
 */
export function ssg(component, props?: Props) {
  if (renderContext.isSSG) {
    return new SSGNode(component, props);
  }
  return h(component, props);
}
