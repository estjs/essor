import { type Signal, isComputed, isSignal, shallowReactive } from '@estjs/signals';
import { isFunction, isOn, isString } from '@estjs/shared';

import { COMPONENT_STATE, COMPONENT_TYPE, REF_KEY } from './constants';
import { insert, insertNode, removeNode } from './dom';
import { createScope, disposeScope, getActiveScope, runWithScope } from './scope';
import { type EventCleanup, addEvent } from './operations/event';
import { triggerMountHooks, triggerUpdateHooks } from './lifecycle';
import type { AnyNode, ComponentFn, ComponentProps } from './types';
import type { Scope } from './scope';

type RootEventTarget = Element & Record<string, unknown> & { disabled?: boolean };

/**
 * Copy prop descriptors verbatim. Dynamic JSX props are emitted as getters, so
 * spreading would snapshot them and break reactivity.
 */
function syncDescriptors(target: object, source: object, pruneMissing = false): void {
  const sourceKeys = Reflect.ownKeys(source);
  for (const key of sourceKeys) {
    Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)!);
  }

  if (pruneMissing) {
    const sourceKeySet = new Set(sourceKeys);
    for (const key of Reflect.ownKeys(target)) {
      if (!sourceKeySet.has(key)) delete (target as Record<PropertyKey, unknown>)[key];
    }
  }
}

/**
 * Read a prop value through its descriptor so dynamic getters (ref/event
 * handlers emitted as `get onClick() { ... }`) resolve to the latest value.
 */
function readDescriptorValue(source: object, key: PropertyKey): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(source, key)!;
  return descriptor.get ? descriptor.get.call(source) : descriptor.value;
}

export class Component<P extends ComponentProps = {}> {
  public readonly [COMPONENT_TYPE.NORMAL] = true;

  public scope: Scope | null = null;
  public state: COMPONENT_STATE = COMPONENT_STATE.INITIAL;
  public beforeNode: Node | undefined = undefined;
  public renderedNodes: Node[] = [];
  public firstChild: Node | undefined = undefined;

  protected parentNode: Node | undefined = undefined;

  private readonly parentScope: Scope | null;
  private readonly reactiveProps: P;
  private rootEventCleanups: EventCleanup[] = [];
  private rootRefCleanup?: () => void;

  constructor(
    public readonly component: ComponentFn<P>,
    public props: P = {} as P,
  ) {
    this.parentScope = getActiveScope();
    const reactiveProps = Object.create(null) as P;
    syncDescriptors(reactiveProps, props);
    this.reactiveProps = shallowReactive(reactiveProps) as P;
  }

  /**
   * Mount the component into `parentNode` (optionally before `beforeNode`).
   * If already rendered, the existing DOM is re-inserted without re-running
   * the component function.
   */
  mount(parentNode: Node, beforeNode?: Node): AnyNode[] {
    this.parentNode = parentNode;
    this.beforeNode = beforeNode;
    this.state = COMPONENT_STATE.MOUNTING;

    // Fast path: already rendered — just move the nodes.
    if (this.renderedNodes.length > 0) {
      for (const node of this.renderedNodes) {
        insertNode(parentNode, node, beforeNode);
      }
      this.state = COMPONENT_STATE.MOUNTED;
      return this.renderedNodes;
    }

    const scope = createScope(this.parentScope ?? getActiveScope());
    this.scope = scope;

    const renderedNodes = runWithScope(scope, () => {
      let result: unknown = this.component(this.reactiveProps);

      // Render-function pattern: a component may return a factory instead of
      // the element directly.
      if (isFunction(result)) {
        result = (result as Function)(this.reactiveProps);
      }

      // Unwrap signal / computed — only their current value reaches the DOM.
      if (isSignal<Element>(result)) {
        result = result.value;
      } else if (isComputed<Element>(result)) {
        result = result.value;
      }

      return insert(parentNode, result as AnyNode, beforeNode) ?? [];
    });

    this.renderedNodes = renderedNodes;
    this.firstChild = renderedNodes[0];

    // Wire refs/events only after renderedNodes/firstChild are set.
    this.syncSpecialProps(this.props);

    this.state = COMPONENT_STATE.MOUNTED;
    triggerMountHooks(scope);

    return this.renderedNodes;
  }

  /**
   * Re-install props into the same `reactiveProps` container (preserving
   * any closures already holding a reference to it) and re-apply
   * refs/events against the current root element.
   */
  update(props: P): void {
    this.props = props;
    syncDescriptors(this.reactiveProps as object, props ?? {}, /* pruneMissing */ true);

    const scope = this.scope;
    if (!scope || scope.isDestroyed) return;

    this.syncSpecialProps(props);

    triggerUpdateHooks(scope);
  }

