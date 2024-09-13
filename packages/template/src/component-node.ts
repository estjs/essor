import { isFunction, startsWith } from '@estjs/shared';
import { isSignal, signalObject } from '@estjs/signal';
import { type Signal, useEffect, useReactive, useSignal } from '@estjs/signal';
import { addEventListener } from './utils';
import type { EssorComponent, NodeTrack } from '../types';
import type { TemplateNode } from './template-node';
import type { Listener } from './utils';
export type Hook = 'mounted' | 'destroy';

export class Hooks {
  addEventListener(): void {}
  removeEventListener(): void {}

  static ref: Hooks | null = null;
  static context: Record<symbol, Signal<any>> = {};

  hooks: Record<Hook, Set<() => void>> = {
    mounted: new Set(),
    destroy: new Set(),
  };

  addHook(hook: Hook, cb: () => void): void {
    this.hooks[hook]?.add(cb);
  }

  getContext<T>(context: symbol | string | number): T | undefined {
    return Hooks.context[context];
  }

  setContext<T>(context: symbol | string | number, value: T): void {
    Hooks.context[context] = value;
  }

  initRef() {
    Hooks.ref = this;
  }
  removeRef() {
    Hooks.ref = null;
  }
}

export class ComponentNode extends Hooks implements JSX.Element {
  constructor(
    public template: EssorComponent,
    public props: Record<string, any>,
    public key?: string,
  ) {
    super();
    this.proxyProps = signalObject(
      props,
      key => startsWith(key, 'on') || startsWith(key, 'update'),
    );

    this.key = this.key || props.key;
  }

  private proxyProps: Record<string, Signal<any>> = {};
  emitter = new Set<Function>();
  mounted = false;
  rootNode: TemplateNode | null = null;
  context: Record<symbol | string | number, any> = {};

  private trackMap = new Map<string, NodeTrack>();
  get firstChild(): Node | null {
    return this.rootNode?.firstChild ?? null;
  }

  get isConnected(): boolean {
    return this.rootNode?.isConnected ?? false;
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

  mount(parent: Node, before?: Node | null): Node[] {
    if (!isFunction(this.template)) {
      throw new Error('Template must be a function');
    }
    if (this.isConnected) {
      return this.rootNode?.mount(parent, before) ?? [];
    }

    this.initRef();
    this.rootNode = this.template(useReactive(this.proxyProps, ['children']));
    this.removeRef();
    this.mounted = true;

    const mountedNode = this.rootNode?.mount(parent, before) ?? [];
    this.hooks.mounted.forEach(handler => handler());
    this.patchProps(this.props);

    return mountedNode;
  }

  unmount(): void {
    this.hooks.destroy.forEach(handler => handler());
    Object.values(this.hooks).forEach(set => set.clear());
    this.rootNode?.unmount();
    this.rootNode = null;
    this.proxyProps = {};
    this.mounted = false;
    this.emitter.forEach(emitter => emitter());
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
      if (startsWith(key, 'on') && this.rootNode?.nodes) {
        const event = key.slice(2).toLowerCase();
        const listener = prop as Listener<unknown>;
        const cleanup = addEventListener(this.rootNode.nodes[0], event, listener);
        this.emitter.add(cleanup);
      } else if (key === 'ref') {
        (props[key] as Signal<unknown>).value = this.rootNode?.nodes[0];
      } else if (startsWith(key, 'update')) {
        props[key] = isSignal(prop) ? prop.value : prop;
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
