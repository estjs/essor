import { type Computed, type Signal, isComputed, isSignal, shallowReactive } from '@estjs/signals';
import {
  coerceArray,
  error,
  hasChanged,
  isArray,
  isFunction,
  isHTMLElement,
  isObject,
  startsWith,
} from '@estjs/shared';
import {
  type Context,
  createContext,
  destroyContext,
  getActiveContext,
  popContextStack,
  pushContextStack,
} from './context';
import { LIFECYCLE, triggerLifecycleHook } from './lifecycle';
import { COMPONENT_STATE, COMPONENT_TYPE, EVENT_PREFIX, REF_KEY } from './constants';
import { addEventListener, insert } from './binding';
import { getComponentKey, normalizeKey } from './key';
import { getFirstDOMNode, insertNode, removeNode, shallowCompare } from './utils';
import type { AnyNode } from './types';

// Component result can be a single node, signal/computed, an array, or a Component
export type componentResultNodeType = AnyNode | Signal<AnyNode> | Computed<AnyNode> | AnyNode[];
export type ComponentFn = (props?: ComponentProps) => componentResultNodeType;
export type ComponentProps = Record<string, unknown>;

export class Component {
  // component rendered nodes (supports arrays and fragments)
  protected renderedNodes: AnyNode[] = [];

  // end anchor for DOM insertion positioning (empty text node)
  protected endAnchor: Text | null = null;

  // component context
  protected componentContext: Context | null = null;

  // component parent node
  protected parentNode: Node | undefined = undefined;

  // component before node
  protected beforeNode: Node | undefined = undefined;

  // component props
  private reactiveProps: Record<string, any> = {};
  private _propSnapshots: Record<string, any> = {};

  // component key
  public readonly key: string | undefined;
  // component state
  protected state: number = COMPONENT_STATE.INITIAL;

  // component context
  protected context: Context | null = null;
  // component parent context
  protected parentContext: Context | null = null;

  // component type
  // @ts-ignore
  private [COMPONENT_TYPE.NORMAL] = true;

  get isConnected(): boolean {
    return this.state === COMPONENT_STATE.MOUNTED;
  }

  get firstChild(): Node | undefined {
    // Get the first meaningful DOM node from rendered nodes
    // Skip empty text nodes (anchors or null renders)
    for (const node of this.renderedNodes) {
      const dom = getFirstDOMNode(node);
      if (dom) {
        return dom;
      }
    }
    return undefined;
  }

