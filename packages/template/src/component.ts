import { isSignal, shallowReactive } from '@estjs/signal';
import { error, isHTMLElement, startsWith } from '@estjs/shared';
import {
  type Context,
  createContext,
  destroyContext,
  findParentContext,
  getActiveContext,
  popContextStack,
  pushContextStack,
} from './context';
import { getKey, insertNode, removeChild } from './patch';
import { LIFECYCLE, triggerLifecycleHook } from './lifecycle';
import { EVENT_PREFIX, REF_KEY } from './constants';
import { addEventListener, createComponentEffect } from './binding';

/**
 * component parent context cache
 */
const componentParentContextCache = new WeakMap<object, Context | null>();

export type ComponentFn = (props: ComponentProps) => Node;
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

  // component is mounted
  protected isMounted = false;

  // Component key - can be provided in props or auto-generated
  public readonly key: any;

  get isConnected(): boolean {
    return this.isMounted;
  }

  get firstChild(): Node | null {
    return this.renderedNode ?? null;
  }

  constructor(
    public component: (props: ComponentProps) => Node,
    public props?: ComponentProps,
  ) {
    // Extract key from props if available, otherwise generate a unique key
    this.key = props?.key ?? getKey(this);
    this.reactiveProps = shallowReactive(this.props || {});
  }

  mount(parentNode: Node, beforeNode?: Node | null): Node | null {
    this.parentNode = parentNode;
    this.beforeNode = beforeNode || null;

    // if the component is already mounted, insert the rendered node
    if (this.renderedNode) {
      insertNode(parentNode, this.renderedNode, beforeNode);
      return this.renderedNode;
    }

    // context
    const parentContext = findContext(this.component);
    this.componentContext = createContext(parentContext);
    pushContextStack(this.componentContext);

    // render the component
    this.renderedNode = this.component(this.reactiveProps);

    // insert the rendered node
    insertNode(parentNode, this.renderedNode, beforeNode);

    // apply props
    this.applyProps(this.props || {});

    createComponentEffect();
    // mark the component as mounted
    this.isMounted = true;
    this.componentContext.isMounted = true;

    // trigger mounted hook
    triggerLifecycleHook(LIFECYCLE.mounted);

    return this.renderedNode;
  }

  update(previousNode: Component): Component {
    // if key is different, mount the component
    if (this.key !== previousNode.key) {
      this.mount(previousNode.parentNode!, previousNode.beforeNode);
      return this;
    }

    // Take previous node's properties
    this.parentNode = previousNode.parentNode;
    this.beforeNode = previousNode.beforeNode;
    this.componentContext = previousNode.componentContext;
    this.reactiveProps = previousNode.reactiveProps;
    this.props = previousNode.props;
    this.renderedNode = previousNode.renderedNode;
    this.isMounted = previousNode.isMounted;

    // check if the component is already mounted
    if (!this.isMounted && this.parentNode) {
      this.mount(this.parentNode, this.beforeNode);
    }

    // if the component is mounted and has context, trigger update lifecycle
    if (this.componentContext) {
      pushContextStack(this.componentContext);
      this.applyProps(this.props || {});
      triggerLifecycleHook(LIFECYCLE.updated);
      popContextStack();
    }

    return this;
  }

  destroy(): void {
    if (this.componentContext) {
      // cleanup the component context
      pushContextStack(this.componentContext);
      this.componentContext.isDestroyed = true;
      triggerLifecycleHook(LIFECYCLE.destroyed);
      destroyContext(this.componentContext);
      this.componentContext = null;
    }

    // remove the component from the parent node
    if (this.renderedNode) {
      removeChild(this.renderedNode);
    }

    //rest all component properties
    this.renderedNode = null;
    this.parentNode = null;
    this.beforeNode = null;
    this.reactiveProps = {};
    this.props = undefined;
    this.isMounted = false;
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
 * find parent context for a component
 * @param {Function} componentFn - the component function
 * @returns {Context | null} the parent context
 */
function findContext(componentFn: ComponentFn): Context | null {
  // find cached parent context
  let parentContext = componentParentContextCache.get(componentFn);

  // if no cached context, find valid parent context and cache it
  if (!parentContext) {
    parentContext = findParentContext();
    if (parentContext) {
      componentParentContextCache.set(componentFn, parentContext);
    }
  }
  return parentContext;
}

/**
 * check if a node is a component
 * @param {unknown} node - the node to check
 * @returns {boolean} true if the node is a component, false otherwise
 */
export function isComponent(node: unknown): node is Component {
  return node instanceof Component;
}

/**
 * create a component
 * @param {Function} componentFn - the component function
 * @param {ComponentProps} props - the component props
 * @returns {Component} the component
 */
export function createComponent(componentFn: ComponentFn, props?: ComponentProps): Component {
  return new Component(componentFn, props);
}

export function componentEffect(EffectFn: () => void) {
  const activeContext = getActiveContext();
  if (!activeContext) {
    error('No active context found');
    return;
  }

  activeContext.componentEffect.add(EffectFn);
}
