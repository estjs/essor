import type { TemplateNode } from '../src/template/template-node';
export interface Output<T> {
  (value: T): void;
  type: 'output';
}

export type EssorComponent = (props: Record<string, unknown>) => TemplateNode;
export interface NodeTrack {
  cleanup: () => void;
  isRoot?: boolean;
  lastNodes?: Map<string, Node | JSX.Element>;
}
export type Hook = 'destroy' | 'create' | 'mounted' | 'update';
export interface NodeTrack {
  cleanup: () => void;
  isRoot?: boolean;
  lastNodes?: Map<string, Node | JSX.Element>;
}
