import { coerceArray, isFunction } from '@estjs/shared';
import { effect } from '@estjs/signals';
import {
  isHtmlInputElement,
  isHtmlSelectElement,
  isHtmlTextAreaElement,
  normalizeNode,
  removeNode,
} from './utils';
import { patchChildren } from './patch';
import { type Scope, getActiveScope, onCleanup, runWithScope } from './scope';
import type { AnyNode } from './types';
/**
 * Add event listener with automatic cleanup on scope destruction
 */
export function addEventListener(
  element: Element,
  event: string,
  handler: EventListener,
  options?: AddEventListenerOptions,
): void {
  element.addEventListener(event, handler, options);

  // Register cleanup in current scope using onCleanup
  onCleanup(() => {
    element.removeEventListener(event, handler, options);
  });
}

/**
 * Bind an element to a setter function, allowing the element to update the setter value when its value changes.
 *
 * @param node The element to bind.
 * @param setter The setter function to call when the element's value changes.
 */
export function bindElement(node: Element, key, defaultValue, setter: (value: unknown) => void) {
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
  } else if (isHtmlSelectElement(node)) {
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
  } else if (isHtmlTextAreaElement(node)) {
    addEventListener(node, 'input', () => {
      setter(node.value);
    });
  }
}

/**
 * Reactive node insertion with binding support
 *
 * @param parent Parent node
 * @param nodeFactory Node factory function or static node
 * @param before Reference node for insertion position
 *
 * @example
 * ```typescript
 * insert(container, () => message.value, null);
 * insert(container, staticElement, referenceNode);
 * insert(container, "Hello World", null); // Direct string support
 * ```
 */
export interface InsertOptions {
  preserveOnCleanup?: boolean;
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
export function insert(
  parent: Node,
  nodeFactory: (() => Node | AnyNode[]) | Node | string | AnyNode[],
  before?: Node,
) {
  if (!parent) return;
  // Capture owner scope at call time - this is critical for correct context inheritance
  // When dynamic components are created inside effects, they need to inherit from
  // the scope that was active when insert() was called, not when the effect runs
  const ownerScope: Scope | null = getActiveScope();

  let renderedNodes: AnyNode[] = [];

  // Track if this is the first run (for hydration)
  // Create effect for reactive updates
  const cleanup = effect(() => {
    const executeUpdate = () => {
      const rawNodes = isFunction(nodeFactory) ? nodeFactory() : nodeFactory;
      const nodes = coerceArray(rawNodes as unknown)
        .map(item => (isFunction(item) ? item() : item))
        .flatMap(i => i)
        .map(normalizeNode) as AnyNode[];

      renderedNodes = patchChildren(parent, renderedNodes, nodes, before) as AnyNode[];
    };

    // If we have an owner scope, run within it to maintain context hierarchy
    if (ownerScope && !ownerScope.isDestroyed) {
      runWithScope(ownerScope, executeUpdate);
    } else {
      executeUpdate();
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
 */
export function mapNodes(template: Node, indexes: number[]): Node[] {
  const len = indexes.length;
  const tree = new Array<Node>(len); // Pre-allocate with exact size
  const indexSet = new Set(indexes); // O(1) lookup

  let index = 1;
  let found = 0;

  const walk = (node: Node): boolean => {
    if (node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
      if (indexSet.has(index)) {
        tree[found++] = node;
        if (found === len) return true; // Early exit when all nodes found
      }
      index++;
    }

    let child = node.firstChild;
    while (child) {
      if (walk(child)) return true; // Propagate early exit
      child = child.nextSibling;
    }

    return false;
  };

  walk(template);
  return tree;
}