  /**
   * Tear down and re-mount the component at its current insertion point.
   * No-op if the component has never been mounted.
   */
  forceUpdate(): void {
    if (!this.parentNode) return;
    const parent = this.parentNode;
    const before = this.beforeNode;
    // Preserve props across destroy/mount cycle — the parent hasn't
    // re-rendered, so the existing descriptors are still valid.
    const savedProps = Object.create(null) as P;
    syncDescriptors(savedProps, this.reactiveProps);
    this.destroy();
    syncDescriptors(this.reactiveProps as object, savedProps);
    this.mount(parent, before);
  }

  /**
   * Dispose the scope, remove all rendered nodes, and clear bookkeeping.
   * Idempotent: subsequent calls are no-ops.
   */
  destroy(): void {
    const scope = this.scope;
    if (!scope || scope.isDestroyed) return;
    this.scope = null;
    this.releaseSpecialProps();
    disposeScope(scope);
    for (const node of this.renderedNodes) removeNode(node);
    this.renderedNodes = [];
    this.firstChild = undefined;
    this.parentNode = undefined;
    // Clear all descriptors to release signal getter references
    for (const key of Reflect.ownKeys(this.reactiveProps)) {
      delete (this.reactiveProps as Record<PropertyKey, unknown>)[key];
    }
    this.state = COMPONENT_STATE.INITIAL;
  }

  /**
   * Apply props that bind to the root DOM element rather than flowing into
   * the component body: `ref` (signal/function) and `onXxx` event handlers.
   * The render-facing `reactiveProps` already has those keys; here we just
   * wire them to the actual DOM node.
   */
  private syncSpecialProps(props: P): void {
    if (!props) return;
    const roots = this.getRootElements();
    if (roots.length === 0) return;
    const refRoot = roots[0];

    this.releaseSpecialProps();

    for (const key of Reflect.ownKeys(props)) {
      if (!isString(key)) continue;

      if (key === REF_KEY) {
        const value = readDescriptorValue(props, key);
        this.rootRefCleanup = this.bindRootRef(value, refRoot);
        continue;
      }

      if (isOn(key)) {
        const value = readDescriptorValue(props, key);
        if (!isFunction(value)) continue;
        const eventName = key.slice(2).toLowerCase();
        for (const root of roots) {
          this.bindRootEvent(root, eventName, value as (this: Element, event: Event) => unknown);
        }
      }
    }
  }

  private getRootElements(): RootEventTarget[] {
    const roots: RootEventTarget[] = [];
    for (const node of this.renderedNodes) {
      if (node instanceof Element) roots.push(node as RootEventTarget);
    }
    return roots;
  }

  private bindRootEvent(
    target: RootEventTarget,
    eventName: string,
    handler: (this: Element, event: Event) => unknown,
  ): void {
    // Slot path: babel-plugin wires a delegated `_$<event>` handler onto the
    // element at compile time. Override it in-place (last write wins) and
    // restore the original on cleanup so re-mount sees a clean baseline.
    const slot = `_$${eventName}`;
    const prev = target[slot];

    if (isFunction(prev)) {
      target[slot] = handler;
      this.rootEventCleanups.push(() => {
        if (target[slot] === handler) target[slot] = prev;
      });
      return;
    }

    // Native path: no delegated handler present — attach a real listener.
    // Mirror the delegation walk's `!node.disabled` short-circuit so behaviour
    // is consistent between the two paths.
    this.rootEventCleanups.push(
      addEvent(target, eventName, (event) => {
        if (target.disabled) return;
        handler.call(target, event);
      }),
    );
  }

  /**
   * Remove all listeners/ref bindings currently attached to the root element.
   */
  private releaseSpecialProps(): void {
    for (const cleanup of this.rootEventCleanups) {
      cleanup();
    }
    this.rootEventCleanups.length = 0;

    if (this.rootRefCleanup) {
      this.rootRefCleanup();
      this.rootRefCleanup = undefined;
    }
  }

  /**
   * Bind the root ref prop and return a cleanup that restores the previous ref state.
   */
  private bindRootRef(value: unknown, root: Element): (() => void) | undefined {
    if (isFunction(value)) {
      value(root);
      return () => value(null);
    }

    if (isSignal<Element | null>(value)) {
      const ref = value as Signal<Element | null>;
      const previousValue = ref.value;
      ref.value = root;
      return () => {
        if (ref.value === root) {
          ref.value = previousValue;
        }
      };
    }

    return undefined;
  }
}

/**
 * Check if a value is a Component instance.
 */
export function isComponent(node: unknown): node is Component {
  return !!node && !!(node as Record<PropertyKey, unknown>)[COMPONENT_TYPE.NORMAL];
}

/**
 * Wrap a component function in a Component instance, or pass an existing
 * Component instance through unchanged.
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
