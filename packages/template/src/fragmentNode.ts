import { insertChild } from './utils';
import { TemplateNode } from './templateNode';
import { renderContext } from './sharedConfig';
import { createTemplate } from './jsxRenderer';
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

    this.props = Object.keys(this.props as any).reduce((rcc, key) => {
      rcc[+key + 1] = this.props![key];
      return rcc;
    }, {});

    const cloneNode = createTemplate(
      `<div class="fragment-node">${this.template}</div>`,
    ).content.cloneNode(true);

    this.nodes = Array.from(cloneNode.childNodes);
    const childrenNodes = Array.from(this.nodes[0].childNodes) as Node[];

    if (renderContext.isSSR) {
      this.mapSSGNodeTree(parent as HTMLElement);
    } else {
      this.mapNodeTree(parent, cloneNode);
    }

    insertChild(parent, this.nodes[0], before);
    this.patchProps(this.props);
    this.mounted = true;

    return childrenNodes;
  }
}
