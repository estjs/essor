import { isComputed, isSignal, shallowReactive } from '@estjs/signals';
import {
  coerceArray,
  hasChanged,
  isArray,
  isFunction,
  isHTMLElement,
  isObject,
  startsWith,
} from '@estjs/shared';
import { type Scope, createScope, disposeScope, getActiveScope, runWithScope } from './scope';
import { COMPONENT_STATE, COMPONENT_TYPE, EVENT_PREFIX, REF_KEY } from './constants';
import { addEventListener, insert } from './binding';
import { getComponentKey, normalizeKey } from './key';
import { getFirstDOMNode, insertNode, removeNode } from './utils/dom';
import { shallowCompare } from './utils/node';
import { triggerMountHooks, triggerUpdateHooks } from './lifecycle';
import type { AnyNode, ComponentFn, ComponentProps } from './types';

export class Component<P extends ComponentProps = ComponentProps> {
  // Component rendered nodes (supports arrays and fragments)
  protected renderedNodes: AnyNode[] = [];

  // Component scope (unified context management)
  protected scope: Scope | null = null;

  // Component parent node
  protected parentNode: Node | undefined = undefined;

  // Component before node
  public beforeNode: Node | undefined = undefined;

  // Component props (reactive and snapshot)
  private reactiveProps: Record<string, any> = {};
  private _propSnapshots: Record<string, any> = {};

  // Component key for reconciliation
  public readonly key: string | undefined;

  // Component lifecycle state
  protected state: number = COMPONENT_STATE.INITIAL;

  // Parent scope captured at construction time for correct hierarchy
  protected parentScope: Scope | null = null;

  // Component type marker (using symbol for type-safe discrimination)
  declare private [COMPONENT_TYPE.NORMAL]: true;

  get isConnected(): boolean {
    return this.state === COMPONENT_STATE.MOUNTED;
  }

  get firstChild(): Node | undefined {
    // Get the first meaningful DOM node from rendered nodes
    for (const node of this.renderedNodes) {
      const dom = getFirstDOMNode(node);
      if (dom) return dom;
    }
    return undefined;
  }

  constructor(
    public component: ComponentFn<P>,
    public props: P = {} as P,
  ) {
    this.key = props.key ? normalizeKey(props.key) : getComponentKey(component);
    this.reactiveProps = shallowReactive({ ...props }) as P;
    this.parentScope = getActiveScope();

    // Initialize snapshots for object/array props to track mutations
    for (const key in props) {
      const val = props[key];
      if (isObject(val)) {
        this._propSnapshots[key] = isArray(val) ? [...val] : { ...val };
      }
    }
  }

  mount(parentNode: Node, beforeNode?: Node): AnyNode[] {
    this.parentNode = parentNode;
    this.beforeNode = beforeNode;
    this.state = COMPONENT_STATE.MOUNTING;

    // if the component already has rendered nodes, re-insert them
    if (this.renderedNodes.length > 0) {
      for (const node of this.renderedNodes) {
        insertNode(parentNode, node, beforeNode);
      }
      this.state = COMPONENT_STATE.MOUNTED;
      return this.renderedNodes;
    }

    // Create scope with correct parent (captured at construction or current active)
    const parent = this.parentScope ?? getActiveScope();
    this.scope = createScope(parent);

    // Run component within its scope
    const renderedNodes = runWithScope(this.scope, () => {
      return this._renderComponent(parentNode, beforeNode);
    });

    this.renderedNodes = renderedNodes;

    // Apply props (events, refs) after renderedNodes is set
    runWithScope(this.scope, () => {
      this.applyProps(this.props);
    });

    // Update state to mounted
    this.state = COMPONENT_STATE.MOUNTED;

    // Trigger mount lifecycle hooks
    if (this.scope) {
      triggerMountHooks(this.scope);
    }

    return this.renderedNodes;
  }

  /**
   * Render component and return nodes
   */
  private _renderComponent(parentNode: Node, beforeNode?: Node): AnyNode[] {
    let result = this.component(this.reactiveProps as P);

    // Unwrap function (render function pattern)
    if (isFunction(result)) {
      result = (result as Function)(this.reactiveProps);
    }

    // Unwrap signals and computed values
    if (isSignal<Element>(result) || isComputed<Element>(result)) {
      result = result.value;
    }

    return insert(parentNode, result as any, beforeNode) ?? [];
  }

  /**
   * Unwrap and normalize render result
   */
  private _unwrapRenderResult(result: any): AnyNode[] {
    // Unwrap function (render function pattern)
    if (isFunction(result)) {
      result = (result as Function)(this.reactiveProps);
    }

    // Unwrap signals and computed values
    if (isSignal<AnyNode>(result) || isComputed<AnyNode>(result)) {
      result = result.value;
    }

    return coerceArray(result) as AnyNode[];
  }

