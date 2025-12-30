import type { Component } from './component';

export type AnyNode =
  | Node
  | Component
  | Element
  | string
  | number
  | boolean
  | null
  | undefined
  | AnyNode[]
  | (() => AnyNode);
// Component props
export type ComponentProps = Record<string, unknown>;

export type ComponentFn = (props?: ComponentProps) => AnyNode;
