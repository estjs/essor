import { coerceArray, isArray, isFunction, isNil, startsWith } from 'essor-shared';
import { useEffect, useSignal } from '../signal';
import { isSignal } from '../signal/signal';
import { capitalizeFirstLetter } from './../../../shared/src/name';
import { binNode, coerceNode, insertChild, removeChild, setAttribute } from './utils';
import { patchChildren } from './patch';
import type { NodeTrack } from '../../types';

export class TemplateNode implements JSX.Element {
  treeMap = new Map<number, Node>();
  constructor(
    public template: HTMLTemplateElement,
    public props: Record<string, unknown>,
    public key?: string,
  ) {}

  mounted = false;
  nodes: Node[] = [];
  provides: Record<string, unknown> = {};
  trackMap = new Map<string, NodeTrack>();

  get firstChild(): Node | null {
    return this.nodes[0] ?? null;
  }

  get isConnected(): boolean {
    return this.mounted;
  }
  addEventListener(): void {}
  removeEventListener(): void {}

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

  parent: Node | null = null;
  mount(parent: Node, before?: Node | null): Node[] {
    this.parent = parent;
    if (this.isConnected) {
      this.nodes.forEach(node => insertChild(parent, node, before));
      return this.nodes;
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
    this.mapNodeTree(parent, cloneNode);

    insertChild(parent, cloneNode, before);

    this.patchNodes(this.props);
    this.mounted = true;
    return this.nodes;
  }

  mapNodeTree(parent: Node, tree: Node) {
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

  patchNodes(props) {
    for (const key in props) {
      const index = Number(key);
      const node = this.treeMap.get(index);
      if (node) {
        const value = this.props[key];
        this.patchNode(key, node, value, index === 0);
      }
    }
    this.props = props;
  }

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

  inheritNode(node: TemplateNode): void {
    this.mounted = node.mounted;
    this.nodes = node.nodes;
    this.trackMap = node.trackMap;
    this.treeMap = node.treeMap;

    const props = this.props;
    this.props = node.props;
    this.patchNodes(props);
  }

  patchNode(key, node, props, isRoot) {
    for (const attr in props) {
      if (attr === 'children' && props.children) {
        if (!isArray(props.children)) {
          const trackKey = `${key}:${attr}:${0}`;
          const track = this.getNodeTrack(trackKey, true, isRoot);
          patchChild(track, node, props.children, null);
        } else {
          props.children.forEach((item, index) => {
            if (!item) {
              return;
            }
            const [child, path] = isArray(item) ? item : [item, null];
            const before = isNil(path) ? null : this.treeMap.get(path) ?? null;
            const trackKey = `${key}:${attr}:${index}`;
            const track = this.getNodeTrack(trackKey, true, isRoot);
            patchChild(track, node, child, before);
          });
        }
      } else if (attr === 'ref') {
        if (isSignal(props[attr])) {
          props[attr].value = node;
        } else if (isFunction(props[attr])) {
          (props[attr] as Function)(node);
        }
      } else {
        // ignore update
        if (startsWith(attr, 'update:')) {
          return;
        }
        const track = this.getNodeTrack(`${key}:${attr}`);
        const val = props[attr];
        const triggerValue = isSignal(val) ? val : useSignal(val);

        const cleanup = useEffect(() => {
          triggerValue.value = isSignal(val) ? val.value : val;
          patchAttribute(track, node, attr, triggerValue.value);
        });

        let cleanupBind;
        const updateKey = `update${capitalizeFirstLetter(attr)}`;
        if (props[updateKey]) {
          cleanupBind = binNode(node, value => {
            props[updateKey](value);
          });
        }

        track.cleanup = () => {
          cleanup?.();
          cleanupBind && cleanupBind();
        };
      }
    }
  }
}

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

function patchChild(track: NodeTrack, parent: Node, child: unknown, before: Node | null): void {
  if (isFunction(child)) {
    track.cleanup = useEffect(() => {
      const nextNodes = coerceArray((child as Function)()).map(coerceNode);
      track.lastNodes = patchChildren(parent, track.lastNodes!, nextNodes, before);
    });
  } else {
    coerceArray(child).forEach((node, i) => {
      const newNode = coerceNode(node);
      track.lastNodes!.set(String(i), newNode);
      insertChild(parent, newNode, before);
    });
  }
}
