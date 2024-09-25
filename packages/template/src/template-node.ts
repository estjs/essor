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
} from './utils';
import { patchChildren } from './patch';
import { renderContext } from './render-context';
import { createTemplate } from './jsx-renderer';
import type { NodeTrack, Props } from '../types';

function handleSvgContent(cloneNode: Node): void {
  const firstChild = cloneNode.firstChild as HTMLElement | null;
  if (firstChild?.hasAttribute?.('_svg_')) {
    firstChild.remove();
    firstChild.childNodes.forEach(node => cloneNode.appendChild(node));
  }
}

function mapNodes(parent: Node, tree: Node, treeMap: Map<number, Node>): void {
  const ssr = renderContext.isSSR;
  let index = ssr ? 0 : 1;
  if (!ssr) treeMap.set(0, parent);

  const walk = (node: Node) => {
    if (node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
      treeMap.set(index++, node);
    }
    let child = node.firstChild;

    while (child) {
      walk(child);
      child = child.nextSibling;
    }
  };
  walk(ssr ? parent : tree);
}

function handleEventProp(
  key: string,
  attr: string,
  listener: EventListener,
  node: Node,
  trackMap: Map<string, NodeTrack>,
): void {
  const eventName = attr.slice(2).toLowerCase();
  const track = getNodeTrack(trackMap, `${key}:${attr}`);
  track.cleanup = addEventListener(node, eventName, listener);
}

function handleStandardProp(
  key: string,
  attr: string,
  value: unknown,
  props: Record<string, unknown>,
  element: HTMLElement,
  trackMap: Map<string, NodeTrack>,
): void {
  const track = getNodeTrack(trackMap, `${key}:${attr}`);
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

function getNodeTrack(
  trackMap: Map<string, NodeTrack>,
  trackKey: string,
  trackLastNodes = false,
  isRoot = false,
): NodeTrack {
  let track = trackMap.get(trackKey);
  if (!track) {
    track = { cleanup: () => {} };
    if (trackLastNodes) track.lastNodes = new Map();
    if (isRoot) track.isRoot = true;
    trackMap.set(trackKey, track);
  }
  track.cleanup();
  return track;
}

export class TemplateNode implements JSX.Element {
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
    handleSvgContent(cloneNode);

    this.nodes = Array.from(cloneNode.childNodes);
    mapNodes(parent, cloneNode, this.treeMap);

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

  inheritNode(node: TemplateNode): void {
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
        handleEventProp(key, attr, value as EventListener, node, this.trackMap);
      } else if (!startsWith(attr, 'update')) {
        handleStandardProp(key, attr, value, props, node as HTMLElement, this.trackMap);
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
      const track = getNodeTrack(this.trackMap, trackKey, true, isRoot);
      patchChild(track, node, children, null);
    } else {
      children.filter(Boolean).forEach((item, index) => {
        const [child, path] = isArray(item) ? item : [item, null];
        const before = isNil(path) ? null : (this.treeMap.get(path) ?? null);
        const trackKey = `${key}:${attr}:${index}`;
        const track = getNodeTrack(this.trackMap, trackKey, true, isRoot);
        patchChild(track, node, child, before);
      });
    }
  }
}

function patchChild(track: NodeTrack, parent: Node, child: unknown, before: Node | null): void {
  if (isFunction(child)) {
    track.cleanup = useEffect(() => {
      const nextNodes = coerceArray((child as Function)()).map(coerceNode);
      if (!renderContext.isSSR) {
        track.lastNodes = patchChildren(parent, track.lastNodes!, nextNodes, before);
      }
    });
  } else {
    coerceArray(child).forEach((node, i) => {
      const newNode = coerceNode(node);
      if (!renderContext.isSSR) {
        track.lastNodes!.set(String(i), newNode);
        insertChild(parent, newNode, before);
      }
    });
  }
}
