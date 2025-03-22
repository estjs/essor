import type { ComponentNode } from './componentNode';

export type LifecycleHook = () => void;

export type ComponentProps = Record<string, unknown>;

export type AnyNode = Node | JSX.Element | ComponentNode;

export type NodeOrComponent = Node | JSX.Element | ComponentNode;
// eslint-disable-next-line unused-imports/no-unused-vars, @typescript-eslint/no-wrapper-object-types
export interface InjectionKey<T> extends Symbol {}

export interface LifecycleContext {
  mounted: Set<LifecycleHook>;
  unmounted: Set<LifecycleHook>;
  updated: Set<LifecycleHook>;
}

export type RenderedNodeMap = Map<string, NodeOrComponent>;

export interface RenderContext extends LifecycleContext {
  renderedIndex: number;
  renderedNodes: Record<string | number, RenderedNodeMap>;
  cleanup: Set<() => void>;
  isMounted?: boolean;
  isUnmounted?: boolean;
  provides: Map<InjectionKey<unknown> | string, unknown>;
  parent: RenderContext | null;
}

export interface FragmentNode {
  childNodes: NodeListOf<ChildNode>;
  isConnected: boolean;
}
