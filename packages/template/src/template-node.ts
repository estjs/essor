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
import { createTemplate, isComponent } from './jsx-renderer';
import type { NodeTrack, Props } from '../types';

export class TemplateNode implements JSX.Element {
  private treeMap = new Map<number, Node>();
  private mounted = false;
  private nodes: Node[] = [];
  private trackMap = new Map<string, NodeTrack>();

  private bindValueKeys: string[] = [];

  constructor(
    public template: HTMLTemplateElement,
    public props?: Props,
    public key?: string,
  ) {
    this.key ||= props?.key as string;
  }

  addEventListener(): void {}
  removeEventListener(): void {}

  get firstChild(): Node | null {
    return this.nodes[0] ?? null;
  }

  // is mounted
  get isConnected(): boolean {
    return this.mounted;
  }
  parent: Node | null = null;
  mount(parent: Node, before?: Node | null): Node[] {
    this.parent = parent;
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
    const cloneNode = this.template.content.cloneNode(true);
    const firstChild = cloneNode.firstChild as HTMLElement | null;

    // handle svg
    if (firstChild?.hasAttribute?.('_svg_')) {
      firstChild.remove();
      firstChild?.childNodes.forEach(node => {
        (cloneNode as Element).append(node);
      });
    }

    // normalize node
    this.nodes = Array.from(cloneNode.childNodes);
    /**
     * init treeMap,translate dom tree to:
     *   0: div
     *   1: span
     *   2: text
     */
    this.mapNodeTree(parent, cloneNode);
    // insert clone node to parent
    insertChild(parent, cloneNode, before);
    // patch
    this.patchProps(this.props);
    this.mounted = true;
    return this.nodes;
  }

  // unmount just run in patch
  unmount(): void {
    this.trackMap.forEach(track => {
      track.cleanup?.();
      track.lastNodes?.forEach(node => {
        if (track.isRoot) {
          removeChild(node);
        } else if (node instanceof TemplateNode) {
          node.unmount();
        }
      });
    });
    this.trackMap.clear();
    this.treeMap.clear();
    this.nodes.forEach(node => removeChild(node));
    this.nodes = [];
    this.mounted = false;
  }

  /**
   * Patch the nodes of the template node.
   * It will iterate the props and patch the node in the treeMap.
   * If the index of the prop is 0, it will patch the root node.
   * @param props The props to patch.
   */
  patchProps(props: Record<string, Record<string, unknown>> | undefined): void {
    if (!props) return;
    Object.entries(props).forEach(([key, value]) => {
      const index = Number(key);
      // get node in treeMap
      const node = this.treeMap.get(index);
      if (node) {
        this.patchProp(key, node, value, index === 0);
      }
    });
    this.props = props;
  }

  inheritNode(node: TemplateNode): void {
    // update node info in other patch node
    this.mounted = node.mounted;
    this.nodes = node.nodes;
    this.trackMap = node.trackMap;
    this.treeMap = node.treeMap;
    const props = this.props;
    this.props = node.props;
    // run patch
    this.patchProps(props);
  }
  /**
   * Maps the nodes in the given tree to a map of index to Node.
   * @param parent The parent node of the tree.
   * @param tree The tree to map.
   * @remarks
   * In SSR mode, the parent node is not included in the map,
   * since it is not part of the rendered tree.
   * In non-SSR mode, the parent node is included in the map,
   * since it is part of the rendered tree.
   */

  mapNodeTree(parent: Node, tree: Node): void {
    const ssr = renderContext.isSSR;
    // ssr node start with 0
    // client node start with 1
    let index = ssr ? 0 : 1;
    // ssr node has parent, not set in treeMap
    if (!ssr) this.treeMap.set(0, parent);

    // loop the tree
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
    // ssr must be `renderToString` in root, parent is dom tree.
    walk(ssr ? parent : tree);
  }

