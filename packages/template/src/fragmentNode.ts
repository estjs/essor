import { insertChild, removeChild } from './utils';
import { TemplateNode } from './templateNode';
import { renderContext } from './sharedConfig';
import type { Props } from '../types';

export class FragmentNode extends TemplateNode {
  constructor(
    public template: any,
    public props?: Props,
    public key?: string,
  ) {
    super(template, props, key);
  }

  mount(parent: Node, before?: Node | null): Node[] {
    this.parent = parent;

    if (this.isConnected) {
      this.nodes.forEach(node => insertChild(parent, node, before));
      return this.nodes;
    }

    const fragment = this.template.content.cloneNode(true);
    this.nodes = Array.from(fragment.childNodes);

    if (renderContext.isSSR) {
      this.mapSSGNodeTree(parent as HTMLElement);
    } else {
      this.mapNodeTree(parent, fragment);
    }

    const tempFragment = document.createDocumentFragment();
    this.nodes.forEach(node => tempFragment.appendChild(node));
    insertChild(parent, tempFragment, before);

    this.patchProps(this.props);
    this.mounted = true;

    return this.nodes;
  }

  unmount(): void {
    // 清理所有追踪器和子节点
    this.trackMap.forEach(track => {
      // 清理子节点
      if (track.lastNodes) {
        track.lastNodes.forEach(node => {
          removeChild(node);
        });
      }
      // 清理追踪器
      track.cleanup && track.cleanup();
    });

    this.trackMap.clear();
    this.treeMap.clear();

    // 移除所有节点
    this.nodes.forEach(node => {
      removeChild(node);
    });

    this.nodes = [];
    this.mounted = false;
  }
}
