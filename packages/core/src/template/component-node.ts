import { isFunction } from 'essor-shared';
import { signalObject } from '../signal';
import { type Signal, useEffect, useSignal } from '../signal';
import { isSignal } from '../signal/signal';
import { addEventListener } from './utils';
import type { EssorComponent, NodeTrack } from '../../types';
import type { TemplateNode } from './template-node';
import type { Listener } from './utils';
export type Hook = 'mounted' | 'destroy';

export class ComponentNode implements JSX.Element {
  constructor(
    public template: EssorComponent,
    public props: Record<string, unknown>,
    public key?: string,
  ) {
    this.proxyProps = signalObject(props);
  }
  addEventListener(): void {}
  removeEventListener(): void {}

  static ref: ComponentNode | null = null;
  static context: Record<symbol, Signal<any>> = {};
  id?: string;
  private proxyProps: Record<string, Signal<any>> = {};
  context: Record<symbol | string | number, any> = {};
  emitter = new Set<Function>();
  mounted = false;
  rootNode: TemplateNode | null = null;
  hooks: Record<Hook, Set<() => void>> = {
    mounted: new Set(),
    destroy: new Set(),
  };
  private trackMap = new Map<string, NodeTrack>();
  get firstChild(): Node | null {
    return this.rootNode?.firstChild ?? null;
  }

  get isConnected(): boolean {
    return this.rootNode?.isConnected ?? false;
  }

  addHook(hook: Hook, cb: () => void): void {
    this.hooks[hook]?.add(cb);
  }

  getContext<T>(context: symbol | string | number): T | undefined {
    return ComponentNode.context[context];
  }

  setContext<T>(context: symbol | string | number, value: T): void {
    ComponentNode.context[context] = value;
  }

  inheritNode(node: ComponentNode): void {
    this.context = node.context;
    this.hooks = node.hooks;

    Object.assign(this.proxyProps, node.proxyProps);
    this.rootNode = node.rootNode;
    this.trackMap = node.trackMap;

    // patch props
    const props = this.props;
    this.props = node.props;

    this.patchProps(props);
  }

  unmount(): void {
    this.hooks.destroy.forEach(handler => handler());
    Object.values(this.hooks).forEach(set => set.clear());
    this.rootNode?.unmount();
    this.rootNode = null;
    this.proxyProps = {};
    this.mounted = false;
    this.emitter.forEach(emitter => emitter());
    ComponentNode.context = {};
  }

  mount(parent: Node, before?: Node | null): Node[] {
    if (!isFunction(this.template)) {
      throw new Error('Template must be a function');
    }
    if (this.isConnected) {
      return this.rootNode?.mount(parent, before) ?? [];
    }

    ComponentNode.ref = this;
    this.rootNode = this.template(this.proxyProps);
    ComponentNode.ref = null;
    this.mounted = true;
    const mountedNode = this.rootNode?.mount(parent, before) ?? [];
    this.hooks.mounted.forEach(handler => handler());
    this.patchProps(this.props);

    return mountedNode;
  }
  private getNodeTrack(trackKey: string, suppressCleanupCall?: boolean): NodeTrack {
    let track = this.trackMap.get(trackKey);
    if (!track) {
      track = { cleanup: () => {} };
      this.trackMap.set(trackKey, track);
    }
    if (!suppressCleanupCall) {
      track.cleanup();
    }
    return track;
  }

  patchProps(props: Record<string, any>) {
    for (const [key, prop] of Object.entries(props)) {
      if (key.indexOf('on') === 0 && this.rootNode?.nodes) {
        const event = key.slice(2).toLowerCase();
        const listener = prop as Listener<unknown>;
        const cleanup = addEventListener(this.rootNode.nodes[0], event, listener);
        this.emitter.add(cleanup);
      } else if (key === 'ref') {
        if (isSignal(prop)) {
          (props[key] as any).value = this.rootNode?.nodes[0];
        } else if (isFunction(prop)) {
          (props[key] as Function)(this.rootNode?.nodes[0]);
        }
      } else {
        if (key.indexOf('update:') !== 0) {
          return;
        }
        const newValue = (this.proxyProps[key] ??= useSignal(prop));
        const track = this.getNodeTrack(key);
        track.cleanup = useEffect(() => {
          newValue.value = prop;
        });
      }
    }
    this.props = props;
  }
}
