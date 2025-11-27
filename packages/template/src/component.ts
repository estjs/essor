import { isSignal, shallowReactive } from '@estjs/signals';
import { isFunction, isHTMLElement, startsWith } from '@estjs/shared';
import {
  type Context,
  createContext,
  destroyContext,
  getActiveContext,
  popContextStack,
  pushContextStack,
} from './context';
import { insertNode } from './patch';
import { LIFECYCLE, triggerLifecycleHook } from './lifecycle';
import { COMPONENT_STATE, COMPONENT_TYPE, EVENT_PREFIX, REF_KEY } from './constants';
import { addEventListener } from './binding';
import { getComponentKey, normalizeKey } from './key';
import { removeNode, replaceNode } from './utils';

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
    public props: ComponentProps | undefined = {},
  ) {
    this.key = props.key ? normalizeKey(props?.key) : getComponentKey(component);
    this.reactiveProps = shallowReactive(this.props || {});
    this.parentContext = getActiveContext();
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
    const result = this.component(this.reactiveProps);

    const handleMount = (node: any) => {
      // Handle default export for async components
      if (node && typeof node === 'object' && 'default' in node) {
        node = node.default;
      }
      if (isFunction(node)) {
        node = node();
      }

      this.renderedNode = node as Node;

      // insert the rendered node
      insertNode(parentNode, this.renderedNode, beforeNode);

      // apply props
      this.applyProps(this.props || {});

      // update marks
      this.state = COMPONENT_STATE.MOUNTED;
      this.componentContext!.isMount = true;
      // trigger mount hook
      triggerLifecycleHook(LIFECYCLE.mount);

      return this.renderedNode;
    };

    if (result instanceof Promise) {
      return result.then(handleMount);
    }

    return handleMount(result);
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
    // Reuse the same reactive object
    this.reactiveProps = prevNode.reactiveProps;
    this.props = prevNode.props;

    // Update reactiveProps with NEW props
    // if (this.props) {
    //   const rawTarget = toRaw(this.reactiveProps);

    //   for (const key in this.props) {
    //     const descriptor = Object.getOwnPropertyDescriptor(this.props, key);
    //     if (!descriptor) continue;

    //     // Always use defineProperty to safely update the property on the target
    //     // This handles value->getter, getter->value, and getter->getter transitions
    //     // without triggering the proxy's set trap (which would fail for readonly getters)
    //     Object.defineProperty(this.reactiveProps, key, descriptor);

    //     if (
    //       (descriptor.get || descriptor.set) &&
    //       this.reactiveProps[key] !== prevNode.reactiveProps[key]
    //     ) {
    //       // For accessors, we can't easily check if value changed, so we always trigger
    //       trigger(rawTarget, TriggerOpTypes.SET, key);
    //     } else {
    //       // For data properties, check if we need to trigger
    //       const newValue = descriptor.value;
    //       const oldValue = prevNode.props ? prevNode.props[key] : undefined;

    //       // Trigger if value changed OR if it's an object (to handle mutations of same ref)
    //       if (newValue !== oldValue || isObject(newValue)) {
    //         trigger(rawTarget, TriggerOpTypes.SET, key, newValue);
    //       }
    //     }
    //   }
    // }

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
  /**
   * Force update component
   */
  async forceUpdate() {
    if (this.state === COMPONENT_STATE.DESTROYED || !this.parentNode || !this.context) {
      return;
    }

    // Re-render
    const prevNode = this.renderedNode;
    let newNode: Node | Promise<Node>;

    try {
      // Create new context for re-render
      if (this.context) {
        pushContextStack(this.context);
      }

      newNode = (this.component as Function)(this.reactiveProps);

      if (isFunction(newNode)) {
        newNode = (newNode as Function)(this.reactiveProps) as Node;
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
    } catch (error) {
      console.error('Force update failed:', error);
      throw error;
    } finally {
      if (this.context) {
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

    const context = this.context;
    if (context) {
      pushContextStack(context);

      // Trigger destroyed lifecycle
      triggerLifecycleHook(LIFECYCLE.destroy);
      destroyContext(context);
      this.context = null;

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
