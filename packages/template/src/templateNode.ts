import {
  capitalize,
  coerceArray,
  isArray,
  isFunction,
  isHTMLElement,
  isNil,
  isPlainObject,
  startsWith,
} from '@estjs/shared';
import { effect, isSignal, shallowSignal } from '@estjs/signal';
import {
  addEventListener,
  bindNode,
  coerceNode,
  insertChild,
  removeChild,
  setAttribute,
} from './utils';
import { getKey, patchChildren } from './patch';
import {
  CHILDREN_PROP,
  ComponentType,
  EVENT_PREFIX,
  REF_KEY,
  UPDATE_PREFIX,
  getComponentIndex,
  renderContext,
} from './sharedConfig';
import { createTemplate } from './jsxRenderer';
import type { NodeTrack, Props } from '../types';

export class TemplateNode implements JSX.Element {
  protected treeMap = new Map<number, Node>();
  protected mounted = false;
  protected nodes: Node[] = [];
  protected trackMap = new Map<string, NodeTrack>();
  protected bindValueKeys: string[] = [];
  protected componentIndex: number;
  protected parent: Node | null = null;

  constructor(
    public template: HTMLTemplateElement,
    public props?: Props,
    public key?: string,
  ) {
    if (renderContext.isSSR) {
      this.componentIndex = getComponentIndex(this.template);
    }
  }

  get firstChild(): Node | null {
    return this.nodes[0] ?? null;
  }

  get isConnected(): boolean {
    return this.mounted;
  }

