import { isFunction, startsWith } from '@estjs/shared';
import { type Signal, signalObject, useEffect, useSignal } from '@estjs/signal';
import { useReactive } from '@estjs/signal';
import { addEventListener, extractSignal } from './utils';
import { LifecycleContext } from './lifecycleContext';
import { CHILDREN_PROP, EVENT_PREFIX, REF_KEY, UPDATE_PREFIX } from './sharedConfig';
import type { TemplateNode } from './templateNode';
import type { EssorComponent, NodeTrack, Props } from '../types';

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

    this.key ||= props && (props.key as string);
    this.proxyProps = this.createProxyProps(props);
  }

  private createProxyProps(props?: Props): Record<string, Signal<unknown>> {
    if (!props) return {};
    return signalObject(
      props,
      key =>
        startsWith(key, EVENT_PREFIX) || startsWith(key, UPDATE_PREFIX) || key === CHILDREN_PROP,
    );
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
    if (this.isConnected) {
      return this.rootNode?.mount(parent, before) ?? [];
    }

    this.initRef();
    this.rootNode = this.template(useReactive(this.proxyProps, [CHILDREN_PROP]));
    const mountedNode = this.rootNode?.mount(parent, before) ?? [];
    this.callMountHooks();
    this.patchProps(this.props);
    this.removeRef();

    return mountedNode;
  }

  unmount(): void {
    this.callDestroyHooks();
    this.clearHooks();
    this.rootNode?.unmount();
    this.rootNode = null;
    this.proxyProps = {};
    this.clearEmitter();
  }

  private callMountHooks(): void {
    this.hooks.mounted.forEach(handler => handler());
  }

  private callDestroyHooks(): void {
    this.hooks.destroy.forEach(handler => handler());
  }

  private clearEmitter(): void {
    for (const cleanup of this.emitter) {
      cleanup();
    }
    this.emitter.clear();
  }

  inheritNode(node: ComponentNode): void {
    Object.assign(this.proxyProps, node.proxyProps);
    this.rootNode = node.rootNode;
    this.trackMap = node.trackMap;
    this.hooks = node.hooks;

    const props = this.props;
    this.props = node.props;

    this.patchProps(props);
  }

  private getNodeTrack(trackKey: string): NodeTrack {
    let track = this.trackMap.get(trackKey);
    if (!track) {
      track = { cleanup: () => {} };
      this.trackMap.set(trackKey, track);
    }
    track.cleanup();
    return track;
  }

  patchProps(props: Record<string, any> | undefined) {
    if (!props) {
      return;
    }
    for (const [key, prop] of Object.entries(props)) {
      if (startsWith(key, EVENT_PREFIX) && this.rootNode?.firstChild) {
        this.patchEventListener(key, prop);
      } else if (key === REF_KEY) {
        this.patchRef(prop);
      } else if (startsWith(key, UPDATE_PREFIX)) {
        this.patchUpdateHandler(key, prop);
      } else if (key !== CHILDREN_PROP) {
        this.patchNormalProp(key, prop);
      }
    }
    this.props = props;
  }

  private patchEventListener(key: string, prop: any): void {
    const event = key.slice(2).toLowerCase();
    // @ts-ignore
    const cleanup = addEventListener(this.rootNode.nodes[0], event, prop);
    this.emitter.add(cleanup);
  }

  private patchRef(prop: { value: Node | null }): void {
    prop.value = this.rootNode?.firstChild ?? null;
  }

  private patchUpdateHandler(key: string, prop: any): void {
    this.props![key] = extractSignal(prop);
  }

  private patchNormalProp(key: string, prop: any): void {
    const newValue = (this.proxyProps[key] ??= useSignal(prop));
    const track = this.getNodeTrack(key);
    track.cleanup = useEffect(() => {
      newValue.value = isFunction(prop) ? prop() : prop;
    });
  }
}
