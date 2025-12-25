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
import { getFirstDOMNode, insertNode, removeNode, shallowCompare } from './utils';
import { triggerMountHooks, triggerUpdateHooks } from './lifecycle';
import type { AnyNode, ComponentFn, ComponentProps } from './types';

export class Component {
  // component rendered nodes (supports arrays and fragments)
  protected renderedNodes: AnyNode[] = [];

  // component scope (unified context management)
  protected scope: Scope | null = null;

  // component parent node
  protected parentNode: Node | undefined = undefined;

  // component before node
  public beforeNode: Node | undefined = undefined;

  // component props
  private reactiveProps: Record<string, any> = {};
  private _propSnapshots: Record<string, any> = {};

  // component key
  public readonly key: string | undefined;
  // component state
  protected state: number = COMPONENT_STATE.INITIAL;

  // parent scope captured at construction time
  protected parentScope: Scope | null = null;

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
    // Capture parent scope at construction time for correct hierarchy
    this.parentScope = getActiveScope();

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

    // Create scope with correct parent (captured at construction or current active)
    const parent = this.parentScope ?? getActiveScope();
    this.scope = createScope(parent);

    // Run component within its scope
    const renderedNodes = runWithScope(this.scope, () => {
      // render the component
      let result = this.component(this.reactiveProps);

      // unwrap function (render function pattern)
      if (isFunction(result)) {
        result = (result as Function)(this.reactiveProps);
      }

      // unwrap signals and computed values
      if (isSignal<Element>(result) || isComputed<Element>(result)) {
        result = result.value;
      }

      const nodes = insert(parentNode, result as any, beforeNode) ?? [];

      return nodes;
    });

    this.renderedNodes = renderedNodes;

    // apply props (events, refs) - must be after renderedNodes is set
    // so that this.firstChild returns the correct element
    runWithScope(this.scope, () => {
      this.applyProps(this.props || {});
    });

    // update marks
    this.state = COMPONENT_STATE.MOUNTED;

    // Trigger scope mount hooks (unified lifecycle system)
    if (this.scope) {
      triggerMountHooks(this.scope);
    }

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
    this.scope = prevNode.scope; // Reuse existing scope
    this.parentScope = prevNode.parentScope;
    this.renderedNodes = prevNode.renderedNodes;
    this.state = prevNode.state;
    this.reactiveProps = prevNode.reactiveProps; // Reuse same reactive object
    this._propSnapshots = prevNode._propSnapshots;

    // shallow compare object props to detect mutations
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

    // if the component is mount and has scope, apply new props and trigger update lifecycle
    if (this.scope) {
      runWithScope(this.scope, () => {
        this.applyProps(this.props || {});
      });
      // Trigger scope update hooks (unified lifecycle system)
      triggerUpdateHooks(this.scope);
    }

    return this;
  }

  async forceUpdate(): Promise<void> {
    await Promise.resolve();
    if (this.state === COMPONENT_STATE.DESTROYED || !this.parentNode || !this.scope) {
      return;
    }

    const originalNodes = [...this.renderedNodes];

    try {
      runWithScope(this.scope, () => {
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
        if (this.parentNode) {
          let anchor: Node | undefined = this.beforeNode;
          if (!anchor && this.renderedNodes.length > 0) {
            const lastNode = this.renderedNodes[this.renderedNodes.length - 1];
            const lastDom = getFirstDOMNode(lastNode);
            if (lastDom) {
              anchor = lastDom.nextSibling as Node | undefined;
            }
          }

          // Remove old rendered nodes
          for (const node of this.renderedNodes) {
            removeNode(node);
          }

          // Insert new nodes before anchor
          for (const node of newNodes) {
            insertNode(this.parentNode, node, anchor);
          }

          this.renderedNodes = newNodes;
        }
      });

      if (this.scope) {
        triggerUpdateHooks(this.scope);
      }
    } catch (error) {
      // Rollback
      this.renderedNodes = originalNodes;
      throw error;
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