  addEventListener(): void {}
  removeEventListener(): void {}

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
      firstChild.childNodes.forEach(node => {
        (cloneNode as Element).append(node);
      });
    }

    this.nodes = Array.from(cloneNode.childNodes);

    if (renderContext.isSSR) {
      this.mapSSGNodeTree(parent as HTMLElement);
    } else {
      this.mapNodeTree(parent, cloneNode);
    }
    insertChild(parent, cloneNode, before);
    this.patchProps(this.props);
    this.mounted = true;
    return this.nodes;
  }

  unmount(): void {
    this.trackMap.forEach(track => {
      track.cleanup && track.cleanup();
    });
    this.trackMap.clear();
    this.treeMap.clear();
    this.nodes.forEach(node => removeChild(node));

    this.nodes = [];
    this.mounted = false;
  }

  inheritNode(node: TemplateNode): void {
    this.mounted = node.mounted;
    this.nodes = node.nodes;
    this.trackMap = node.trackMap;
    this.treeMap = node.treeMap;
    const props = this.props;
    this.props = node.props;
    this.patchProps(props);
  }

  protected mapSSGNodeTree(parent: Node): void {
    this.treeMap.set(0, parent);
    this.walkNodeTree(parent, this.handleSSGNode.bind(this));
  }

  // protected method to map node tree
  protected mapNodeTree(parent: Node, tree: Node): void {
    let index = 1;
    this.treeMap.set(0, parent);
    const arr = [parent];

    const handleNode = (node: Node) => {
      if (node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
        this.treeMap.set(index++, node);
        arr.push(node);
      }
    };

    this.walkNodeTree(tree, handleNode);
  }

  protected walkNodeTree(node: Node, handler: (node: Node) => void): void {
    if (node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
      handler(node);
    }
    let child = node.firstChild;
    while (child) {
      this.walkNodeTree(child, handler);
      child = child.nextSibling;
    }
  }

  protected handleSSGNode(node: Node): void {
    if (node.nodeType === Node.COMMENT_NODE) {
      const [type, index] = node.textContent?.split('-') || [];
      if (ComponentType.TEXT === +type && +index === this.componentIndex) {
        const textNode = node.nextSibling as Text;
        this.treeMap.set(+index, textNode);
      }
    } else if (node.nodeType !== Node.TEXT_NODE) {
      const { ci = '-1', hk } = (node as HTMLElement)?.dataset || {};
      if (hk && +ci === this.componentIndex) {
        this.treeMap.set(+hk, node);
      }
    }
  }

  protected patchProps(props: Record<string, Record<string, unknown>> | undefined): void {
    if (!props) return;

    Object.entries(props).forEach(([key, value]) => {
      const index = Number(key);
      const node = this.treeMap.get(index);
      if (node) {
        this.patchProp(key, node, value, index === 0);
      }
    });
    this.props = props;
  }

  protected patchProp(
    key: string,
    node: Node,
    props: Record<string, unknown>,
    isRoot: boolean,
  ): void {
    if (!props) return;
    Object.entries(props).forEach(([attr, value]) => {
      if (attr === CHILDREN_PROP && value) {
        this.patchChildren(key, node, value, isRoot);
      } else if (attr === REF_KEY) {
        (props[attr] as { value: Node }).value = node;
      } else if (startsWith(attr, EVENT_PREFIX)) {
        this.patchEventListener(key, node, attr, value as EventListener);
      } else {
        if (this.bindValueKeys.includes(attr)) return;
        const updateFn = this.getBindUpdateValue(props, key, attr);
        this.patchAttribute(key, node as HTMLElement, attr, value, updateFn);
      }
    });
  }

  protected getBindUpdateValue(props: Record<string, any>, key: string, attr: string) {
    const updateKey = `${UPDATE_PREFIX}${capitalize(attr)}`;
    if (updateKey && props[updateKey] && isFunction(props[updateKey])) {
      this.bindValueKeys.push(updateKey);
      return props[updateKey];
    }
  }

  protected patchChildren(key: string, node: Node, children: unknown, isRoot: boolean): void {
    if (!isArray(children)) {
      const trackKey = `${key}:${CHILDREN_PROP}:0`;
      const track = this.getNodeTrack(trackKey, true, isRoot);
      this.patchChild(track, node, children, null);
    } else {
      children.filter(Boolean).forEach((item, index) => {
        const [child, path] = isArray(item) ? item : [item, null];
        const before = isNil(path) ? null : (this.treeMap.get(path) ?? null);
        const trackKey = `${key}:${CHILDREN_PROP}:${index}`;
        const track = this.getNodeTrack(trackKey, true, isRoot);
        this.patchChild(track, node, child, before);
      });
    }
  }

  protected patchEventListener(
    key: string,
    node: Node,
    attr: string,
    listener: EventListener,
  ): void {
    const eventName = attr.slice(2).toLowerCase();
    const track = this.getNodeTrack(`${key}:${attr}`);
    track.cleanup = addEventListener(node, eventName, listener);
  }

  protected patchAttribute(
    key: string,
    element: HTMLElement,
    attr: string,
    value: unknown,
    updateFn?: Function,
  ): void {
    const track = this.getNodeTrack(`${key}:${attr}`);

    // Set the initial value
    const val = isFunction(value) ? value() : value;
    const triggerValue = isSignal(val) ? val : shallowSignal(val);
    setAttribute(element, attr, triggerValue.value);

    const cleanup = effect(() => {
      // triggger conditional expression
      const val2 = isFunction(value) ? value() : value;
      // TODO: class and style should be pure object
      if (
        isPlainObject(val2) &&
        isPlainObject(triggerValue.peek()) &&
        JSON.stringify(triggerValue.value) === JSON.stringify(val2)
      )
        return;

      triggerValue.value = isSignal(val2) ? val2.value : val2;
      setAttribute(element, attr, triggerValue.value);
    });

    let cleanupBind;
    if (updateFn && isHTMLElement(element)) {
      cleanupBind = bindNode(element, value => {
        updateFn(value);
      });
    }

    track.cleanup = () => {
      cleanup && cleanup();
      cleanupBind && cleanupBind();
    };
  }

  protected getNodeTrack(trackKey: string, trackLastNodes?: boolean, isRoot?: boolean): NodeTrack {
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
    track.cleanup && track.cleanup();
    return track;
  }

  protected patchChild(track: NodeTrack, parent: Node, child: unknown, before: Node | null): void {
    if (isFunction(child)) {
      track.cleanup = effect(() => {
        const nextNodes = coerceArray((child as Function)()).map(coerceNode) as Node[];
        if (renderContext.isSSR) {
          track.lastNodes = this.reconcileChildren(parent, nextNodes, before);
        } else {
          track.lastNodes = patchChildren(parent, track.lastNodes!, nextNodes, before);
        }
      });
    } else {
      coerceArray(child).forEach((node, index) => {
        const newNode = coerceNode(node) as Node;
        const key = getKey(newNode, index);

        if (renderContext.isSSR) {
          track.lastNodes = this.reconcileChildren(parent, [newNode], before);
        } else {
          track.lastNodes!.set(key, newNode);
          insertChild(parent, newNode, before);
        }
      });
    }
  }

  protected reconcileChildren(
    parent: Node,
    nextNodes: Node[],
    before: Node | null,
  ): Map<string, Node> {
    const result = new Map<string, Node>();

    const textNodes = Array.from(parent.childNodes).filter(
      node =>
        node.nodeType === Node.TEXT_NODE &&
        node.previousSibling?.nodeType === Node.COMMENT_NODE &&
        node.nextSibling?.nodeType === Node.COMMENT_NODE,
    );

    nextNodes.forEach((node, index) => {
      const key = getKey(node, index);
      if (node.nodeType === Node.TEXT_NODE) {
        textNodes.forEach(ne => {
          if (node.textContent === ne.textContent) {
            parent.replaceChild(node, ne);
          }
        });
      } else {
        insertChild(parent, node, before);
      }
      result.set(key, node);
    });
    return result;
  }
}
