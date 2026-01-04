import type { Computed, Signal } from '@estjs/signals';
import type { Component } from './component';

export type AnyNode =
  | Node
  | Component<any>
  | Element
  | string
  | number
  | boolean
  | null
  | undefined
  | AnyNode[]
  | (() => AnyNode)
  | Signal<AnyNode>
  | Computed<AnyNode>;
// Component props
export type ComponentProps = Record<string, unknown>;

export type ComponentFn<P = ComponentProps> = (props: P) => AnyNode;