  constructor(
    public component: ComponentFn,
    public props: ComponentProps | undefined,
  ) {
    this.key = props?.key ? normalizeKey(props.key) : getComponentKey(component);
    this.reactiveProps = shallowReactive({ ...(this.props || {}) });
    this.parentContext = getActiveContext();

    // Init snapshots for object props
    if (this.props) {
      for (const key in this.props) {
        const val = this.props[key];
        if (isObject(val)) {
          this._propSnapshots[key] = isArray(val) ? [...val] : { ...val };
        }
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

    // context
    this.componentContext = createContext(this.parentContext || getActiveContext());
    pushContextStack(this.componentContext);

    // render the component
    let result = this.component(this.reactiveProps);

    // unwrap function (render function pattern)
    if (isFunction(result)) {
      result = (result as Function)(this.reactiveProps);
    }

    // unwrap signals and computed values
    if (isSignal<AnyNode>(result) || isComputed<AnyNode>(result)) {
      result = result.value;
    }

    this.renderedNodes = insert(parentNode, result as any, beforeNode) ?? [];

    // apply props (events, refs)
    this.applyProps(this.props || {});

    // update marks
    this.state = COMPONENT_STATE.MOUNTED;
    if (this.componentContext) {
      this.componentContext.isMount = true;
    }
    // trigger mount hook
    triggerLifecycleHook(LIFECYCLE.mount);

    popContextStack();
    return this.renderedNodes;
  }

  update(prevNode: Component): Component {
    // if key is different, mount the component
    if (this.key !== prevNode.key) {
      this.mount(prevNode.parentNode!, prevNode.beforeNode);
      return this;
    }

    // Take previous node's properties and reactive state
    this.parentNode = prevNode.parentNode;
    this.beforeNode = prevNode.beforeNode;
    this.componentContext = prevNode.componentContext;
    this.renderedNodes = prevNode.renderedNodes;
    this.endAnchor = prevNode.endAnchor;
    this.state = prevNode.state;
    this.reactiveProps = prevNode.reactiveProps; // Reuse same reactive object
    this._propSnapshots = prevNode._propSnapshots;

    // Smart update: shallow compare object props to detect mutations
    if (this.props) {
      for (const key in this.props) {
        if (key === 'key') continue;
        const newValue = this.props[key];
        const oldValue = this.reactiveProps[key];

        if (isObject(newValue)) {
          // For objects: compare with snapshot
          const snapshot = this._propSnapshots[key];
          if (!snapshot || !shallowCompare(newValue, snapshot)) {
            // Content changed (or new prop) -> Force update
            const newSnapshot = isArray(newValue) ? newValue.slice() : Object.assign({}, newValue);
            this.reactiveProps[key] = newSnapshot;
            this._propSnapshots[key] = newSnapshot;
          }
          // If content same -> Do nothing (skip update)
        } else {
          // For primitives: standard check
          if (hasChanged(newValue, oldValue)) {
            this.reactiveProps[key] = newValue;
            // Clear snapshot if it existed (type change)
            if (this._propSnapshots[key]) {
              delete this._propSnapshots[key];
            }
          }
        }
      }
    }

    // check if the component is already mount
    if (!this.isConnected && this.parentNode) {
      this.mount(this.parentNode, this.beforeNode);
    }

    // if the component is mount and has context, apply new props and trigger update lifecycle
    if (this.componentContext) {
      pushContextStack(this.componentContext);
      this.applyProps(this.props || {});
      triggerLifecycleHook(LIFECYCLE.update);
      popContextStack();
    }

    return this;
  }
  async forceUpdate() {
    if (this.state === COMPONENT_STATE.DESTROYED || !this.parentNode || !this.componentContext) {
      return;
    }

    try {
      // Create new context for re-render
      if (this.componentContext) {
        pushContextStack(this.componentContext);
      }

      // Re-render the component
      let result = (this.component as Function)(this.reactiveProps);

      // Unwrap function (render function pattern)
      if (isFunction(result)) {
        result = (result as Function)(this.reactiveProps);
      }

      // Unwrap signals and computed values
      if (isSignal<AnyNode>(result) || isComputed<AnyNode>(result)) {
        result = result.value;
      }

      // Normalize to array
      const newNodes = coerceArray(result) as AnyNode[];

      // Replace old nodes with new ones (complete re-render)
      if (this.parentNode && this.endAnchor) {
        // Remove old rendered nodes
        for (const node of this.renderedNodes) {
          removeNode(node);
        }

        // Insert new nodes before anchor
        for (const node of newNodes) {
          insertNode(this.parentNode, node, this.endAnchor);
        }

        this.renderedNodes = newNodes;
      }

      // Trigger update lifecycle
      await triggerLifecycleHook(LIFECYCLE.update);
    } catch (_error) {
      error('Force update failed:', _error);
      throw _error;
    } finally {
      if (this.componentContext) {
        popContextStack();
      }
    }
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

    const context = this.componentContext;
    if (context) {
      pushContextStack(context);

      // Trigger destroyed lifecycle
      triggerLifecycleHook(LIFECYCLE.destroy);
      destroyContext(context);
      this.componentContext = null;

      popContextStack();
    }

    // Remove all rendered nodes
    for (const node of this.renderedNodes) {
      removeNode(node);
    }

    // Remove end anchor
    if (this.endAnchor?.parentNode) {
      this.endAnchor.remove();
    }

    // Reset all component properties
    this.renderedNodes = [];
    this.endAnchor = null;
    this.parentNode = undefined;
    this.beforeNode = undefined;
    this.reactiveProps = {};
    this.props = undefined;
    this.state = COMPONENT_STATE.DESTROYED;
  }

  applyProps(props: ComponentProps): void {
    // check if props is defined
    if (!props) {
      return;
    }

    // Get first element for event handling and refs
    const firstElement = this.firstChild;

    // iterate over all properties and apply them
    for (const [propName, propValue] of Object.entries(props)) {
      if (startsWith(propName, EVENT_PREFIX) && firstElement) {
        // event handling: extract the event name after on
        const eventName = propName.slice(2).toLowerCase();

        if (isHTMLElement(firstElement)) {
          addEventListener(firstElement, eventName, propValue as EventListener);
        }
      } else if (propName === REF_KEY && isSignal(propValue)) {
        // handle reference: store the DOM reference into the signal value
        propValue.value = firstElement;
      }
    }

    // save props reference
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
export function createComponent(componentFn: ComponentFn, props?: ComponentProps): Component {
  if (isComponent(componentFn)) {
    return componentFn;
  }
  return new Component(componentFn, props);
}
