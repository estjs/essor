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

let componentIndex = 1;
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
    if (this.isConnected) {
      this.nodes.forEach(node => insertChild(parent, node, before));
      return this.nodes;
    }

    if (isArray(this.template)) {
      this.template = createTemplate(this.template.join(''));
    }

    const cloneNode = this.template.content.cloneNode(true);
    const firstChild = cloneNode.firstChild as HTMLElement | null;

    if (firstChild?.hasAttribute?.('_svg_')) {
      firstChild.remove();
      firstChild?.childNodes.forEach(node => {
        (cloneNode as Element).append(node);
      });
    }

    this.nodes = Array.from(cloneNode.childNodes);

    if (renderContext.isSSR) {
      this.mapSSGNodeTree(parent as HTMLElement);
    } else {
      this.mapNodeTree(parent, cloneNode);
      insertChild(parent, cloneNode, before);
    }

    this.patchProps(this.props);
    this.mounted = true;
    return this.nodes;
  }

  unmount(): void {
    this.trackMap.forEach(track => {
      track.cleanup?.();
    });
    this.trackMap.clear();
    this.treeMap.clear();
    this.nodes.forEach(node => removeChild(node));
    this.nodes = [];
    this.mounted = false;
  }

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
    // update props
    const props = this.props;
    this.props = node.props;
    // run patch
    this.patchProps(props);
  }

  mapSSGNodeTree(parent: Node): void {
    this.treeMap.set(0, parent);

    const walk = (node: Node) => {
      if (node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
        if (node.nodeType === Node.COMMENT_NODE) {
          if (node.textContent?.startsWith('__text__')) {
            const [index, textKey] = node.textContent.replace('__text__', '').split('-');
            if (+index === componentIndex) {
              const textNode = node.nextSibling as Text;
              this.treeMap.set(+textKey, textNode);
            }
          }
        } else if (node.nodeType !== Node.TEXT_NODE) {
          const [index, keyAttr] = (node as HTMLElement)?.getAttribute('__key')?.split('-') || [];
          if (keyAttr && +index === componentIndex) {
            this.treeMap.set(+keyAttr, node);
          }
        }
      }
      let child = node.firstChild;
      while (child) {
        walk(child);
        child = child.nextSibling;
      }
    };

    walk(parent);

    componentIndex++;
  }

  mapNodeTree(parent: Node, tree: Node): void {
    let index = 1;
    this.treeMap.set(0, parent);
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
    walk(tree);
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
          const track = this.getNodeTrack(trackKey, true, isRoot);
          patchChild(track, node, props.children, null);
        } else {
          props.children.filter(Boolean).forEach((item, index) => {
            const [child, path] = isArray(item) ? item : [item, null];
            const before = isNil(path) ? null : (this.treeMap.get(path) ?? null);
            const trackKey = `${key}:${attr}:${index}`;
            const track = this.getNodeTrack(trackKey, true, isRoot);
            patchChild(track, node, child, before);
          });
        }
      } else if (attr === 'ref') {
        props[attr].value = node;
      } else if (startsWith(attr, 'on')) {
        const eventName = attr.slice(2).toLocaleLowerCase();
        const track = this.getNodeTrack(`${key}:${attr}`);
        const listener = props[attr];
        track.cleanup = addEventListener(node, eventName, listener);
      } else {
        const updateKey = `update${capitalizeFirstLetter(attr)}`;
        if (this.bindValueKeys.includes(attr)) {
          break;
        }
        if (props[updateKey]) {
          this.bindValueKeys.push(updateKey);
        }
        const track = this.getNodeTrack(`${key}:${attr}`);
        const val = props[attr];
        const triggerValue = isSignal(val) ? val : useSignal(val);
        patchAttribute(track, node, attr, triggerValue.value);
        const cleanup = useEffect(() => {
          triggerValue.value = isSignal(val) ? val.value : val;
          patchAttribute(track, node, attr, triggerValue.value);
        });

        let cleanupBind;
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
      const nextNodes = coerceArray((child as Function)()).map(coerceNode) as Node[];
      if (!renderContext.isSSR) {
        track.lastNodes = patchChildren(parent, track.lastNodes!, nextNodes, before);
      }
    });
  } else {
    coerceArray(child).forEach((node, i) => {
      const newNode = coerceNode(node) as Node;
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
