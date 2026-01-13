import { error, isString } from '@estjs/shared';
import {
  createComponent,
  endHydration,
  startHydration,
  template,
  mapNodes as templateMapNodes,
} from '@estjs/template';
import { getHydrationKey, resetHydrationKey } from './shared';
import type { ComponentFn } from '@estjs/template';
/**
 * data-idx regex
 */
export const DATA_IDX_REGEX = /^\d+-\d+$/;
/**
 * Get rendered element by hydration key or create from template
 * @param {string} temp - the template string
 * @returns {Function} a function that returns the element
 */
export function getRenderedElement(temp: string) {
  return () => {
    // Get hydration key
    const key = getHydrationKey();

    // Try to find existing element with matching hydration key
    const node = document.querySelector(`[data-hk="${key}"]`);

    if (node) {
      return node;
    }

    // Create new element from template if not found
    return template(temp)();
  };
}

/**
 * Maps server-side rendered nodes during hydration
 * @param {HTMLElement} templateEl - The root template element
 * @param {number[]} idx - Array of indices to map
 * @returns {Node[]} Array of mapped nodes
 */
export function mapSSRNodes(templateEl: HTMLElement, idx: number[]): Node[] {
  // Check if we're in hydration mode by looking for the data-hk attribute
  const hk = templateEl.dataset.hk;

  // If not hydrating, fallback to standard node mapping
  if (!hk) {
    return templateMapNodes(templateEl, idx);
  }

  // Collection for all nodes
  const nodesList: Array<{ hk: string; idx: string; node: Node }> = [];

  // Find element nodes with data-idx attributes
  const elements = templateEl.querySelectorAll(`[data-idx^="${hk}"]`);

  // Process element nodes
  if (elements.length > 0) {
    nodesList.push(
      ...Array.from(elements)
        .filter((item: Element) => {
          const idxAttr = (item as HTMLElement).dataset.idx;
          return idxAttr !== null && DATA_IDX_REGEX.test(idxAttr!);
        })
        .map((item: Element) => {
          const idxAttr = (item as HTMLElement).dataset.idx || '';
          const [hkPart, idxPart] = idxAttr.split('-');
          return {
            hk: hkPart,
            idx: idxPart,
            node: item,
          };
        }),
    );
  }

  // Find and process comment nodes
  const commentNodes: Array<{ hk: string; idx: string; node: Node }> = [];

  const walkNodes = (node: Node): void => {
    // Check for comment nodes with data-idx pattern
    if (
      node.nodeType === Node.COMMENT_NODE &&
      node.textContent &&
      DATA_IDX_REGEX.test(node.textContent)
    ) {
      const [hkPart, idxPart] = node.textContent.split('-');
      commentNodes.push({
        hk: hkPart,
        idx: idxPart,
        node,
      });
    }

    // Recursively process child nodes
    let child = node.firstChild;
    while (child) {
      walkNodes(child);
      child = child.nextSibling;
    }
  };

  walkNodes(templateEl);
  nodesList.push(...commentNodes);

  // Build final node list with template as first element
  const nodes: Node[] = [templateEl];

  // Map indices to corresponding nodes
  idx.forEach(indexValue => {
    const node = nodesList.find(item => item.idx === String(indexValue));
    if (node) {
      nodes.push(node.node);
    }
  });

  return nodes;
}

/**
 * Hydrate a server-rendered component
 * @param {ComponentFn} component - Component function to hydrate
 * @param {HTMLElement | string} container - Container element or selector
 * @returns {any} Component instance or undefined if hydration fails
 */
export function hydrate(component: ComponentFn, container: HTMLElement | string): any {
  // Set hydration mode
  startHydration();
  // Reset hydration key counter
  resetHydrationKey();

  try {
    // Get container element
    const rootElement = isString(container) ? document.querySelector(container) : container;

    if (!rootElement) {
      error('Hydration error: Root element not found');
      return undefined;
    }

    // Create and mount component
    const rootComponent = createComponent(component);
    rootComponent.mount(rootElement);

    // Exit hydration mode
    endHydration();

    return rootComponent;
  } catch (error_) {
    error('Hydration error:', error_);
    // Ensure hydration mode is ended even if an error occurs
    endHydration();
    return undefined;
  }
}
