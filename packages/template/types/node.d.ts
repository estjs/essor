import type { aubeComponent } from './component';

export interface aubeNode<T = Record<string, any>> {
  props?: T;
  template: aubeComponent | HTMLTemplateElement;

  get firstChild(): Node | null;
  get isConnected(): boolean;

  addEventListener(event: string, listener: any): void;
  removeEventListener(event: string, listener: any): void;
  inheritNode(node: ComponentNode): void;
  mount(parent: Node, before?: Node | null): Node[];
  unmount(): void;
}
