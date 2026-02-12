import {
  coerceArray,
  isFunction,
  isHtmlInputElement,
  isHtmlSelectElement,
  isHtmlTextAreaElement,
} from '@estjs/shared';
import { effect } from '@estjs/signals';
import { normalizeNode } from './utils/node';
import { removeNode } from './utils/dom';
import { patchChildren } from './patch';
import { getActiveScope, onCleanup, runWithScope } from './scope';
import type { AnyNode } from './types';

/**
 * Add event listener with automatic cleanup on scope destruction
 *
 * @param element - Element to attach listener to
 * @param event - Event name
 * @param handler - Event handler function
 * @param options - Event listener options
 */
export function addEventListener(
  element: Element,
  event: string,
  handler: EventListener,
  options?: AddEventListenerOptions,
): void {
  element.addEventListener(event, handler, options);

  onCleanup(() => {
    element.removeEventListener(event, handler, options);
  });
}

/**
 * Bind an element to a setter function for two-way data binding
 *
 * @param node - The element to bind
 * @param key - The property key (unused, kept for API compatibility)
 * @param defaultValue - Default value (unused, kept for API compatibility)
 * @param setter - The setter function to call when the element's value changes
 */
export function bindElement(
  node: Element,
  key: string,
  defaultValue: unknown,
  setter: (value: unknown) => void,
): void {
  if (isHtmlInputElement(node)) {
    bindInputElement(node, setter);
  } else if (isHtmlSelectElement(node)) {
    bindSelectElement(node, setter);
  } else if (isHtmlTextAreaElement(node)) {
    addEventListener(node, 'input', () => {
      setter((node as HTMLTextAreaElement).value);
    });
  }
}

/**
 * Bind input element based on its type
 */
function bindInputElement(node: HTMLInputElement, setter: (value: unknown) => void): void {
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
        setter(node.value || '');
      });
      break;

    case 'date':
    case 'datetime-local':
    case 'month':
    case 'time':
    case 'week':
      addEventListener(node, 'change', () => {
        setter(node.value || '');
      });
      break;

    default:
      // text, email, password, search, tel, url, etc.
      addEventListener(node, 'input', () => {
        setter(node.value);
      });
      break;
  }
}

/**
 * Bind select element
 */
function bindSelectElement(node: HTMLSelectElement, setter: (value: unknown) => void): void {
  addEventListener(node, 'change', () => {
    if (node.multiple) {
      const values = Array.from(node.options)
        .filter(option => option.selected)
        .map(option => option.value);
      setter(values);
    } else {
      setter(node.value);
    }
  });
}

/**
 * Reactive node insertion with binding support
 *
 * @param parent Parent node
 * @param nodeFactory Node factory function or static node
 * @param before Reference node for insertion position
 * @param options Insertion options
 *
 * @example
 * ```typescript
 * insert(container, () => message.value, null);
 * insert(container, staticElement, referenceNode);
 * insert(container, "Hello World", null); // Direct string support
 * ```
 */
export function insert(parent: Node, nodeFactory: AnyNode, before?: Node) {
  if (!parent) return;

  let renderedNodes: AnyNode[] = [];
  const currentScope = getActiveScope();
  // Create effect for reactive updates
  const cleanup = effect(() => {
    const run = () => {
      const rawNodes = isFunction(nodeFactory) ? nodeFactory() : nodeFactory;
      const nodes = coerceArray(rawNodes as unknown)
        .map(item => (isFunction(item) ? item() : item))
        .flatMap(normalizeNode) as AnyNode[];

      renderedNodes = patchChildren(parent, renderedNodes, nodes, before) as AnyNode[];
    };
    if (currentScope) {
      runWithScope(currentScope, run);
    } else {
      run();
    }
  });

  onCleanup(() => {
    cleanup();
    renderedNodes.forEach(node => removeNode(node));
    renderedNodes.length = 0;
  });

  return renderedNodes;
}

/**
 * Map nodes from template by indexes
 *
 * @param template - Template node to traverse
 * @param indexes - Array of indexes to map
 * @returns Array of mapped nodes
 */
export function mapNodes(template: Node, indexes: number[]): Node[] {
  const len = indexes.length;
  const tree = new Array<Node>(len);
  const indexSet = new Set(indexes);

  let index = 1;
  let found = 0;

  const walk = (node: Node): boolean => {
    if (node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
      if (indexSet.has(index)) {
        tree[found++] = node;
        if (found === len) return true;
      }
      index++;
    }

    let child = node.firstChild;
    while (child) {
      if (walk(child)) return true;
      child = child.nextSibling;
    }

    return false;
  };

  walk(template);
  return tree;
}
