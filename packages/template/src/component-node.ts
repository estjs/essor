import { isFunction, startsWith } from '@estjs/shared';
import { type Signal, useEffect, useReactive } from '@estjs/signal';
import { addEventListener, extractSignal } from './utils';
import { LifecycleContext } from './lifecycle-context';
import { CHILDREN_PROP, EVENT_PREFIX, UPDATE_PREFIX } from './shared-config';
import type { TemplateNode } from './template-node';
import type { EssorComponent, NodeTrack, Props } from '../types';

// Class representing a component node in the virtual DOM
export class ComponentNode extends LifecycleContext implements JSX.Element {
  private proxyProps: Record<string, Signal<unknown>>;
  private emitter = new Set<() => void>();
  private rootNode: TemplateNode | null = null;
  private trackMap = new Map<string, NodeTrack>();

  constructor(
    public template: EssorComponent,
    public props?: Props,
    public key?: string,
  ) {
    super();
    this.proxyProps = this.createProxyProps(props);
  }

  // Create reactive props
  private createProxyProps(props?: Props): Record<string, Signal<unknown>> {
    if (!props) return {};
    return useReactive(
      props,
      key =>
        startsWith(key, EVENT_PREFIX) || startsWith(key, UPDATE_PREFIX) || key === CHILDREN_PROP,
    );
  }

  // Getter for the first child node
  get firstChild(): Node | null {
    return this.rootNode?.firstChild ?? null;
  }

  // Getter to check if the node is connected to the DOM
  get isConnected(): boolean {
    return this.rootNode?.isConnected ?? false;
  }

  // Method to mount the component to the DOM
  mount(parent: Node, before?: Node | null): Node[] {
    if (!isFunction(this.template)) {
      throw new Error('Template must be a function');
    }
    if (this.isConnected) {
      return this.rootNode?.mount(parent, before) ?? [];
    }

    this.initRef();
    this.rootNode = this.template(this.proxyProps);
    const mountedNode = this.rootNode?.mount(parent, before) ?? [];
    this.callMountHooks();
    this.patchProps(this.props);
    this.removeRef();

    return mountedNode;
  }

  // Method to unmount the component from the DOM
  unmount(): void {
    this.callDestroyHooks();
    this.clearHooks();
    this.rootNode?.unmount();
    this.rootNode = null;
    this.proxyProps = {};
    this.clearEmitter();
  }

  // Private method to call mount hooks
  private callMountHooks(): void {
    this.hooks.mounted.forEach(handler => handler());
  }

  // Private method to call destroy hooks
  private callDestroyHooks(): void {
    this.hooks.destroy.forEach(handler => handler());
  }

  // Private method to clear the event emitter
  private clearEmitter(): void {
    for (const cleanup of this.emitter) {
      cleanup();
    }
    this.emitter.clear();
  }

  // Method to inherit properties from another ComponentNode
  inheritNode(node: ComponentNode): void {
    Object.assign(this.proxyProps, node.proxyProps);
    this.rootNode = node.rootNode;
    this.trackMap = node.trackMap;
    this.hooks = node.hooks;

    const props = this.props;
    this.props = node.props;

    this.patchProps(props);
  }

  // Private method to get or create a NodeTrack
  private getNodeTrack(trackKey: string): NodeTrack {
    let track = this.trackMap.get(trackKey);
    if (!track) {
      track = { cleanup: () => {} };
      this.trackMap.set(trackKey, track);
    }
    track.cleanup();
    return track;
  }

  // Method to patch props onto the component
  patchProps(props: Record<string, any> | undefined) {
    if (!props) {
      return;
    }
    for (const [key, prop] of Object.entries(props)) {
      if (startsWith(key, EVENT_PREFIX) && this.rootNode?.firstChild) {
        this.patchEventListener(key, prop);
      } else if (key === 'ref') {
        this.patchRef(prop);
      } else if (startsWith(key, UPDATE_PREFIX)) {
        this.patchUpdateHandler(key, prop);
      } else if (key !== CHILDREN_PROP) {
        this.patchNormalProp(key, prop);
      }
    }
    this.props = props;
  }

  // Private method to patch event listeners
  private patchEventListener(key: string, prop: any): void {
    const event = key.slice(2).toLowerCase();
    // @ts-ignore
    const cleanup = addEventListener(this.rootNode.nodes[0], event, prop);
    this.emitter.add(cleanup);
  }

  // Private method to patch ref
  private patchRef(prop: { value: Node | null }): void {
    prop.value = this.rootNode?.firstChild ?? null;
  }

  // Private method to patch update handlers
  private patchUpdateHandler(key: string, prop: any): void {
    this.props![key] = extractSignal(prop);
  }

  // Private method to patch normal props
  private patchNormalProp(key: string, prop: any): void {
    const track = this.getNodeTrack(key);
    track.cleanup = useEffect(() => {
      this.proxyProps[key] = isFunction(prop) ? prop() : prop;
    });
  }
}
