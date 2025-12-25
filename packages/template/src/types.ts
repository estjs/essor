import type { Component } from './component';

export type AnyNode = Node | Component;
// Component props
export type ComponentProps = Record<string, unknown>;

export type ComponentFn = (props?: ComponentProps) => Element;
