import { isString, warn } from '@estjs/shared';
import { type Component, createComponent, isComponent } from './component';
import { createScope, disposeScope, runWithScope } from './scope';
import { insertNode } from './dom';
import type { ComponentFn, ComponentProps } from './types';

export { template } from './template';

/**
 * Create and mount an application with the specified component.
 *
 * This function initializes an application by mounting a root component
 * to a target DOM element. It handles target validation and cleanup.
 *
 * @param component - The root component function to mount.
 * @param target - CSS selector string or DOM element to mount to.
 * @returns Object with root component and unmount function.
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
export function createApp<P extends ComponentProps = {}>(
  component: ComponentFn<P>,
  target: string | Element,
) {
  const container = isString(target) ? document.querySelector(target) : (target as Element);
  if (!container) {
    if (__DEV__) {
      warn(`Target element not found: ${target}`);
    }
    return;
  }

  const existingContent = container.innerHTML;
  if (existingContent) {
    if (__DEV__) {
      // `[data-hk]` markers mean SSR markup — the user likely wants hydrate().
      if (container.querySelector('[data-hk]')) {
        warn(
          `Target element contains server-rendered markup ([data-hk]); ` +
            `createApp() will discard it and render from scratch. ` +
            `Did you mean to call hydrate() or createSSRApp()?`,
        );
      } else {
        warn(`Target element is not empty, it will be cleared: ${target}`);
      }
    }
    container.innerHTML = '';
  }

  const scope = createScope();
  let rootNode: Component | undefined;
  try {
    runWithScope(scope, () => {
      const mountedRoot = createComponent(component);
      if (isComponent(mountedRoot)) {
        rootNode = mountedRoot;
        insertNode(container, mountedRoot);
      }
    });
  } catch (error_) {
    disposeScope(scope);
    throw error_;
  }

  return {
    root: rootNode,
    unmount: () => {
      // destroy() removes DOM nodes and disposes the component's own scope first;
      // then disposeScope cleans up the root application scope (provide context, etc.)
      rootNode?.destroy();
      disposeScope(scope);
    },
  };
}
