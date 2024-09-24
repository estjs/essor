import {
  capitalizeFirstLetter,
  coerceArray,
  isArray,
  isFunction,
  isNil,
  startsWith,
} from '@estjs/shared';
import { isSignal, useEffect, useSignal } from '@estjs/signal';

import {
  addEventListener,
  bindNode,
  coerceNode,
  insertChild,
  removeChild,
  setAttribute,
} from '../utils';
import { patchChildren } from '../patch';
import { createTemplate } from '../factory';
import { isSSR } from '../render-config';
import type { NodeTrack, Props } from '../../types';

export class TemplateRender implements JSX.Element {
  private treeMap = new Map<number, Node>();
  private mounted = false;
  private nodes: Node[] = [];
  private trackMap = new Map<string, NodeTrack>();

  constructor(
    public template: HTMLTemplateElement,
    public props?: Props,
    public key?: string,
  ) {}
  addEventListener(): void {}
  removeEventListener(): void {}

  get firstChild(): Node | null {
    return this.nodes[0] ?? null;
  }

  get isConnected(): boolean {
    return this.mounted;
  }

  mount(parent: Node, before?: Node | null): Node[] {
    if (this.isConnected) {
      this.nodes.forEach(node => insertChild(parent, node, before));
      return this.nodes;
    }

    if (isArray(this.template)) {
      this.template = createTemplate(this.template.join(''));
    }

    const cloneNode = this.template.content.cloneNode(true);
    this.handleSvgContent(cloneNode);

    this.nodes = Array.from(cloneNode.childNodes);
    this.mapNodes(parent, cloneNode);

    insertChild(parent, cloneNode, before);

    this.patchNodes(this.props);
    this.mounted = true;
    return this.nodes;
  }

  unmount(): void {
    this.trackMap.forEach(track => track.cleanup());
    this.trackMap.clear();
    this.treeMap.clear();
    this.nodes.forEach(removeChild);
    this.nodes = [];
    this.mounted = false;
  }

  private handleSvgContent(cloneNode: Node): void {
    const firstChild = cloneNode.firstChild as HTMLElement | null;
    if (firstChild?.hasAttribute?.('_svg_')) {
      firstChild.remove();
      firstChild.childNodes.forEach(node => cloneNode.appendChild(node));
    }
  }

  private mapNodes(parent: Node, tree: Node): void {
    const ssr = isSSR();
    let index = ssr ? 0 : 1;
    if (!ssr) this.treeMap.set(0, parent);

    const walk = (node: Node) => {
      if (node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
        this.treeMap.set(index++, node);
      }
      let child = node.firstChild;

      while (child) {
        walk(child);
        child = child.nextSibling;
      }
    };
    walk(ssr ? parent : tree);
  }

  patchNodes(props: Record<string, Record<string, unknown>> | undefined): void {
    if (!props) return;
    for (const [key, value] of Object.entries(props)) {
      const index = Number(key);
      const node = this.treeMap.get(index);
      if (node) {
        this.patchNode(key, node, value, index === 0);
      }
    }
    this.props = props;
  }

  private getNodeTrack(trackKey: string, trackLastNodes = false, isRoot = false): NodeTrack {
    let track = this.trackMap.get(trackKey);
    if (!track) {
      track = { cleanup: () => {} };
      if (trackLastNodes) track.lastNodes = new Map();
      if (isRoot) track.isRoot = true;
      this.trackMap.set(trackKey, track);
    }
    track.cleanup();
    return track;
  }

  inheritNode(node: TemplateRender): void {
    this.trackMap = node.trackMap;
    this.treeMap = node.treeMap;
    const props = this.props;
    this.props = node.props;
    this.patchNodes(props);
  }

  private patchNode(
    key: string,
    node: Node,
    props: Record<string, unknown>,
    isRoot: boolean,
  ): void {
    if (props === null) return;

    for (const [attr, value] of Object.entries(props)) {
      if (attr === 'children' && value) {
        this.patchChildren(key, attr, node, value, isRoot);
      } else if (attr === 'ref') {
        (value as { value: unknown }).value = node;
      } else if (startsWith(attr, 'on')) {
        this.handleEventProp(key, attr, value as EventListener, node);
      } else if (!startsWith(attr, 'update')) {
        this.handleStandardProp(key, attr, value, props, node as HTMLElement);
      }
    }
  }

  private patchChildren(
    key: string,
    attr: string,
    node: Node,
    children: unknown,
    isRoot: boolean,
  ): void {
    if (!isArray(children)) {
      const trackKey = `${key}:${attr}:${0}`;
      const track = this.getNodeTrack(trackKey, true, isRoot);
      this.patchChild(track, node, children, null);
    } else {
      children.filter(Boolean).forEach((item, index) => {
        const [child, path] = isArray(item) ? item : [item, null];
        const before = isNil(path) ? null : (this.treeMap.get(path) ?? null);
        const trackKey = `${key}:${attr}:${index}`;
        const track = this.getNodeTrack(trackKey, true, isRoot);
        this.patchChild(track, node, child, before);
      });
    }
  }

  private handleEventProp(key: string, attr: string, listener: EventListener, node: Node): void {
    const eventName = attr.slice(2).toLowerCase();
    const track = this.getNodeTrack(`${key}:${attr}`);
    track.cleanup = addEventListener(node, eventName, listener);
  }

  private handleStandardProp(
    key: string,
    attr: string,
    value: unknown,
    props: Record<string, unknown>,
    element: HTMLElement,
  ): void {
    const track = this.getNodeTrack(`${key}:${attr}`);
    const triggerValue = isSignal(value) ? value : useSignal(value);
    setAttribute(element, attr, triggerValue.value);
    const cleanup = useEffect(() => {
      triggerValue.value = isSignal(value) ? value.value : value;
      setAttribute(element, attr, triggerValue.value);
    });
    const updateKey = `update${capitalizeFirstLetter(attr)}`;

    let cleanupBind;
    if (props?.[updateKey]) {
      cleanupBind = bindNode(element, (value: unknown) => {
        (props[updateKey] as (value: unknown) => void)(value);
      });
    }
    track.cleanup = () => {
      cleanup();
      cleanupBind?.();
    };
  }

  private patchChild(track: NodeTrack, parent: Node, child: unknown, before: Node | null): void {
    if (isFunction(child)) {
      track.cleanup = useEffect(() => {
        const nextNodes = coerceArray((child as Function)()).map(coerceNode);
        if (!isSSR()) {
          track.lastNodes = patchChildren(parent, track.lastNodes!, nextNodes, before);
        }
      });
    } else {
      coerceArray(child).forEach((node, i) => {
        const newNode = coerceNode(node);
        if (!isSSR()) {
          track.lastNodes!.set(String(i), newNode);
          insertChild(parent, newNode, before);
        }
      });
    }
  }
}
