import { coerceArray, error, hasOwn, isFunction, isObject, isPrimitive, warn } from '@estjs/shared';
import { effect } from '@estjs/signals';
import { isComponent } from './component';
import { KEY_PROP } from './constants';
import { type Scope, getActiveScope, onCleanup, runWithScope } from './scope';
import { isHydrating } from './hydration';
import { reconcileArrays } from './reconcile';
import type { AnyNode } from './types';

/**
 * Remove node from its parent
 *
 * @param node Node to remove
 *
 * @example
 * ```typescript
 * removeNode(elementToRemove);
 * ```
 */
export function removeNode(node: AnyNode): void {
  if (!node) return;

  if (isComponent(node)) {
    node.destroy();
  } else {
    const element = node as ChildNode;
    if (element.parentNode) {
      element.remove();
    }
  }
}

/**
 * Insert child node
 * Handle insertion of component nodes and DOM nodes
 *
 * @param parent Parent node
 * @param child Child node
 * @param before Reference node for insertion
 */
export function insertNode(parent: Node, child: AnyNode, before?: AnyNode): void {
  if (!parent || !child) return;

  const beforeNode = isComponent(before) ? before.firstChild : (before as Node);

  if (isComponent(child)) {
    child.mount(parent, beforeNode);
    return;
  }

  if (beforeNode) {
    parent.insertBefore(child as Node, beforeNode);
  } else {
    if (__DEV__) {
      if (!child) {
        error('insertNode: child is not a Node', child);
      }
    }
    parent.appendChild(child as Node);
  }
}

/**
 * Replace child node
 * Handle replacement of component nodes and DOM nodes
 *
 * @param parent Parent node
 * @param newNode New node
 * @param oldNode Old node to be replaced
 */
export function replaceNode(parent: Node, newNode: AnyNode, oldNode: AnyNode): void {
  if (!parent || !newNode || !oldNode || newNode === oldNode) return;

  const beforeNode: AnyNode | undefined = isComponent(oldNode)
    ? oldNode.beforeNode
    : (oldNode as Node).nextSibling!;
  removeNode(oldNode);
  insertNode(parent, newNode, beforeNode);
}

/**
 * Check if two nodes are the same (inline for performance)
 * This combines key check and type check
 */
export function isSameNode(a: AnyNode, b: AnyNode): boolean {
  // Check key equality first (fast path)
  const keyA = getNodeKey(a);
  const keyB = getNodeKey(b);

  if (keyA !== keyB) {
    return false;
  }

  // Inline type check to avoid function call
  const aIsComponent = isComponent(a);
  const bIsComponent = isComponent(b);

  if (aIsComponent && bIsComponent) {
    return a.component === b.component;
  }

  if (aIsComponent !== bIsComponent) {
    return false;
  }

  if (isPrimitive(a) || isPrimitive(b)) {
    return a === b;
  }

  const aNode = a as Node;
  const bNode = b as Node;

  if (aNode.nodeType !== bNode.nodeType) {
    return false;
  }

  if (aNode.nodeType === Node.ELEMENT_NODE) {
    return (aNode as Element).tagName === (bNode as Element).tagName;
  }

  return true;
}

/**
 * Extract the optional stable key associated with a runtime node.
 */
function getNodeKey(node: AnyNode): unknown {
  if (!node) {
    return undefined;
  }

  if (isComponent(node)) {
    return hasOwn(node.props, KEY_PROP) ? node.props[KEY_PROP] : undefined;
  }

  if (node instanceof Element) {
    return node.getAttribute(KEY_PROP);
  }

  if (isObject(node) && hasOwn(node, KEY_PROP)) {
    return Reflect.get(node as object, KEY_PROP);
  }

  return undefined;
}

/**
 * Normalize a value into a DOM Node for reconciliation.
 *
 * If `node` is already a DOM Node or a component instance, it is returned unchanged.
 * If `node` is `null`, `undefined`, or `false`, an empty `Text` node is returned.
 * Strings, numbers, booleans, and symbols are converted to a `Text` node containing their string representation.
 * For other values a `Text` node of `String(node)` is returned; in development, rendering a plain object emits a warning.
 *
 * @returns A DOM `Node` representing the provided value (the original node for DOM Nodes/components, or a `Text` node otherwise).
 */
