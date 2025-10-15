import { effect } from '@estjs/signal';
import { coerceArray, isFunction } from '@estjs/shared';
import { getActiveContext } from './context';
import {
  isHtmlInputElement,
  isHtmlSelectElement,
  isHtmlTextAreaElement,
  normalizeNode,
} from './utils';
import { patchChildren } from './patch';
import type { AnyNode } from './types';

/**
 * add an event listener to a node
 * @param {Element} node - the node to add the event listener to
 * @param {string} eventName - the event name to listen to
 * @param {EventListener} listener - the listener to call when the event is triggered
 * @param {AddEventListenerOptions} listenerOptions - the options for the event listener
 */
/**
 * Adds an event listener to the given node.
 *
 * If an active context is available, a cleanup function will be added to the context's
 * cleanup collection to remove the event listener when the context is destroyed.
 *
 * @param node - The node to add the event listener to.
 * @param name - The name of the event to listen for.
 * @param handler - The event handler function to call when the event occurs.
 * @param options - Optional options for the event listener.
 */
export function addEventListener(
  node: Element,
  name: string,
  handler: EventListener,
  options?: boolean | AddEventListenerOptions,
) {
  const activeContext = getActiveContext();
  node.addEventListener(name, handler, options);
  if (activeContext) {
    const cleanup = () => node.removeEventListener(name, handler);
    activeContext.cleanup.add(cleanup);
  }
}
/**
 * Bind an element to a setter function, allowing the element to update the setter value when its value changes.
 *
 * @param node The element to bind.
 * @param setter The setter function to call when the element's value changes.
 */
export function bindElement(node: Element, setter: (value: unknown) => void) {
  if (isHtmlInputElement(node)) {
    switch (node.type) {
      case 'checkbox':
        addEventListener(node, 'change', () => {
          setter(Boolean(node.checked));
        });
        break;

      case 'radio':
        addEventListener(node, 'change', () => {
          setter(node.checked ? node.value : '');
        });
        break;

      case 'file':
        addEventListener(node, 'change', () => {
          setter(node.files);
        });
        break;

      case 'number':
      case 'range':
        addEventListener(node, 'input', () => {
          const numValue = Number.parseFloat(node.value);
          const value = Number.isNaN(numValue) ? '' : String(numValue);
          setter(value);
        });
        break;

      case 'date':
      case 'datetime-local':
      case 'month':
      case 'time':
      case 'week':
        addEventListener(node, 'change', () => {
          setter(node.value ? node.value : '');
        });
        break;

      default:
        // Text input types
        addEventListener(node, 'input', () => {
          setter(node.value ? node.value : '');
        });
        break;
    }
  }

  if (isHtmlSelectElement(node)) {
    addEventListener(node, 'change', () => {
      let value: string | string[];

      if (node.multiple) {
        // Multi-select dropdown
        value = Array.from((node as unknown as HTMLSelectElement).selectedOptions).map(
          option => option.value,
        );
      } else {
        // Single-select dropdown
        value = node.value;
      }
      setter(value);
    });
  }

  if (isHtmlTextAreaElement(node)) {
    addEventListener(node, 'input', () => {
      setter(node.value ? node.value : '');
    });
  }
}

/**
 * Reactive node insertion with binding support
 *
 * @param parent Parent node
 * @param nodeFactory Node factory function or static node
 * @param before Reference node for insertion position
 * @param options Binding options
 *
 * @example
 * ```typescript
 * insert(container, () => createTextNode(message.value), null);
 * insert(container, staticElement, referenceNode);
 * ```
 */
export function insert(parent: Node, nodeFactory: Function | Node, before?: Node): void {
  if (!parent) return;

  const context = getActiveContext();
  if (!context) return;

  let renderedNodes;

  const cleanup = effect(
    () => {
      const nodes = coerceArray(isFunction(nodeFactory) ? nodeFactory() : nodeFactory).map(
        normalizeNode,
      ) as AnyNode[];
      renderedNodes = patchChildren(parent, renderedNodes, nodes, before);
    },
    { flush: 'post' },
  );

  // Register cleanup function
  context.cleanup.add(() => {
    if (renderedNodes.length) {
      renderedNodes.length = 0;
    }
    cleanup();
  });
}
/**
 * map the nodes
 */
export function mapNodes(template: Node, indexes: number[]): Node[] {
  let index = 1;
  const tree: Node[] = [];
  const done: number[] = [];

  const walk = (node: Node) => {
    if (node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
      if (indexes.includes(index)) {
        done.push(index);
        tree.push(node);
      }

      index++;
    }
    if (done.length === indexes.length) {
      return;
    }
    let child = node.firstChild;
    while (child) {
      walk(child);
      child = child.nextSibling;
    }
  };
  walk(template);

  return tree;
}
