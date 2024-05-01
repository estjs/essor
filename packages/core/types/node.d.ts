import type { EssorComponent } from './component';

export interface EssorNode<P = any> {
  props: P;
  id?: string;
  template: EssorComponent | HTMLTemplateElement;

  get firstChild(): Node | null;
  get isConnected(): boolean;

  addEventListener(event: string, listener: any): void;
  removeEventListener(event: string, listener: any): void;
  inheritNode(node: ComponentNode): void;
  mount(parent: Node, before?: Node | null): Node[];
  unmount(): void;
}
