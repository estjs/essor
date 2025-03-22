import type { estComponent } from './component';

export interface estNode<T = Record<string, any>> {
  props?: T;
  template: estComponent | HTMLTemplateElement;

  get firstChild(): Node | null;
  get isConnected(): boolean;

  addEventListener(event: string, listener: any): void;
  removeEventListener(event: string, listener: any): void;
  inheritNode(node: ComponentNode): void;
  mount(parent: Node, before?: Node | null): Node[];
  unmount(): void;
}
