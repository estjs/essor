import { coerceArray, error, isFunction, isObject, warn } from '@estjs/shared';
import { effect } from '@estjs/signals';
import { isComponent } from './component';
import { type Scope, getActiveScope, onCleanup, runWithScope } from './scope';
import {
  claimHydrationNode,
  claimHydratedNodes,
  hasActiveHydrationRange,
  isHydrationNodeClaimed,
  isHydrating,
  isNodeHydrated,
  runWithHydrationRange,
  runWithoutHydration,
} from './hydration';
import { reconcileArrays } from './reconcile';
import type { AnyNode } from './types';

// Preserve fragment ordering without detaching an already-connected SSR node.
const hydrationFragmentPlaceholders = new WeakMap<Comment, Node>();

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
export function insertNode(parent: Node, child: AnyNode, before?: AnyNode): Node | undefined {
  if (!parent || !child) return;

  const beforeNode = isComponent(before) ? before.firstChild : (before as Node);

  if (isComponent(child)) {
    child.mount(parent, beforeNode);
    return child.firstChild;
  }

  if (
    parent instanceof DocumentFragment &&
    child instanceof Node &&
    child.parentNode !== null &&
    child.parentNode !== parent &&
    isHydrationNodeClaimed(child)
  ) {
    const placeholder = document.createComment('');
    hydrationFragmentPlaceholders.set(placeholder, child);
    if (beforeNode) parent.insertBefore(placeholder, beforeNode);
    else parent.appendChild(placeholder);
    return placeholder;
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
  return child as Node;
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
 * Normalize node for reconciliation.
 *
 * Performance-critical: uses inlined typeof / instanceof checks
 * instead of utility function calls in the hot path.
 */
export function normalizeNode(node: unknown): Node {
  // Fast path: already a DOM Node (covers Element, Text, Comment, etc.)
  if (node instanceof Node) return claimHydrationNode(node);

  // Component instances must pass through as-is — the reconciler and
  // insertNode/removeNode handle them via isComponent() checks.
  if (isComponent(node)) return node as unknown as Node;

  // Primitives → text node (inlined for speed)
  const t = typeof node;
  if (node == null || t === 'string' || t === 'number' || t === 'boolean' || t === 'symbol') {
    return claimHydrationNode(
      document.createTextNode(node === false || node == null ? '' : String(node)),
    );
  }

  // Plain objects should not be rendered directly — convert to text and warn
  if (__DEV__ && isObject(node)) {
    warn(
      'Rendering a plain object as a node is not recommended. ' +
        'The object will be converted to its string representation.',
      node,
    );
  }
  return claimHydrationNode(document.createTextNode(String(node)));
}
/**
 * Expand a DocumentFragment into its children — after insertion the fragment
 * empties, so keeping the fragment itself in renderedNodes would leave an
 * empty shell that no longer represents the mounted range. Non-fragments are
 * normalized as usual.
 */
function expandFragment(item: unknown): Node[] {
  if (!(item instanceof DocumentFragment)) return [normalizeNode(item)];

  const children = Array.from(item.childNodes);
  return children.map((node) => {
    if (node.nodeType === Node.COMMENT_NODE) {
      const hydratedNode = hydrationFragmentPlaceholders.get(node as Comment);
      if (hydratedNode) {
        hydrationFragmentPlaceholders.delete(node as Comment);
        (node as ChildNode).remove();
        return hydratedNode;
      }
    }
    return claimHydrationNode(node);
  });
}

function collectRenderedDomNodes(renderedNodes: Node[], output: Node[], seen: Set<object>): void {
  for (const renderedNode of renderedNodes) {
    if (isComponent(renderedNode)) {
      if (seen.has(renderedNode)) continue;
      seen.add(renderedNode);
      collectRenderedDomNodes(renderedNode.renderedNodes, output, seen);
    } else if (renderedNode instanceof Node) {
      output.push(renderedNode);
    }
  }
}

function placeHydrationNodes(parent: Node, logicalNodes: Node[], before?: Node): void {
  const nodes: Node[] = [];
  collectRenderedDomNodes(logicalNodes, nodes, new Set());
  let anchor: Node | null = before?.parentNode === parent ? before : null;
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    if (node.parentNode === parent) {
      anchor = node;
      continue;
    }
    const placed = insertNode(parent, node, anchor ?? undefined);
    if (placed?.parentNode === parent) anchor = placed;
  }
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
export function insert(
  parent: Node,
  nodeFactory: AnyNode,
  before?: Node,
  hydrationStart?: Comment,
) {
  if (!parent) return;
  // Use a mutable reference so cleanup can release it for GC.
  // The scope is only needed while the effect is active — after cleanup,
  // holding it would prevent the entire ancestor scope chain from being collected.
  let parentScope: Scope | null = getActiveScope();

  // LIVE array: updates mutate this array in place (never reassign), so the
  // reference returned to the caller (e.g. Component.renderedNodes) always
  // reflects the current DOM range — a first-run snapshot would go stale on
  // the first reactive replacement (OWN-03).
  const renderedNodes: Node[] = [];
  let isFirstRun = true;

  /** Replace the live array's contents without changing its identity. */
  const commitNodes = (next: Node[]): void => {
    renderedNodes.length = 0;
    for (const node of next) renderedNodes.push(node);
  };

  /**
   * Resolves a raw node value into a flat array of DOM Nodes.
   * Fast-paths simple cases (single Node, single primitive) to avoid
   * intermediate array allocations.
   */
  const resolveNodes = (raw: unknown): Node[] => {
    // DocumentFragment: expand to its children (see expandFragment).
    if (raw instanceof DocumentFragment) {
      return expandFragment(raw);
    }

    // Fast path: already a DOM Node
    if (raw instanceof Node) return [normalizeNode(raw)];

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
      .flatMap(expandFragment) as Node[];
  };

  const resolveHydrationNodes = (raw: unknown, output: Node[] = []): Node[] => {
    if (raw instanceof DocumentFragment) {
      output.push(...expandFragment(raw));
      return output;
    }
    if (raw instanceof Node) {
      output.push(normalizeNode(raw));
      return output;
    }
    if (isComponent(raw)) {
      raw.mount(parent, before);
      output.push(raw as unknown as Node);
      return output;
    }
    if (isFunction(raw)) {
      return resolveHydrationNodes(raw(), output);
    }

    const values = coerceArray(raw);
    if (values.length !== 1 || values[0] !== raw) {
      for (const value of values) resolveHydrationNodes(value, output);
      return output;
    }

    output.push(normalizeNode(raw));
    return output;
  };

  // Create effect for reactive updates
  const effectRunner = effect(() => {
    const executeUpdate = () => {
      const rawNodes = isFunction(nodeFactory) ? nodeFactory() : nodeFactory;
      const rawType = typeof rawNodes;
      const canPatchText =
        rawNodes == null ||
        rawType === 'string' ||
        rawType === 'number' ||
        rawType === 'boolean' ||
        rawType === 'symbol';
      const cursorPass = isFirstRun && isHydrating() && hasActiveHydrationRange();
      const nodes = cursorPass ? resolveHydrationNodes(rawNodes) : resolveNodes(rawNodes);
      if (cursorPass) {
        placeHydrationNodes(parent, nodes, before);
        commitNodes(nodes);
        isFirstRun = false;
        return;
      }
      // Hydration mode: skip DOM operations on first run only when every
      // node already exists under the target parent. Component instances and
      // fallback CSR nodes still need the normal reconcile path.
      if (
        isFirstRun &&
        isHydrating() &&
        nodes.every((node) => node instanceof Node && node.parentNode === parent)
      ) {
        commitNodes(nodes);
        isFirstRun = false;
        return;
      }
      if (isFirstRun && isHydrating() && !nodes.some(isComponent)) {
        const hydratedNodes = claimHydratedNodes(parent, nodes, before);
        if (hydratedNodes) {
          commitNodes(hydratedNodes);
          isFirstRun = false;
          return;
        }
      }
      if (
        canPatchText &&
        renderedNodes.length === 1 &&
        nodes.length === 1 &&
        renderedNodes[0].nodeType === Node.TEXT_NODE &&
        nodes[0].nodeType === Node.TEXT_NODE
      ) {
        const current = renderedNodes[0];
        const nextText = nodes[0].textContent;
        if (current.textContent !== nextText) current.textContent = nextText;
        isFirstRun = false;
        return;
      }
      // Pass a snapshot of the live array: reconcileArrays removes/mounts
      // nodes as it diffs, and Component mount/destroy inside that loop can
      // re-enter insert() and mutate `renderedNodes` mid-reconcile.
      commitNodes(reconcileArrays(parent, renderedNodes.slice(), nodes, before) as Node[]);
      isFirstRun = false;
    };

    const runUpdate = () =>
      isFirstRun && isHydrating() && hydrationStart
        ? runWithHydrationRange(parent, before, hydrationStart, executeUpdate, () => {
            // Partial mismatch: components that adopted SSR nodes may hold
            // stale content. Re-render them as pure CSR with hydration
            // suspended so the fallback cannot consume a sibling range's
            // hydration keys. Components that rendered fresh client nodes
            // (or nothing) are already correct.
            runWithoutHydration(() => {
              for (const node of renderedNodes) {
                if (isComponent(node) && node.renderedNodes.some((n) => isNodeHydrated(n))) {
                  node.forceUpdate();
                }
              }
            });
          })
        : executeUpdate();

    // If we have a parent scope, run within it to maintain context hierarchy
    if (parentScope && !parentScope.isDestroyed) {
      runWithScope(parentScope, runUpdate);
    } else {
      runUpdate();
    }
  });

  onCleanup(() => {
    effectRunner.stop();
    for (const node of renderedNodes) removeNode(node);
    renderedNodes.length = 0;
    // Release scope reference so GC can reclaim the ancestor scope chain
    parentScope = null;
  });

  return renderedNodes;
}

function normalizeTextContent(value: unknown): string {
  if (value == null || value === false) return '';
  if (isFunction(value)) return normalizeTextContent(value());
  if (Array.isArray(value)) {
    let text = '';
    for (const item of value) text += normalizeTextContent(item);
    return text;
  }
  return String(value);
}

export function insertTextContent(parent: Element, valueFactory: unknown): Text {
  let textNode!: Text;
  let isFirstRun = true;

  const effectRunner = effect(() => {
    const text = normalizeTextContent(valueFactory);
    if (isFirstRun) {
      const existing = parent.firstChild;
      if (
        isHydrating() &&
        isNodeHydrated(parent) &&
        existing instanceof Text &&
        existing === parent.lastChild &&
        existing.data === text
      ) {
        textNode = existing;
      } else {
        textNode = document.createTextNode(text);
        parent.replaceChildren(textNode);
      }
      isFirstRun = false;
      return;
    }

    if (parent.firstChild !== textNode || parent.lastChild !== textNode) {
      parent.replaceChildren(textNode);
    }
    if (textNode.data !== text) textNode.data = text;
  });

  onCleanup(() => {
    effectRunner.stop();
    if (textNode.parentNode === parent) textNode.remove();
  });

  return textNode;
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
