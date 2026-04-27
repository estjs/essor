import { isString, warn } from '@estjs/shared';
import { type Component, createComponent, isComponent } from './component';
import { insert } from './binding';
import { createScope, disposeScope, runWithScope } from './scope';
import { beginHydration, endHydration } from './hydration';
import { insertNode } from './dom';
import type { ComponentFn, ComponentProps } from './types';

/**
 * Create a template factory function from HTML string.
 *
 * This function creates a reusable template factory that efficiently clones
 * DOM nodes from the provided HTML string. The template is parsed once.
 *
 * Security note: `template(html)` is a raw HTML entrypoint. The caller is
 * responsible for ensuring `html` is trusted and not derived from unsanitized
 * user input.
 *
 * @param html - The HTML string to create template from.
 * @returns Factory function that returns a cloned node of the template.
 * @throws {Error} When template content is empty or invalid.
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

  /**
   * Creates the cached template root node on first use.
   */
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
      warn(`Target element is not empty, it will be cleared: ${target}`);
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
      disposeScope(scope);
      rootNode?.destroy();
    },
  };
}

export function hydrate<P extends ComponentProps = {}>(
  component: ComponentFn<P>,
  target: string | Element,
) {
  const container = isString(target) ? document.querySelector(target) : (target as Element);
  if (!container) {
    if (__DEV__) {
      warn(`[essor] hydrate: target element not found: ${target}`);
    }
    return;
  }

  beginHydration(container);

  const scope = createScope();
  let rootNode: Component | undefined;
  try {
    runWithScope(scope, () => {
      const mountedRoot = createComponent(component);
      if (isComponent(mountedRoot)) {
        rootNode = mountedRoot;
        insert(container, mountedRoot);
      }
    });
  } catch (error_) {
    disposeScope(scope);
    throw error_;
  } finally {
    endHydration();
  }

  return {
    root: rootNode,
    unmount: () => {
      disposeScope(scope);
      rootNode?.destroy();
    },
  };
}
