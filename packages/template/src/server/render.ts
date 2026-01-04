import { error, isFunction } from '@estjs/shared';
import { addAttributes, convertToString, resetHydrationKey } from './shared';
import type { ComponentFn, ComponentProps } from '../types';
/**
 *
 *  ssg compile
 *
 *   component context it will this:
 *
 * function component(props) {
 * // render function props: template, hydrationKey, ...components
 * return render(_tmpl, getHydrationKey(), createSSGComponent(xx, {}));
 * }
 *
 * renderToString(component, props)
 *
 *
 */

/**
 * render the component to string
 * @param {ComponentFn} component - the component to render
 * @param {ComponentProps} props - the props to pass to the component
 * @returns {string} the rendered string
 */
export function renderToString(component: ComponentFn, props: ComponentProps = {}) {
  if (!isFunction(component)) {
    error('Component must be a function');
    return '';
  }

  // reset the hydration key
  resetHydrationKey();

  // render the component
  const result = component(props);

  // convert the result to string
  return convertToString(result);
}

/**
 * render the component to string
 * @param {string[]} templates - the template to render
 * @param {string} hydrationKey - the hydration key
 * @param {...string[]} components - the components to render
 * @returns {string} the rendered string
 */
export function render(templates: string[], hydrationKey: string, ...components: string[]) {
  // rendered content
  let content = '';
  // index
  let index = 0;

  /**
   *
   *  jsx source code
   * <div>
   *  <div>
   *    <Component 1/>
   *    <Component 2/>
   *    </div>
   *    <Component 3/>
   * </div>
   *
   * it will compile to:
   *
   *
   * let _tmpl = [
   *  '<div><div>',
   *  '</div>',
   *  '</div>',
   * ]
   *
   *  function component(props) {
   * return render(_tmpl, getHydrationKey(), createSSGComponent(Component1, {}), createSSGComponent(Component2, {}), createSSGComponent(Component3, {}));
   * }
   *
   */

  // map different templates
  for (const template of templates) {
    content += template;
    // render component
    if (index < components.length) {
      const component = components[index++];

      if (component) {
        content += convertToString(component);
      }
    }
  }

  //add hydrate key
  const result = addAttributes(content, hydrationKey);

  return result;
}

/**
 * create a ssg component
 * @param {ComponentFn} component - the component to create
 * @param {ComponentProps} props - the props to pass to the component
 * @returns {string} the created component as a string
 */
export function createSSGComponent(component: ComponentFn, props: ComponentProps = {}): string {
  if (!isFunction(component)) {
    error('create ssg component: Component is not a function');
    return '';
  }

  const result = component(props);

  return convertToString(result);
}
