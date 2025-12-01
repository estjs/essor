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
    public props: ComponentProps | undefined,
  ) {
    this.key = props?.key ? normalizeKey(props.key) : getComponentKey(component);
    this.reactiveProps = shallowReactive({ ...(this.props || {}) });
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

      // Unwrap signals and computed values
      if (isSignal(node)) {
        node = node.value;
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

    // Save new props before inheriting from prevNode
    const newProps = prevNode.props;

    // Take previous node's properties and reactive state
    this.parentNode = prevNode.parentNode;
    this.beforeNode = prevNode.beforeNode;
    this.componentContext = prevNode.componentContext;
    this.renderedNode = prevNode.renderedNode;
    this.state = prevNode.state;
    // Reuse the same reactive object
    // this.reactiveProps = Object.assign(this.reactiveProps, prevNode.reactiveProps);

    Object.keys(newProps || {}).forEach(key => {
      console.log(key, newProps![key], this.props![key]);

      // @ts-ignore
      // this.reactiveProps[key] = newProps![key];
    });

    // Sync new props to reactiveProps
    // if (newProps) {
    //   const rawTarget = toRaw(this.reactiveProps);

    //   for (const key in newProps) {
    //     if (key === 'key') continue; // Skip key prop

    //     const descriptor = Object.getOwnPropertyDescriptor(newProps, key);

    //     // @ts-ignore
    //     console.log(key, rawTarget[key], descriptor.get.call(newProps));
    //     if (!descriptor) continue;
    //     // @ts-ignore
    //     if (!hasChanged(descriptor.get.call(newProps), rawTarget[key])) {
    //       continue;
    //     }
    //     if (descriptor.get) {
    //       // For getter props: delete first, then set via proxy, then define getter
    //       // This ensures the proxy's set trap is triggered
    //       delete rawTarget[key];
    //       // Set current value through proxy (triggers ADD since key was deleted)
    //       this.reactiveProps[key] = descriptor.get.call(newProps);
    //       // Now define the getter for future accesses
    //       Object.defineProperty(rawTarget, key, descriptor);
    //     } else if ('value' in descriptor) {
    //       // For value props, set directly through proxy
    //       this.reactiveProps[key] = descriptor.value;
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
    } catch (error) {
      console.error('Force update failed:', error);
      throw error;
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