  /**
   * Get a NodeTrack from the trackMap. If the track is not in the trackMap, create a new one.
   * Then, call the cleanup function to remove any previously registered hooks.
   * @param trackKey the key of the node track to get.
   * @param trackLastNodes if true, the track will record the last nodes it has rendered.
   * @param isRoot if true, the track will be treated as a root track.
   * @returns the NodeTrack, cleaned up and ready to use.
   */
  getNodeTrack(trackKey: string, trackLastNodes?: boolean, isRoot?: boolean): NodeTrack {
    let track = this.trackMap.get(trackKey);
    if (!track) {
      track = { cleanup: () => {} };
      if (trackLastNodes) {
        track.lastNodes = new Map();
      }
      if (isRoot) {
        track.isRoot = true;
      }
      this.trackMap.set(trackKey, track);
    }
    track.cleanup?.();
    return track;
  }
  patchProp(key, node, props, isRoot) {
    for (const attr in props) {
      if (attr === 'children' && props.children) {
        if (!isArray(props.children)) {
          const trackKey = `${key}:${attr}:${0}`;
          // generate track
          const track = this.getNodeTrack(trackKey, true, isRoot);
          // patch child
          patchChild(track, node, props.children, null);
        } else {
          props.children.filter(Boolean).forEach((item, index) => {
            const [child, path] = isArray(item) ? item : [item, null];
            // get before node in treeMap
            const before = isNil(path) ? null : (this.treeMap.get(path) ?? null);
            const trackKey = `${key}:${attr}:${index}`;
            // generate track
            const track = this.getNodeTrack(trackKey, true, isRoot);
            patchChild(track, node, child, before);
          });
        }
      } else if (attr === 'ref') {
        // just support useRef
        props[attr].value = node;
      }
      // handle events
      else if (startsWith(attr, 'on')) {
        const eventName = attr.slice(2).toLocaleLowerCase();
        const track = this.getNodeTrack(`${key}:${attr}`);
        const listener = props[attr];
        track.cleanup = addEventListener(node, eventName, listener);
        // attr
      } else {
        const updateKey = `update${capitalizeFirstLetter(attr)}`;

        // get bindXxxx key, set in bindValueKeys
        if (props[updateKey]) {
          this.bindValueKeys.push(updateKey);
        }

        // if has bind key, break
        if (this.bindValueKeys.includes(attr)) {
          break;
        }

        const track = this.getNodeTrack(`${key}:${attr}`);

        const val = props[attr];
        // handle signal value to trigger
        const triggerValue = isSignal(val) ? val : useSignal(val);
        patchAttribute(track, node, attr, triggerValue.value);
        // value changed to trigger
        const cleanup = useEffect(() => {
          triggerValue.value = isSignal(val) ? val.value : val;
          patchAttribute(track, node, attr, triggerValue.value);
        });

        let cleanupBind;
        // handle bind value
        if (props[updateKey] && !isComponent(attr)) {
          cleanupBind = bindNode(node, value => {
            props[updateKey](value);
          });
        }

        track.cleanup = () => {
          cleanup && cleanup();
          cleanupBind && cleanupBind();
        };
      }
    }
  }
}

/**
 * Patch the children of the parent node.
 * If the child is a function, it will call the function and patch the returned nodes.
 * If the child is not a function, it will patch each node in the child array.
 * @param track The track to store the cleanup function.
 * @param parent The parent node.
 * @param child The child to patch.
 * @param before The node before which the children should be inserted.
 */
function patchChild(track: NodeTrack, parent: Node, child: unknown, before: Node | null): void {
  if (isFunction(child)) {
    track.cleanup = useEffect(() => {
      const nextNodes = coerceArray((child as Function)()).map(coerceNode);
      // the process of hydrating,not change dom
      if (!renderContext.isSSR) {
        track.lastNodes = patchChildren(parent, track.lastNodes!, nextNodes, before);
      }
    });
  } else {
    coerceArray(child).forEach((node, i) => {
      const newNode = coerceNode(node);
      // the process of hydrating,not change dom
      if (!renderContext.isSSR) {
        track.lastNodes!.set(String(i), newNode);
        insertChild(parent, newNode, before);
      }
    });
  }
}

/**
 * Patch an attribute of a node.
 * If the data is a function, it will be called when the attribute is updated.
 * @param track The track of the node.
 * @param node The node to patch.
 * @param attr The attribute to patch.
 * @param data The data to patch.
 */
function patchAttribute(track: NodeTrack, node: Node, attr: string, data: unknown): void {
  const element = node as HTMLElement;
  if (!element.setAttribute) {
    return;
  }
  if (isFunction(data)) {
    track.cleanup = useEffect(() => {
      setAttribute(element, attr, data());
    });
  } else {
    setAttribute(element, attr, data);
  }
}
