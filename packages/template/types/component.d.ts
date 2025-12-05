export interface Output<T> {
  (value: T): void;
  type: 'output';
}

export type estComponent = (props: Record<string, unknown>) => JSX.Element | TemplateNode;

export interface NodeTrack {
  cleanup: () => void;
  isRoot?: boolean;
  lastNodes?: Map<string, Node | JSX.Element>;
}
export type Hook = 'mount' | 'destroy';
export interface NodeTrack {
  cleanup: () => void;
  isRoot?: boolean;
  lastNodes?: Map<string, Node | JSX.Element>;
}

export type Props = Record<string, any>;
type AnyNode = Node | JSX.Element;
