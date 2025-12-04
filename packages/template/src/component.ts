import { isSignal, shallowReactive } from '@estjs/signals';
import { error, hasChanged, isFunction, isHTMLElement, isObject, startsWith } from '@estjs/shared';
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
import { addEventListener } from './binding';
import { getComponentKey, normalizeKey } from './key';
import { insertNode, removeNode, replaceNode, shallowCompare } from './utils';

export type ComponentFn = (props?: ComponentProps) => Node;
export type ComponentProps = Record<string, unknown>;

export class Component {
  // component rendered node
  protected renderedNode: Node | null = null;

  // component context
  protected componentContext: Context | null = null;

  // component parent node
  protected parentNode: Node | null = null;

  // component before node
  protected beforeNode: Node | null = null;

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

  get firstChild(): Node | null {
    return this.renderedNode ?? null;
  }

  constructor(
    public component: (props: ComponentProps) => Node,
    public props: ComponentProps | undefined,
  ) {
    this.key = props?.key ? normalizeKey(props.key) : getComponentKey(component);
    this.reactiveProps = shallowReactive({ ...(this.props || {}) });
    this.parentContext = getActiveContext();

    // Init snapshots for object props
    if (this.props) {
      for (const key in this.props) {
        const val = this.props[key];
        if (isObject(val) && val !== null) {
          this._propSnapshots[key] = Array.isArray(val) ? [...val] : { ...val };
        }
      }
    }
  }

  mount(parentNode: Node, beforeNode?: Node | null): Node | null | Promise<Node | null> {
    this.parentNode = parentNode;
    this.beforeNode = beforeNode || null;
    this.state = COMPONENT_STATE.MOUNTING;

    // if the component is already mount, insert the rendered node
    if (this.renderedNode) {
      insertNode(parentNode, this.renderedNode, beforeNode);
      return this.renderedNode;
    }

    // context
    this.componentContext = createContext(this.parentContext);
    pushContextStack(this.componentContext);

    // render the component
    let result = this.component(this.reactiveProps);

    if (isFunction(result)) {
      result = result();
    }

    // Unwrap signals and computed values
    if (isSignal<Node>(result)) {
      result = result.value;
    }

    this.renderedNode = result;

    // insert the rendered node
    insertNode(parentNode, this.renderedNode, beforeNode);

    // apply props
    this.applyProps(this.props || {});

    // update marks
    this.state = COMPONENT_STATE.MOUNTED;
    if (this.componentContext) {
      this.componentContext.isMount = true;
    }
    // trigger mount hook
    triggerLifecycleHook(LIFECYCLE.mount);

    return this.renderedNode;
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
    this.renderedNode = prevNode.renderedNode;
    this.state = prevNode.state;
    this.reactiveProps = prevNode.reactiveProps; // Reuse same reactive object
    this._propSnapshots = prevNode._propSnapshots;

    // Smart update: shallow compare object props to detect mutations
    if (this.props) {
      const flattened = { ...this.props };
      for (const key in flattened) {
        if (key === 'key') continue;
        const newValue = flattened[key];
        const oldValue = this.reactiveProps[key];

        if (isObject(newValue) && newValue !== null) {
          // For objects: compare with snapshot
          const snapshot = this._propSnapshots[key];
          if (!snapshot || !shallowCompare(newValue, snapshot)) {
            // Content changed (or new prop) -> Force update
            const newSnapshot = Array.isArray(newValue) ? [...newValue] : { ...newValue };
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

    // Re-render
    const prevNode = this.renderedNode;
    let newNode: Node | Promise<Node>;

    try {
      // Create new context for re-render
      if (this.componentContext) {
        pushContextStack(this.componentContext);
      }

      newNode = (this.component as Function)(this.reactiveProps);

      if (isFunction(newNode)) {
        newNode = (newNode as Function)(this.reactiveProps) as Node;
      }

      // Unwrap signals and computed values
      if (isSignal(newNode)) {
        newNode = (newNode as any).value;
      }

      if (prevNode && newNode && prevNode !== newNode) {
        // Replace node
        if (this.parentNode) {
          replaceNode(this.parentNode, newNode as Node, prevNode as Node);
          this.renderedNode = newNode as Node;
        }
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

    const rendered = this.renderedNode;
    if (rendered) {
      removeNode(rendered);
    }

    // Reset all component properties
    this.renderedNode = null;
    this.parentNode = null;
    this.beforeNode = null;
    this.reactiveProps = {};
    this.props = undefined;
    this.state = COMPONENT_STATE.DESTROYED;
  }

  applyProps(props: ComponentProps): void {
    // check if props is defined
    if (!props) {
      return;
    }

    // iterate over all properties and apply them
    for (const [propName, propValue] of Object.entries(props)) {
      if (startsWith(propName, EVENT_PREFIX) && this.renderedNode) {
        // event handling: extract the event name after on
        const eventName = propName.slice(2).toLowerCase();

        if (isHTMLElement(this.renderedNode)) {
          addEventListener(this.renderedNode, eventName, propValue as EventListener);
        }
      } else if (propName === REF_KEY && isSignal(propValue)) {
        // handle reference: store the DOM reference into the signal value
        propValue.value = this.renderedNode;
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