  update(prevNode: Component<P>): Component<P> {
    // if key is different, mount the component
    if (this.key !== prevNode.key) {
      this.mount(prevNode.parentNode!, prevNode.beforeNode);
      return this;
    }

    // Take previous node's properties and reactive state
    this.parentNode = prevNode.parentNode;
    this.beforeNode = prevNode.beforeNode;
    this.scope = prevNode.scope; // Reuse existing scope
    this.parentScope = prevNode.parentScope;
    this.renderedNodes = prevNode.renderedNodes;
    this.state = prevNode.state;
    this.reactiveProps = prevNode.reactiveProps; // Reuse same reactive object
    this._propSnapshots = prevNode._propSnapshots;

    // Update reactive props with shallow comparison for objects
    this._updateReactiveProps(this.props);

    // Mount component if not connected
    if (!this.isConnected && this.parentNode) {
      this.mount(this.parentNode, this.beforeNode);
      return this;
    }

    // Apply props and trigger update lifecycle
    if (this.scope) {
      runWithScope(this.scope, () => {
        this.applyProps(this.props);
      });
      triggerUpdateHooks(this.scope);
    }

    return this;
  }

  /**
   * Update reactive props by comparing with current values
   */
  private _updateReactiveProps(props: P): void {
    for (const key in props) {
      if (key === 'key') continue;

      const newValue = props[key];
      const oldValue = this.reactiveProps[key];

      if (isObject(newValue)) {
        // For objects/arrays: compare with snapshot to detect mutations
        const snapshot = this._propSnapshots[key];
        if (!snapshot || !shallowCompare(newValue, snapshot)) {
          const newSnapshot = isArray(newValue) ? [...newValue] : { ...newValue };
          this.reactiveProps[key] = newSnapshot;
          this._propSnapshots[key] = newSnapshot;
        }
      } else {
        // For primitives: standard equality check
        if (hasChanged(newValue, oldValue)) {
          this.reactiveProps[key] = newValue;
          delete this._propSnapshots[key]; // Clear snapshot if type changed
        }
      }
    }
  }

  forceUpdate(): void {
    if (this.state === COMPONENT_STATE.DESTROYED || !this.parentNode || !this.scope) {
      return;
    }

    const originalNodes = [...this.renderedNodes];

    try {
      runWithScope(this.scope, () => {
        // Re-render and get new nodes
        const result = this.component(this.reactiveProps as P);
        const newNodes = this._unwrapRenderResult(result);

        // Calculate anchor position for insertion
        const anchor = this._getAnchorNode();

        // Replace old nodes with new ones
        if (!this.parentNode) return;

        // Remove old nodes
        for (const node of this.renderedNodes) {
          removeNode(node);
        }

        // Insert new nodes
        for (const node of newNodes) {
          insertNode(this.parentNode, node, anchor);
        }

        this.renderedNodes = newNodes;
      });

      if (this.scope) {
        triggerUpdateHooks(this.scope);
      }
    } catch (error) {
      // Rollback on error
      this.renderedNodes = originalNodes;
      throw error;
    }
  }

  /**
   * Get anchor node for insertion
   */
  private _getAnchorNode(): Node | undefined {
    if (this.beforeNode) return this.beforeNode;

    if (this.renderedNodes.length > 0) {
      const lastNode = this.renderedNodes[this.renderedNodes.length - 1];
      const lastDom = getFirstDOMNode(lastNode);
      if (lastDom) {
        return lastDom.nextSibling as Node | undefined;
      }
    }

    return undefined;
  }

  /**
   * Destroy component
   */
  destroy(): void {
    // Prevent duplicate destruction
    if (this.state === COMPONENT_STATE.DESTROYING || this.state === COMPONENT_STATE.DESTROYED) {
      return;
    }

    this.state = COMPONENT_STATE.DESTROYING;

    const scope = this.scope;
    if (scope) {
      // Dispose scope (handles cleanup, destroy hooks, and children)
      // The disposeScope function triggers destroy hooks internally
      disposeScope(scope);
      this.scope = null;
    }

    // Remove all rendered nodes
    for (const node of this.renderedNodes) {
      removeNode(node);
    }

    // Reset all component properties
    this.renderedNodes = [];
    this.parentNode = undefined;
    this.beforeNode = undefined;
    this.parentScope = null;
    this.reactiveProps = {} as P;
    this.props = {} as P;
    this.state = COMPONENT_STATE.DESTROYED;
  }

  applyProps(props: P): void {
    if (!props) return;

    const firstElement = this.firstChild;

    // Apply event listeners and refs
    for (const [propName, propValue] of Object.entries(props)) {
      if (startsWith(propName, EVENT_PREFIX)) {
        if (!firstElement || !isHTMLElement(firstElement)) return;

        const eventName = propName.slice(EVENT_PREFIX.length).toLowerCase();
        addEventListener(firstElement, eventName, propValue as EventListener);
      } else if (propName === REF_KEY && isSignal(propValue)) {
        propValue.value = firstElement;
      }
    }

    this.props = props;
  }
}

/**
 * check if a node is a component
 * @param {unknown} node - the node to check
 * @returns {boolean} true if the node is a component, false otherwise
 */
export function isComponent(node: unknown): node is Component {
  return !!node && !!node[COMPONENT_TYPE.NORMAL];
}

/**
 * create a component
 * @param {Function} componentFn - the component function
 * @param {ComponentProps} props - the component props
 * @returns {Component} the component
 */
export function createComponent<P extends ComponentProps>(
  componentFn: ComponentFn<P>,
  props?: P,
): Component<P> {
  if (isComponent(componentFn)) {
    return componentFn as unknown as Component<P>;
  }
  return new Component(componentFn, props);
}
