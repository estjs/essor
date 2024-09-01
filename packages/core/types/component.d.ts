export interface Output<T> {
  (value: T): void;
  type: 'output';
}

export type EssorComponent = (props: Record<string, unknown>) => JSX.Element | TemplateNode;

export interface NodeTrack {
  cleanup: () => void;
  isRoot?: boolean;
  lastNodes?: Map<string, Node | JSX.Element>;
}
export type Hook = 'mounted' | 'destroy';
export interface NodeTrack {
  cleanup: () => void;
  isRoot?: boolean;
  lastNodes?: Map<string, Node | JSX.Element>;
}
