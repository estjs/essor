import { hasChanged, startsWith } from '@estjs/shared';
import { shallowReactive } from '@estjs/signal';
import { createContext, popContext, setCurrentContext } from './context';
import { insertChild, removeChild } from './patch';
import { EVENT_PREFIX, REF_KEY } from './constants';
import { addEventListener } from './dom';
import { cleanupLifecycle } from './lifecycle';
import type { RenderContext } from './types';

/**
 * ComponentNode class represents a component instance in the DOM
 * Optimized for performance and memory usage
 */
export class ComponentNode<T extends Record<string, any> = Record<string, any>> {
  private nodes: Node | null = null;
  private context: RenderContext | null = null;
  private parent: Node | null = null;
  private before: Node | null = null;
  private proxyProps: T;
  private isMount = false;
  private key: string | number | null;

  /**
   * Check if the component is connected to the DOM
   */
  get isConnected(): boolean {
    return this.isMount;
  }

  /**
   * Get the first child node of the component
   */
  get firstChild(): Node | null {
    return this.nodes;
  }

  /**
   * Create a new ComponentNode instance
   * @param component The component function
   * @param props The component properties
   * @param key Optional key for reconciliation
   */
  constructor(
    public component: (props: T) => Node,
    public props?: T,
    key?: string | number | null,
  ) {
    this.key = key ?? props?.key ?? null;
    // Use shallowReactive for better performance
    this.proxyProps = shallowReactive(props || ({} as T));
  }

  /**
   * Mount the component to the DOM
   * @param parent The parent node
   * @param before The node to insert before
   * @returns The mounted node
   */
  mount(parent: Node, before?: Node | null): Node | null {
    this.parent = parent;
    this.before = before || null;

    // Fast path: reuse existing nodes if available
    if (this.nodes) {
      insertChild(parent, this.nodes, before);
      return this.nodes;
    }

    // Create a new context for the component
    this.context = createContext();
    setCurrentContext(this.context);

    try {
      // Render the component
      const renderNode = this.component(this.proxyProps);
      this.nodes = renderNode;

      // Insert the component into the DOM
      insertChild(parent, renderNode, before);

      // Apply props and event handlers
      this.patchProps(this.props);

      // Call mounted lifecycle hooks using microtask to ensure DOM is fully updated
      queueMicrotask(() => {
        if (this.isMount && this.context) {
          this.context.mounted.forEach(cb => cb());
        }
      });

      this.isMount = true;
      return renderNode;
    } finally {
      popContext();
    }
  }

  /**
   * Update the component with new props
   * @param prev The previous component instance
   * @returns The updated component
   */
  update(prev: ComponentNode<T>): ComponentNode<T> {
    // Fast path: different keys require remounting
    if (this.key !== prev.key) {
      this.mount(this.parent!, this.before);
      return this;
    }

    // Skip update if props haven't changed
    if (!hasChanged(this.props, prev.props)) {
      return this;
    }

    // Reuse context and nodes from previous instance
    this.context = prev.context;
    this.proxyProps = prev.proxyProps;
    this.props = prev.props;
    this.nodes = prev.nodes;
    this.isMount = prev.isMount;

    // Update props and event handlers
    this.patchProps(this.props);

    // Call updated lifecycle hooks
    if (this.context) {
      this.context.updated.forEach(cb => cb());
    }

    return this;
  }

  /**
   * Unmount the component from the DOM
   * Cleans up resources and calls lifecycle hooks
   */
  unmount(): void {
    // Call unmounted lifecycle hooks first
    if (this.context) {
      this.context.unmounted.forEach(cb => cb());
      this.context.isUnmounted = true;
    }

    // Remove from DOM
    if (this.nodes) {
      removeChild(this.nodes);
    }

    // Clean up lifecycle hooks
    cleanupLifecycle();

    // Clear references to help garbage collection
    this.isMount = false;
    this.nodes = null;
    this.parent = null;
    this.before = null;
  }

  /**
   * Apply props and event handlers to the component
   * @param props The component properties
   */
  patchProps(props: T | undefined): void {
    if (!props) {
      return;
    }

    // Apply new props and event handlers
    for (const [key, prop] of Object.entries(props)) {
      if (startsWith(key, EVENT_PREFIX) && this.nodes) {
        // Handle event props (e.g., onClick)
        const event = key.slice(2).toLowerCase();
        if (this.nodes instanceof Element) {
          addEventListener(this.nodes, event, prop as EventListener);
        }
      } else if (key === REF_KEY && typeof prop === 'object' && prop !== null) {
        // Handle ref prop with type safety
        (prop as { value: Node | null }).value = this.nodes;
      }
    }

    this.props = props;
  }
}