export function normalizeNode(node: unknown): Node {
  // Fast path: already a DOM Node (covers Element, Text, Comment, etc.)
  if (node instanceof Node) return node;

  // Component instances must pass through as-is — the reconciler and
  // insertNode/removeNode handle them via isComponent() checks.
  if (isComponent(node)) return node as unknown as Node;

  // Primitives → text node (inlined for speed)
  const t = typeof node;
  if (node == null || t === 'string' || t === 'number' || t === 'boolean' || t === 'symbol') {
    return document.createTextNode(node === false || node == null ? '' : String(node));
  }

  // Plain objects should not be rendered directly — convert to text and warn
  if (__DEV__ && isObject(node)) {
    warn(
      'Rendering a plain object as a node is not recommended. ' +
        'The object will be converted to its string representation.',
      node,
    );
  }
  return document.createTextNode(String(node));
}
/**
 * Reactive node insertion with binding support
 *
 * @param parent Parent node
 * @param nodeFactory Node factory function or static node
 * @param before Reference node for insertion position
 * @example
 * ```typescript
 * insert(container, () => message.value, null);
 * insert(container, staticElement, referenceNode);
 * insert(container, "Hello World", null); // Direct string support
 * ```
 */
export function insert(parent: Node, nodeFactory: AnyNode, before?: Node) {
  if (!parent) return;
  // Capture owner scope at call time - this is critical for correct context inheritance
  // When dynamic components are created inside effects, they need to inherit from
  // the scope that was active when insert() was called, not when the effect runs
  const ownerScope: Scope | null = getActiveScope();

  let renderedNodes: Node[] = [];
  let isFirstRun = true;

  /**
   * Resolves a raw node value into a flat array of DOM Nodes.
   * Fast-paths simple cases (single Node, single primitive) to avoid
   * intermediate array allocations.
   */
  const resolveNodes = (raw: unknown): Node[] => {
    // Fast path: already a DOM Node
    if (raw instanceof Node) return [raw];

    // Fast path: Component instance (skip normalizeNode entirely)
    if (isComponent(raw)) return [raw as unknown as Node];

    // Fast path: single primitive → text node (inlined typeof for speed)
    const t = typeof raw;
    if (raw == null || t === 'string' || t === 'number' || t === 'boolean') {
      return [normalizeNode(raw)];
    }

    // General path: coerce, resolve nested functions, flatten, normalize
    return coerceArray(raw)
      .map((item) => (isFunction(item) ? item() : item))
      .flatMap((i) => i)
      .map(normalizeNode) as Node[];
  };

  // Create effect for reactive updates
  const effectRunner = effect(() => {
    const executeUpdate = () => {
      const rawNodes = isFunction(nodeFactory) ? nodeFactory() : nodeFactory;
      const nodes = resolveNodes(rawNodes);
      // Hydration mode: skip DOM operations on first run only when every
      // node already exists under the target parent. Component instances and
      // fallback CSR nodes still need the normal reconcile path.
      if (
        isFirstRun &&
        isHydrating() &&
        nodes.every((node) => node instanceof Node && node.parentNode === parent)
      ) {
        renderedNodes = nodes;
        isFirstRun = false;
        return;
      }
      renderedNodes = reconcileArrays(parent, renderedNodes as Node[], nodes, before) as Node[];
      isFirstRun = false;
    };

    // If we have an owner scope, run within it to maintain context hierarchy
    if (ownerScope && !ownerScope.isDestroyed) {
      runWithScope(ownerScope, executeUpdate);
    } else {
      executeUpdate();
    }
  });

  onCleanup(() => {
    effectRunner.stop();
    for (const node of renderedNodes) removeNode(node);
    renderedNodes = [];
  });

  return renderedNodes;
}
/**
 * Returns the first child of a node.
 *
 * @param node - The node to get the child from.
 * @returns The first child node or null.
 */
export function child(node: Node | null): Node | null {
  return node?.firstChild || null;
}

/**
 * Returns the next sibling after advancing by `step`.
 *
 * @param node - The starting node.
 * @param step - Number of steps to advance.
 * @returns The resulting sibling node or null.
 */
export function next(node: Node | null, step: number = 1): Node | null {
  while (node && step > 0) {
    node = node.nextSibling;
    step--;
  }
  return node || null;
}

/**
 * Returns the child node at the requested index.
 *
 * @param node - The parent node.
 * @param index - The child index.
 * @returns The child node at index or null.
 */
export function nthChild(node: Node | null, index: number): Node | null {
  if (!node || index < 0) return null;
  let current = node.firstChild;
  while (current && index > 0) {
    current = current.nextSibling;
    index--;
  }
  return current || null;
}
