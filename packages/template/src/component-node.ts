import { isFunction, startsWith } from '@estjs/shared';
import { isSignal, signalObject } from '@estjs/signal';
import { type Signal, useEffect, useReactive, useSignal } from '@estjs/signal';
import { addEventListener } from './utils';
import { LifecycleContext } from './lifecycle-context';
import type { TemplateNode } from './template-node';
import type { EssorComponent, NodeTrack, Props } from '../types';

// render essor component node
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
    // create proxy props
    this.proxyProps = props
      ? signalObject(props, key => startsWith(key, 'on') || startsWith(key, 'update'))
      : {};
  }

  get firstChild(): Node | null {
    return this.rootNode?.firstChild ?? null;
  }

  get isConnected(): boolean {
    return this.rootNode?.isConnected ?? false;
  }

  mount(parent: Node, before?: Node | null): Node[] {
    if (!isFunction(this.template)) {
      throw new Error('Template must be a function');
    }
    // if it mounted in the template, it will be connected
    if (this.isConnected) {
      return this.rootNode?.mount(parent, before) ?? [];
    }

    // init hooks
    this.initRef();

    // render template node
    this.rootNode = this.template(useReactive(this.proxyProps, ['children']));

    // mount template node
    const mountedNode = this.rootNode?.mount(parent, before) ?? [];

    // call mount hooks
    this.hooks.mounted.forEach(handler => handler());

    // patch props
    this.patchProps(this.props);

    // destroy hooks
    this.removeRef();

    return mountedNode;
  }

  unmount(): void {
    this.hooks.destroy.forEach(handler => handler());
    this.clearHooks();
    this.rootNode?.unmount();
    this.rootNode = null;
    this.proxyProps = {};
    for (const cleanup of this.emitter) {
      cleanup();
    }
    this.emitter.clear();
  }

  /**
   * Inherit props and state from another ComponentNode.
   * It will:
   * 1. Copy props from the node to this proxyProps.
   * 2. Copy the rootNode, trackMap and hooks from the node.
   * 3. Copy the props from the node to this.
   * 4. Patch props from the props passed in the constructor.
   * @param node The node to inherit from.
   */
  inheritNode(node: ComponentNode): void {
    Object.assign(this.proxyProps, node.proxyProps);
    this.rootNode = node.rootNode;
    this.trackMap = node.trackMap;
    this.hooks = node.hooks;

    const props = this.props;
    this.props = node.props;

    this.patchProps(props);
  }

  /**
   * Get a NodeTrack from the trackMap. If the track is not in the trackMap, create a new one.
   * Then, call the cleanup function to remove any previously registered hooks.
   * @param trackKey the key of the node track to get.
   * @returns the NodeTrack, cleaned up and ready to use.
   */
  private getNodeTrack(trackKey: string): NodeTrack {
    let track = this.trackMap.get(trackKey);
    if (!track) {
      track = { cleanup: () => {} };
      this.trackMap.set(trackKey, track);
    }
    track.cleanup();
    return track;
  }

  /**
   * Patch the props of this node.
   * It will:
   * 1. Iterate the props and patch it.
   * 2. If the prop is a event handler, add a event listener to the first child of the node.
   * 3. If the prop is a ref, set the first child of the node to the ref.
   * 4. If the prop is a update handler, update the prop in the node's props.
   * 5. If the prop is a normal prop, create a signal for it and then patch it.
   * @param props The props to patch.
   */
  patchProps(props: Record<string, any> | undefined) {
    if (!props) {
      return;
    }
    for (const [key, prop] of Object.entries(props)) {
      if (startsWith(key, 'on') && this.rootNode?.firstChild) {
        const event = key.slice(2).toLowerCase();
        // @ts-ignore
        const cleanup = addEventListener(this.rootNode.nodes[0], event, prop);
        this.emitter.add(cleanup);
      } else if (key === 'ref') {
        prop.value = this.rootNode?.firstChild;
      } else if (startsWith(key, 'update')) {
        this.props![key] = isSignal(prop) ? prop.value : prop;
      } else if (key !== 'children') {
        const newValue = (this.proxyProps[key] ??= useSignal(prop));
        const track = this.getNodeTrack(key);
        track.cleanup = useEffect(() => {
          newValue.value = isFunction(prop) ? prop() : prop;
        });
      }
    }
    this.props = props;
  }
}
