import { error, isFunction } from '@estjs/shared';
import {
  type ComponentFn,
  type ComponentProps,
  createScope,
  disposeScope,
  resetHydrationKey,
  runWithScope,
} from '@estjs/template';
import { addAttributes, convertToString } from './utils';

/**
 * Render a component to HTML string
 * @param {ComponentFn} component - the component to render
 * @param {ComponentProps} props - the props to pass to the component
 * @returns {string} the rendered HTML string
 */
export function renderToString<P extends ComponentProps = ComponentProps>(
  component: ComponentFn<P>,
  props: P | ComponentProps = {},
): string {
  if (!isFunction(component)) {
    error('Component must be a function');
    return '';
  }

  // Reset the hydration key counter
  resetHydrationKey();

  // Create root scope for SSR to support provide/inject
  const scope = createScope(null);

  let result: unknown;
  try {
    // Render the component within scope
    result = runWithScope(scope, () => component(props as P));
  } finally {
    // Clean up scope after rendering
    disposeScope(scope);
  }

  // Convert the result to string
  return convertToString(result);
}

/**
 * Render template with components (used by babel plugin in SSG mode)
 * @param {string[]} templates - the template fragments
 * @param {string} hydrationKey - the hydration key
 * @param {...string[]} components - the rendered component strings
 * @returns {string} the rendered HTML string
 */
export function render(templates: string[], hydrationKey: string, ...components: string[]): string {
  /**
   * JSX source code:
   * <div>
   *   <div>
   *     <Component1 />
   *     <Component2 />
   *   </div>
   *   <Component3 />
   * </div>
   *
   * Compiles to:
   *
   * let _tmpl = [
   *   '<div><div>',
   *   '</div>',
   *   '</div>',
   * ]
   *
   * function component(props) {
   *   return render(_tmpl, getHydrationKey(),
   *     createSSGComponent(Component1, {}),
   *     createSSGComponent(Component2, {}),
   *     createSSGComponent(Component3, {})
   *   );
   * }
   */

  // Build content using array join for better performance
  const parts: string[] = [];
  const templateLen = templates.length;
  const componentLen = components.length;

  for (let i = 0; i < templateLen; i++) {
    parts.push(templates[i]);
    if (i < componentLen && components[i]) {
      parts.push(convertToString(components[i]));
    }
  }

  const content = parts.join('');

  // Add hydration key attribute
  return addAttributes(content, hydrationKey);
}

/**
 * Create a SSG component (renders component to string)
 * @param {ComponentFn} component - the component to create
 * @param {ComponentProps} props - the props to pass to the component
 * @returns {string} the rendered component as a string
 */
export function createSSGComponent<P extends ComponentProps = ComponentProps>(
  component: ComponentFn<P>,
  props: P | ComponentProps = {},
): string {
  if (!isFunction(component)) {
    error('createSSGComponent: Component is not a function');
    return '';
  }

  // Create child scope inheriting from current active scope (if any)
  // This allows nested components to access parent's provided values
  const scope = createScope();

  let result: unknown;
  try {
    // Render the component within scope
    result = runWithScope(scope, () => component(props as P));
  } finally {
    // Clean up scope after rendering
    disposeScope(scope);
  }

  return convertToString(result);
}
