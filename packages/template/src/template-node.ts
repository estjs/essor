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
  coerceNode,
  extractSignal,
  insertChild,
  removeChild,
  setAttribute,
} from './utils';
import { patchChildren } from './patch';
import { renderContext } from './render-context';
import { createTemplate } from './jsx-renderer';
import type { NodeTrack, Props } from '../types';

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

  // is mounted
  get isConnected(): boolean {
    return this.mounted;
  }

  mount(parent: Node, before?: Node | null): Node[] {
    // if it mounted in the template, insert child
    if (this.isConnected) {
      this.nodes.forEach(node => insertChild(parent, node, before));
      return this.nodes;
    }

    //hack ssr compile node
    //if ssr template will compile to: ["<div>","<span>","</span>","</div>"]
    if (isArray(this.template)) {
      this.template = createTemplate(this.template.join(''));
    }

    // get clone node
    const cloneNode = this.cloneTemplateContent();

    // normalize node
    this.nodes = Array.from(cloneNode.childNodes);

    /**
     * init treeMap,translate dom tree to:
     *   0: div
     *   1: span
     *   2: text
     *
     */
    mapNodes(parent, cloneNode, this.treeMap);
    // insert clone node to parent
    insertChild(parent, cloneNode, before);
    this.patchNodes(this.props);
    this.mounted = true;
    return this.nodes;
  }

  // unmount just run in patch
  unmount(): void {
    // clear tracks
    this.trackMap.forEach(track => track.cleanup());
    this.trackMap.clear();
    this.treeMap.clear();
    // remove nodes
    this.nodes.forEach(removeChild);
    this.nodes = [];
    this.mounted = false;
  }

  patchNodes(props: Record<string, Record<string, unknown>> | undefined): void {
    if (!props) return;
    Object.entries(props).forEach(([key, value]) => {
      const index = Number(key);
      // get node in treeMap
      const node = this.treeMap.get(index);
      if (node) {
        this.patchNode(key, node, value, index === 0);
      }
    });
    this.props = props;
  }

  inheritNode(node: TemplateNode): void {
    // update node info in other patch node
    this.trackMap = node.trackMap;
    this.treeMap = node.treeMap;
    const props = this.props;
    this.props = node.props;
    // run patch
    this.patchNodes(props);
  }

  /**
   * Clone the template content.
   * It will also handle the <svg> content, remove the first child if it has _svg_ attribute.
   * @returns The cloned template content.
   */
  private cloneTemplateContent(): Node {
    const cloneNode = this.template.content.cloneNode(true);
    handleSvgContent(cloneNode);
    return cloneNode;
  }

  private patchNode(
    key: string,
    node: Node,
    props: Record<string, unknown>,
    isRoot: boolean,
  ): void {
    if (!props) return;

    Object.entries(props).forEach(([attr, value]) => {
      if (attr === 'children') {
        // patch children
        this.patchChildren(key, node, value, isRoot);
      } else if (attr === 'ref') {
        // ref must useSignal or useRef
        (value as { value: unknown }).value = node;
      } else if (startsWith(attr, 'on')) {
        // bind event
        handleEventProp(key, attr, value as EventListener, node, this.trackMap);
      } else {
        // patch attr
        patchAttribute(key, attr, value, props, node as HTMLElement, this.trackMap);
      }
    });
  }

  private patchChildren(key: string, node: Node, children: unknown, isRoot: boolean): void {
    if (!isArray(children)) {
      patchSingleChild(this.trackMap, key, node, children, isRoot);
    } else {
      patchMultipleChildren(this.trackMap, key, node, children);
    }
  }
}

// Utility functions
function patchSingleChild(
  trackMap: Map<string, NodeTrack>,
  key: string,
  node: Node,
  child: unknown,
  isRoot: boolean,
): void {
  const trackKey = `${key}:children:0`;
  const track = getNodeTrack(trackMap, trackKey, true, isRoot);
  patchChild(track, node, child, null);
}

function patchMultipleChildren(
  trackMap: Map<string, NodeTrack>,
  key: string,
  node: Node,
  children: unknown[],
): void {
  children.filter(Boolean).forEach((item, index) => {
    const [child, path] = isArray(item) ? item : [item, null];
    const before = isNil(path) ? null : (trackMap.get(path)?.lastNodes?.get(String(index)) ?? null);
    const trackKey = `${key}:children:${index}`;
    const track = getNodeTrack(trackMap, trackKey, true, false);
    patchChild(track, node, child, before as Node);
  });
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

/**
 * Handle the first child of the SVG content.
 * If the first child has the '_svg_' attribute, remove it and append its children to the parent.
 * @param cloneNode The cloned content of the template.
 */
function handleSvgContent(cloneNode: Node): void {
  const firstChild = cloneNode.firstChild as HTMLElement | null;
  if (firstChild?.hasAttribute?.('_svg_')) {
    firstChild.remove();
    firstChild.childNodes.forEach(node => cloneNode.appendChild(node));
  }
}

/**
 * Maps the nodes in the given tree to a map of index to Node.
 * @param parent The parent node of the tree.
 * @param tree The tree to map.
 * @param treeMap The map to store the nodes in.
 * @remarks
 * In SSR mode, the parent node is not included in the map,
 * since it is not part of the rendered tree.
 * In non-SSR mode, the parent node is included in the map,
 * since it is part of the rendered tree.
 */
function mapNodes(parent: Node, tree: Node, treeMap: Map<number, Node>): void {
  const ssr = renderContext.isSSR;
  // ssr node start with 0
  // client node start with 1
  let index = ssr ? 0 : 1;
  // ssr node has parent, not set in treeMap
  if (!ssr) treeMap.set(0, parent);

  // loop the tree
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
  // ssr must be `renderToString` in root, parent is dom tree.
  walk(ssr ? parent : tree);
}

// bind event
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

function patchAttribute(
  key: string,
  attr: string,
  value: unknown,
  props: Record<string, unknown>,
  element: HTMLElement,
  trackMap: Map<string, NodeTrack>,
): void {
  // not track u
  const track = getNodeTrack(trackMap, `${key}:${attr}`);
  const updateProp = props[`update${capitalizeFirstLetter(attr)}`];

  const triggerValue = isSignal(value) ? value : useSignal(value);
  // bind attr
  setAttribute(element, attr, triggerValue.value);
  // effect attr
  const cleanup = useEffect(() => {
    triggerValue.value = extractSignal(value);
    setAttribute(element, attr, triggerValue.value);

    // hack to bind:xxx
    /**
     * <input bind:value={xxx}></input>
     * to
     * <input value={xxx} updateValue={(value) => {xxx = value}}></input>
     */
    //  update function
    if (updateProp && isFunction(updateProp)) {
      (updateProp as Function)(triggerValue.value);
    }
  });

  track.cleanup = () => {
    cleanup();
  };
}

/**
 * Get a NodeTrack from the trackMap. If the track is not in the trackMap, create a new one.
 * Then, call the cleanup function to remove any previously registered hooks.
 * @param trackMap The map of tracks.
 * @param trackKey The key of the node track to get.
 * @param trackLastNodes Whether to track last nodes in the NodeTrack.
 * @param isRoot Whether the NodeTrack is for a root node.
 * @returns The NodeTrack, cleaned up and ready to use.
 */
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
