import { isFunction, startsWith } from '@estjs/shared';
import { isSignal, signalObject } from '@estjs/signal';
import { type Signal, useEffect, useReactive, useSignal } from '@estjs/signal';
import { addEventListener } from '../utils';
import { HooksManager } from './hooks';
import type { TemplateRender } from './template';
import type { Listener } from '../utils';
import type { EssorComponent, NodeTrack, Props } from '../../types';
export class ComponentRender extends HooksManager implements JSX.Element {
  private proxyProps: Record<string, Signal<unknown>>;
  private emitter = new Set<() => void>();
  private rootNode: TemplateRender | null = null;
  private trackMap = new Map<string, NodeTrack>();

  constructor(
    public template: EssorComponent,
    props?: Props,
    public key?: string,
  ) {
    super();
    this.proxyProps = props
      ? signalObject(props, key => startsWith(key, 'on') || startsWith(key, 'update'))
      : {};
  }
  props: Record<string, any>;

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
    this.rootNode = this.template(useReactive(this.proxyProps, ['children']));

    const mountedNode = this.rootNode?.mount(parent, before) ?? [];

    this.hooks.mounted.forEach(handler => handler());

    this.patchProps(this.props);

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

  inheritNode(node: ComponentRender): void {
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
      if (startsWith(key, 'on') && this.rootNode?.firstChild) {
        this.handleEventProp(key, prop);
      } else if (key === 'ref') {
        this.handleRefProp(prop);
      } else if (startsWith(key, 'update')) {
        this.handleUpdateProp(key, prop);
      } else if (key !== 'children') {
        this.handleStandardProp(key, prop);
      }
    }
    this.props = props;
  }

  private handleEventProp(key: string, prop: Listener<unknown>) {
    const event = key.slice(2).toLowerCase();
    // @ts-ignore
    const cleanup = addEventListener(this.rootNode.nodes[0], event, prop);
    this.emitter.add(cleanup);
  }

  private handleRefProp(prop: Signal<unknown>) {
    prop.value = this.rootNode?.firstChild;
  }

  private handleUpdateProp(key: string, prop: any) {
    this.props[key] = isSignal(prop) ? prop.value : prop;
  }

  private handleStandardProp(key: string, prop: any) {
    const newValue = (this.proxyProps[key] ??= useSignal(prop));
    const track = this.getNodeTrack(key);
    track.cleanup = useEffect(() => {
      newValue.value = isFunction(prop) ? prop() : prop;
    });
  }
}
