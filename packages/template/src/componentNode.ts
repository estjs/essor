import { hasChanged, isFunction, startsWith } from '@estjs/shared';
import { type Signal, effect, shallowReactive } from '@estjs/signal';
import { reactive } from '@estjs/signal';
import { addEventListener, extractSignal } from './utils';
import { LifecycleContext } from './lifecycleContext';
import { CHILDREN_PROP, EVENT_PREFIX, REF_KEY, UPDATE_PREFIX } from './sharedConfig';
import { componentCache } from './jsxRenderer';
import type { TemplateNode } from './templateNode';
import type { EssorComponent, NodeTrack, Props } from '../types';

export class ComponentNode extends LifecycleContext implements JSX.Element {
  protected proxyProps: Record<string, Signal<unknown>>;
  protected emitter = new Set<() => void>();
  protected rootNode: TemplateNode | null = null;
  protected trackMap = new Map<string, NodeTrack>();
  protected nodes: Node[] = [];
  protected parent: Node | null = null;
  protected before: Node | null = null;

  constructor(
    public template: EssorComponent,
    public props?: Props,
    public key?: string,
  ) {
    super();
    this.key ||= props && (props.key as string);
    this.proxyProps ||= this.createProxyProps(props);
  }

  protected createProxyProps(props?: Props): Record<string, Signal<unknown>> {
    if (!props) return {};
    return shallowReactive(
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

  mount(parent: Node, before: Node | null): Node[] {
    this.parent = parent;
    if (!isFunction(this.template)) {
      throw new Error('Template must be a function');
    }
    if (this.isConnected) {
      return this.rootNode?.mount(parent, before) ?? [];
    }
    console.log(this.props);

    this.initRef();
    this.rootNode = this.template(reactive(this.proxyProps, [CHILDREN_PROP]));
    this.nodes = this.rootNode?.mount(parent, before) ?? [];
    this.callMountHooks();
    this.patchProps(this.props);
    this.removeRef();

    return this.nodes;
  }

  unmount(): void {
    this.callDestroyHooks();
    this.clearHooks();
    this.rootNode?.unmount();
    this.rootNode = null;
    this.proxyProps = {};
    this.clearEmitter();

    // remove to cache
    if (this.key) {
      componentCache.delete(this.key);
    }
  }

  protected callMountHooks(): void {
    this.hooks.mounted.forEach(handler => handler());
  }

  protected callDestroyHooks(): void {
    this.hooks.destroy.forEach(handler => handler());
  }

  protected clearEmitter(): void {
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
    if (hasChanged(node.props, this.props)) {
      const props = this.props;
      this.props = node.props;
      this.patchProps(props);
    }
  }

  protected getNodeTrack(trackKey: string): NodeTrack {
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

  protected patchEventListener(key: string, prop: any): void {
    const event = key.slice(2).toLowerCase();
    const cleanup = addEventListener((this.rootNode as any)!.nodes[0], event, prop);
    this.emitter.add(cleanup);
  }

  protected patchRef(prop: { value: Node | null }): void {
    prop.value = this.rootNode?.firstChild ?? null;
  }

  protected patchUpdateHandler(key: string, prop: any): void {
    this.proxyProps![key] = extractSignal(prop);
  }

  protected patchNormalProp(key: string, prop: any): void {
    const track = this.getNodeTrack(key);
    track.cleanup = effect(() => {
      this.proxyProps[key] = isFunction(prop) ? prop() : prop;
    });
  }
}
